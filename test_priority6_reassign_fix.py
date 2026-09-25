"""Priority 6 fix: reassign a SIGNED case / recheck revert / doctor payout clawback.

v2 timing: reassignment never touches payouts. The original doctor's payout line
for a study stays ACTIVE until a DIFFERENT doctor re-signs that study and the case
completes; then it is clawed back (CLAWED_BACK original + CLAWBACK offset) and the
signer is paid. Doctor payout attribution is per study (signer of that study,
priced by study_index); the center is billed once per case.

Follows test_priority6_case_thread.py: minted JWTs (create_access_token), live HTTP
calls, DB assertions, fixture cleanup. Does NOT change any user passwords.
Invoices touched by fixtures are snapshotted and restored during cleanup. A third
doctor (C) is a temporary fixture (doctors + users row, no password) removed at the end.

Round 3 adds: completion notification only after billing commits (websocket
listener), reassign blocked up front under a locked billing period, and recheck
reopening only the requesting doctor's own studies. Lock tests lock/unlock the
current period through the admin API and always unlock it again in cleanup.
Close-out adds: studies.sequence_no from bodyParts upload order drives billing
study_index (legacy cases with NULL sequence_no keep created_at, id ordering),
and the reworded first-billing lock message.

API base defaults to the dev backend; override with RN_API_BASE, e.g.
  RN_API_BASE=http://127.0.0.1:8051/api python test_priority6_reassign_fix.py
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

sys.path.insert(0, ".")

from backend.app.database import SessionLocal
from backend.app.models import (
    UserDB,
    DoctorDB,
    CaseDB,
    StudyDB,
    StudyNotificationDB,
    ReportDB,
    ReportCommentDB,
    InvoiceDB,
    InvoiceLineItemDB,
)
from backend.app.security import create_access_token

BASE = os.getenv("RN_API_BASE", "http://127.0.0.1:8000/api")
PASS = 0
FAIL = 0
FIX = {"cases": [], "studies": [], "invoice_snap": {}, "preexisting_invoices": set(),
       "doctor_c": None, "user_c": None, "locked_by_test": None}


def ok(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS: {name}" + (f" — {detail}" if detail else ""))
    else:
        FAIL += 1
        print(f"  FAIL: {name}" + (f" — {detail}" if detail else ""))


def token_for(user: UserDB) -> str:
    return create_access_token(
        {"sub": str(user.id), "email": user.email, "role": user.role, "name": user.name}
    )


def api(method, path, token=None, body=None, expect=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            payload = json.loads(raw) if raw else None
            if expect is not None:
                ok(f"{method} {path} status", resp.status == expect, f"got {resp.status}")
            return resp.status, payload
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            payload = json.loads(raw) if raw else {"detail": raw}
        except Exception:
            payload = {"detail": raw}
        if expect is not None:
            ok(f"{method} {path} status", e.code == expect, f"got {e.code} body={payload}")
        return e.code, payload


# ---------------------------------------------------------------- DB helpers
def lines(db, case_id, party):
    db.expire_all()
    return (
        db.query(InvoiceLineItemDB)
        .join(InvoiceDB, InvoiceDB.id == InvoiceLineItemDB.invoice_id)
        .filter(InvoiceLineItemDB.case_id == case_id, InvoiceDB.party_type == party)
        .all()
    )


def st(li):
    return (li.status or "ACTIVE").upper()


def is_active(li):
    return st(li) == "ACTIVE" and li.amount > 0 and not li.offsets_line_item_id


def active_by_study(db, case_id):
    out = {}
    for li in lines(db, case_id, "doctor"):
        if is_active(li):
            out.setdefault(li.study_id, []).append((li.doctor_id, li.amount, li.study_index))
    return out


def active_doctors(db, case_id):
    return {d for v in active_by_study(db, case_id).values() for d, _a, _i in v}


def offsets(db, case_id):
    return [li for li in lines(db, case_id, "doctor") if li.offsets_line_item_id or st(li) == "CLAWBACK"]


def net_by_doctor(db, case_id):
    out = {}
    for li in lines(db, case_id, "doctor"):
        out[li.doctor_id] = out.get(li.doctor_id, 0) + int(li.amount)
    return out


def center_sig(db, case_id):
    cl = lines(db, case_id, "center")
    return (len(cl), sum(int(li.amount) for li in cl), sorted(li.id for li in cl))


def one_active_per_study(db, case_id, n):
    a = active_by_study(db, case_id)
    return len(a) == n and all(len(v) == 1 for v in a.values())


def invoice_totals_consistent(db, case_ids):
    db.expire_all()
    inv_ids = set()
    for c in case_ids:
        inv_ids |= {li.invoice_id for li in lines(db, c, "doctor") + lines(db, c, "center")}
    bad = []
    for iid in inv_ids:
        if iid in FIX["preexisting_invoices"]:
            continue  # pre-existing invoices may carry legacy totals
        inv = db.query(InvoiceDB).filter(InvoiceDB.id == iid).first()
        s = sum(int(li.amount) for li in db.query(InvoiceLineItemDB).filter(InvoiceLineItemDB.invoice_id == iid))
        if inv.total_amount != s:
            bad.append((iid, inv.total_amount, s))
    return bad


def snapshot_invoices(db, ids):
    for iid in ids:
        if iid in FIX["invoice_snap"]:
            continue
        inv = db.query(InvoiceDB).filter(InvoiceDB.id == iid).first()
        if inv:
            FIX["preexisting_invoices"].add(iid)
            FIX["invoice_snap"][iid] = (inv.total_amount, inv.linked_invoice_id, inv.updated_at)
        else:
            FIX["invoice_snap"][iid] = None


def cleanup(db):
    if FIX.get("locked_by_test"):
        try:
            from backend.app import billing as _b
            _b.unlock_billing_period(db, FIX["locked_by_test"], "p6fix-test-cleanup")
            db.commit()
        except Exception as e:  # pragma: no cover
            print("  WARN: could not unlock test period:", e)
            db.rollback()
        FIX["locked_by_test"] = None
    touched = set()
    for case_id in FIX["cases"]:
        touched |= {li.invoice_id for li in db.query(InvoiceLineItemDB).filter(InvoiceLineItemDB.case_id == case_id)}
        db.query(InvoiceLineItemDB).filter(InvoiceLineItemDB.case_id == case_id).delete(synchronize_session=False)
        db.query(ReportCommentDB).filter(ReportCommentDB.case_id == case_id).delete(synchronize_session=False)
    if FIX["studies"]:
        db.query(StudyNotificationDB).filter(StudyNotificationDB.study_id.in_(FIX["studies"])).delete(synchronize_session=False)
    for case_id in FIX["cases"]:
        db.query(StudyDB).filter(StudyDB.case_id == case_id).delete(synchronize_session=False)
        db.query(ReportDB).filter(ReportDB.id == case_id).delete(synchronize_session=False)
        db.query(CaseDB).filter(CaseDB.id == case_id).delete(synchronize_session=False)
    for iid in touched | set(FIX["invoice_snap"].keys()):
        inv = db.query(InvoiceDB).filter(InvoiceDB.id == iid).first()
        if not inv:
            continue
        snap = FIX["invoice_snap"].get(iid)
        if iid in FIX["preexisting_invoices"] and snap:
            inv.total_amount, inv.linked_invoice_id, inv.updated_at = snap
        elif db.query(InvoiceLineItemDB).filter(InvoiceLineItemDB.invoice_id == iid).count() == 0:
            db.delete(inv)  # invoice created only by these fixtures
    if FIX["user_c"]:
        db.query(UserDB).filter(UserDB.id == FIX["user_c"]).delete(synchronize_session=False)
    if FIX["doctor_c"]:
        db.query(DoctorDB).filter(DoctorDB.id == FIX["doctor_c"]).delete(synchronize_session=False)
    db.commit()


# ---------------------------------------------------------------- round 3 helpers
def ws_url():
    root = BASE.rsplit("/api", 1)[0]
    return root.replace("https://", "wss://", 1).replace("http://", "ws://", 1) + "/ws"


def ws_capture(fn, wait=1.5):
    """Open a /ws listener, run fn() (an HTTP call) while connected, collect events."""
    import asyncio
    import websockets

    async def run():
        got = []
        async with websockets.connect(ws_url()) as ws:
            await asyncio.sleep(0.3)
            res = await asyncio.to_thread(fn)
            try:
                while True:
                    got.append(json.loads(await asyncio.wait_for(ws.recv(), wait)))
            except asyncio.TimeoutError:
                pass
        return res, got

    return asyncio.run(run())


def completed_events(msgs, case_id):
    return [m for m in msgs if m.get("type") == "REPORT_COMPLETED"
            and ((m.get("report") or {}).get("id") == case_id)]


def _rowdict(obj):
    out = {}
    for attr in obj.__mapper__.column_attrs:
        v = getattr(obj, attr.key)
        out[attr.key] = json.loads(json.dumps(v, default=str)) if isinstance(v, (dict, list)) else v
    return out


def case_snapshot(db, case_id):
    """Every row the reassign/recheck endpoints could write, for before/after equality."""
    db.expire_all()
    q = lambda M, *f: sorted((_rowdict(r) for r in db.query(M).filter(*f).all()), key=lambda d: str(d.get("id")))
    sids = [s.id for s in db.query(StudyDB).filter(StudyDB.case_id == case_id)]
    return {
        "case": q(CaseDB, CaseDB.id == case_id),
        "report": q(ReportDB, ReportDB.id == case_id),
        "studies": q(StudyDB, StudyDB.case_id == case_id),
        "comments": q(ReportCommentDB, ReportCommentDB.case_id == case_id),
        "lines": q(InvoiceLineItemDB, InvoiceLineItemDB.case_id == case_id),
        "notifications": q(StudyNotificationDB, StudyNotificationDB.study_id.in_(sids)) if sids else [],
    }


# ---------------------------------------------------------------- fixtures
def make_case(db, tag, center, center_id, doc_id, doc_name, parts):
    stamp = int(time.time() * 1000)
    case_id = f"p6fix-{tag}-{stamp}"
    FIX["cases"].append(case_id)
    now = datetime.utcnow().isoformat() + "Z"
    common = dict(
        patient_number=f"P6F-{stamp}", full_name=f"P6 FIX {tag.upper()}", age=41, gender="Male",
        phone="9000000002", radiology_center_id=center_id, radiology_center_name=center.name,
        referring_physician_id="ref-p6f", referring_physician_name="DR REF P6F",
        status="In Review", is_urgent=False, study_date="25/09/2026", created_at=now,
    )
    db.add(CaseDB(id=case_id, metadata_={}, **common))
    db.add(ReportDB(id=case_id, assigned_doctor_id=doc_id, assigned_doctor_name=doc_name,
                    metadata_={"bodyParts": parts, "modality": "X-Ray"}, **common))
    sids = [f"{case_id}-s{i+1}" for i in range(len(parts))]
    for sid, bp in zip(sids, parts):
        db.add(StudyDB(id=sid, case_id=case_id, modality="X-Ray", body_part=bp, status="CLAIMED",
                       is_urgent=False, claimed_by=doc_id, claimed_by_name=doc_name,
                       created_at=now, report_status="PENDING", metadata_={}))
    FIX["studies"].extend(sids)
    db.commit()
    time.sleep(0.01)
    return case_id, sids


def main():
    db = SessionLocal()
    center = db.query(UserDB).filter(UserDB.role == "CENTER").first()
    doctors = db.query(UserDB).filter(UserDB.role == "DOCTOR").order_by(UserDB.id).all()
    admin = db.query(UserDB).filter(UserDB.role == "SUPER_ADMIN").first()
    assert center and len(doctors) >= 2 and admin
    doc_a, doc_b = doctors[0], doctors[1]
    a_id = (doc_a.metadata_ or {}).get("doctorId")
    b_id = (doc_b.metadata_ or {}).get("doctorId")
    center_id = (center.metadata_ or {}).get("centerId")
    assert a_id and b_id and center_id
    a_name = db.query(DoctorDB).filter(DoctorDB.id == a_id).first().full_name
    t_center, t_a, t_b, t_admin = token_for(center), token_for(doc_a), token_for(doc_b), token_for(admin)
    pw_before = {u.email: (u.metadata_ or {}).get("password") for u in (center, doc_a, doc_b, admin)}

    # Temporary third doctor C (fixture only; no password)
    stamp = int(time.time() * 1000)
    c_id = f"doc-p6fixc-{stamp}"
    db.add(DoctorDB(id=c_id, first_name="P6FIX", last_name="DOCTORC", full_name="DR. P6FIX DOCTOR C",
                    email=f"p6fix-c-{stamp}@example.invalid", username=None, contact_number="9000000003",
                    created_at="2026-09-25", metadata_={}))
    user_c = UserDB(email=f"p6fix-c-{stamp}@example.invalid", name="DR. P6FIX DOCTOR C", role="DOCTOR",
                    metadata_={"doctorId": c_id})
    db.add(user_c)
    db.commit()
    FIX["doctor_c"], FIX["user_c"] = c_id, user_c.id
    t_c = token_for(user_c)

    from backend.app import billing as billing_svc
    period = billing_svc.current_billing_period()
    snapshot_invoices(db, [
        f"inv-center-{center_id}-{period}",
        f"inv-doctor-{a_id}-{period}",
        f"inv-doctor-{b_id}-{period}",
        f"inv-doctor-{c_id}-{period}",
    ])

    def sign(case_id, sid, tok, text, expect=200):
        return api("POST", f"/reports/{case_id}/studies/{sid}/sign", token=tok,
                   body={"findings": f"{text} findings", "impression": f"{text} impression",
                         "technique": "X-Ray"}, expect=expect)

    def sign_all(case_id, sids, tok, text):
        last = None
        for sid in sids:
            _c, last = sign(case_id, sid, tok, text)
        return last

    def reassign(case_id, to, reason="reassign"):
        return api("POST", f"/reports/{case_id}/flag-reassign", token=t_center,
                   body={"reason": reason, "toDoctorId": to}, expect=200)

    def case_status(case_id):
        db.expire_all()
        return db.query(CaseDB).filter(CaseDB.id == case_id).first().status

    def study_rows(case_id):
        db.expire_all()
        return db.query(StudyDB).filter(StudyDB.case_id == case_id).order_by(StudyDB.id).all()

    parts2 = ["CHEST PA/AP", "KNEE AP/LAT"]
    parts3 = ["CHEST PA/AP", "KNEE AP/LAT", "LUMBAR AP/LAT"]

    # ======================= Case 1: A signs, reassigned to B =================
    case1, s1 = make_case(db, "main", center, center_id, a_id, a_name, parts2)
    print(f"Fixture case={case1} A={a_id} B={b_id} C={c_id} center={center_id}")

    print("\n=== 1. Doctor A signs all studies ===")
    sign_all(case1, s1, t_a, "A")
    ok("case Completed", case_status(case1) == "Completed")
    c0 = center_sig(db, case1)
    ok("center billed once (2 lines, 45)", c0[0] == 2 and c0[1] == 45, str(c0[:2]))
    ok("A active payout", active_doctors(db, case1) == {a_id}, str(active_doctors(db, case1)))
    ok("A net 30", net_by_doctor(db, case1).get(a_id) == 30, str(net_by_doctor(db, case1)))

    print("\n=== 2. Reassign SIGNED case to B (no payout change) ===")
    api("POST", f"/reports/{case1}/flag-reassign", token=t_a, body={"reason": "x", "toDoctorId": b_id}, expect=403)
    code, r = reassign(case1, b_id, "Second opinion")
    ok("response caseStatus In Review", (r or {}).get("caseStatus") == "In Review")
    ok("response has no payoutClawbacks", not (r or {}).get("payoutClawbacks"), str((r or {}).get("payoutClawbacks")))
    ok("case In Review", case_status(case1) == "In Review")
    rows = study_rows(case1)
    ok("all studies claimed_by B", all(s.claimed_by == b_id for s in rows))
    ok("all studies DRAFT", all(s.report_status == "DRAFT" for s in rows))
    hist = [(s.metadata_ or {}).get("reportHistory") or [] for s in rows]
    ok("history snapshot preserves A signature",
       all(h and h[-1]["event"] == "REASSIGN" and h[-1]["signedBy"] == a_id and h[-1]["reportStatus"] == "SIGNED"
           for h in hist))
    ok("A lines still ACTIVE at reassign", active_doctors(db, case1) == {a_id} and one_active_per_study(db, case1, 2))
    ok("no CLAWBACK lines at reassign", offsets(db, case1) == [], str([li.id for li in offsets(db, case1)]))
    ok("A net still 30 at reassign", net_by_doctor(db, case1).get(a_id) == 30)
    ok("center unchanged after reassign", center_sig(db, case1) == c0)

    print("\n=== 2b. Idempotent reassign to B ===")
    reassign(case1, b_id, "Second opinion (again)")
    ok("still no CLAWBACK lines", offsets(db, case1) == [])

    print("\n=== 3. Doctor B opens + drafts (no 409) ===")
    api("GET", f"/reports/{case1}", token=t_b, expect=200)
    code, d = api("POST", f"/reports/{case1}/studies/{s1[0]}/draft", token=t_b,
                  body={"findings": "B draft findings", "impression": "B draft"}, expect=200)
    ok("draft reportStatus DRAFT", ((d or {}).get("study") or {}).get("reportStatus") == "DRAFT")
    api("POST", f"/reports/{case1}/studies/{s1[0]}/draft", token=t_a, body={"findings": "no"}, expect=403)
    code, _ = sign(case1, s1[0], t_b, "B")
    ok("mid-case (1 of 2 re-signed): A still ACTIVE, no offsets",
       active_doctors(db, case1) == {a_id} and offsets(db, case1) == [])

    print("\n=== 4. Doctor B signs -> clawback at sign-off ===")
    code, last = sign(case1, s1[1], t_b, "B")
    bill = (last or {}).get("billing") or {}
    dp = bill.get("doctorPayout") or {}
    ok("billing block: center skipped already_billed", bill.get("skipped") and bill.get("reason") == "already_billed", str(bill)[:200])
    ok("billing block: 2 clawbacks + 2 new lines", len(dp.get("clawedBack") or []) == 2 and len(dp.get("doctorLineIds") or []) == 2, str(dp)[:300])
    ok("case Completed again", case_status(case1) == "Completed")
    dl = lines(db, case1, "doctor")
    orig_a = [li for li in dl if li.doctor_id == a_id and not li.offsets_line_item_id]
    offs = offsets(db, case1)
    ok("A originals CLAWED_BACK", orig_a and all(st(li) == "CLAWED_BACK" for li in orig_a), str([st(li) for li in orig_a]))
    ok("A original amounts unchanged", sorted(li.amount for li in orig_a) == [10, 20])
    ok("offsets reference originals", sorted(li.offsets_line_item_id for li in offs) == sorted(li.id for li in orig_a))
    ok("offsets negative CLAWBACK", sorted(li.amount for li in offs) == [-20, -10] and all(st(li) == "CLAWBACK" for li in offs))
    ok("reason mentions new doctor", all("reassigned to" in (li.status_reason or "") for li in orig_a), orig_a[0].status_reason if orig_a else "")
    ok("only B active, one per study", active_doctors(db, case1) == {b_id} and one_active_per_study(db, case1, 2))
    nb = net_by_doctor(db, case1)
    ok("B net 30, A net 0", nb.get(b_id) == 30 and nb.get(a_id) == 0, str(nb))
    ok("center still exactly one charge", center_sig(db, case1) == c0)

    print("\n=== 4b. Idempotent finalize (re-sign completed case) ===")
    n_lines = len(lines(db, case1, "doctor"))
    code, again = sign(case1, s1[1], t_b, "B again")
    ok("re-sign: payout_already_active", ((again or {}).get("billing") or {}).get("doctorPayout", {}).get("reason") == "payout_already_active",
       str(((again or {}).get("billing") or {}).get("doctorPayout"))[:200])
    ok("re-sign: no new lines", len(lines(db, case1, "doctor")) == n_lines)
    ok("re-sign: center unchanged", center_sig(db, case1) == c0)

    print("\n=== 5. B -> A, A re-signs (B had signed, so B clawed back) ===")
    reassign(case1, a_id, "Back to A")
    ok("B still ACTIVE after reassign (deferred)", active_doctors(db, case1) == {b_id})
    sign_all(case1, s1, t_a, "A2")
    nb = net_by_doctor(db, case1)
    ok("only A active, one per study", active_doctors(db, case1) == {a_id} and one_active_per_study(db, case1, 2))
    ok("A net 30, B net 0", nb.get(a_id) == 30 and nb.get(b_id) == 0, str(nb))
    ok("center still unchanged", center_sig(db, case1) == c0)
    ok("history has 2 versions per study", all(len((s.metadata_ or {}).get("reportHistory") or []) == 2 for s in study_rows(case1)))

    print("\n=== 6. Recheck by same doctor (A) ===")
    api("POST", f"/reports/{case1}/recheck", token=t_b, body={"reason": "not mine"}, expect=403)
    code, rc = api("POST", f"/reports/{case1}/recheck", token=t_a, body={"reason": "Needs recheck"}, expect=200)
    ok("recheck caseStatus In Review", (rc or {}).get("caseStatus") == "In Review")
    ok("recheck comment kept", ((rc or {}).get("recheck") or {}).get("kind") == "RECHECK")
    ok("studies DRAFT after recheck", all(s.report_status == "DRAFT" for s in study_rows(case1)))
    ok("RECHECK snapshot", all(((s.metadata_ or {}).get("reportHistory") or [{}])[-1].get("event") == "RECHECK" for s in study_rows(case1)))
    ok("A payout kept active on recheck", active_doctors(db, case1) == {a_id})
    n_lines = len(lines(db, case1, "doctor"))
    sign_all(case1, s1, t_a, "A3")
    ok("case Completed after re-sign", case_status(case1) == "Completed")
    ok("same-doctor re-sign: no new lines", len(lines(db, case1, "doctor")) == n_lines)
    ok("center unchanged after recheck", center_sig(db, case1) == c0)

    print("\n=== 7. Recheck then reassign to B: clawback deferred to B's sign-off ===")
    api("POST", f"/reports/{case1}/recheck", token=t_a, body={"reason": "Recheck again"}, expect=200)
    reassign(case1, b_id, "B to finish")
    ok("A still ACTIVE after recheck+reassign", active_doctors(db, case1) == {a_id})
    sign_all(case1, s1, t_b, "B2")
    nb = net_by_doctor(db, case1)
    ok("A clawed back at B sign-off; only B active", active_doctors(db, case1) == {b_id} and nb.get(a_id) == 0 and nb.get(b_id) == 30, str(nb))
    ok("center unchanged (final)", center_sig(db, case1) == c0)

    # ======================= Case 2: A -> B -> A, B never signs ==============
    print("\n=== 8. A -> B -> A (B never signs): no offsets at all ===")
    case2, s2 = make_case(db, "aba", center, center_id, a_id, a_name, parts2)
    sign_all(case2, s2, t_a, "A")
    a_line_ids = sorted(li.id for li in lines(db, case2, "doctor"))
    reassign(case2, b_id, "to B")
    reassign(case2, a_id, "back to A")
    code, last = sign(case2, s2[0], t_a, "A again")
    code, last = sign(case2, s2[1], t_a, "A again")
    dp = ((last or {}).get("billing") or {}).get("doctorPayout") or {}
    ok("A re-sign: payout_already_active", dp.get("reason") == "payout_already_active", str(dp)[:200])
    ok("no CLAWBACK/offset lines", offsets(db, case2) == [])
    dl2 = lines(db, case2, "doctor")
    ok("A's lines untouched (same ids, ACTIVE, no reason)",
       sorted(li.id for li in dl2) == a_line_ids and all(st(li) == "ACTIVE" and not li.status_reason for li in dl2))
    ok("A net 30", net_by_doctor(db, case2) == {a_id: 30}, str(net_by_doctor(db, case2)))

    # ======================= Case 3: A -> B -> C, B never signs ==============
    print("\n=== 9. A -> B -> C (B never signs): A ACTIVE until C signs ===")
    case3, s3 = make_case(db, "abc", center, center_id, a_id, a_name, parts2)
    sign_all(case3, s3, t_a, "A")
    c3 = center_sig(db, case3)
    reassign(case3, b_id, "to B")
    ok("after ->B: A ACTIVE, no offsets", active_doctors(db, case3) == {a_id} and offsets(db, case3) == [])
    reassign(case3, c_id, "to C")
    ok("after ->C: A ACTIVE, no offsets", active_doctors(db, case3) == {a_id} and offsets(db, case3) == [])
    ok("studies claimed by C", all(s.claimed_by == c_id for s in study_rows(case3)))
    sign(case3, s3[0], t_c, "C")
    ok("C signed 1 of 2: A still ACTIVE", active_doctors(db, case3) == {a_id} and offsets(db, case3) == [])
    sign(case3, s3[1], t_c, "C")
    nb = net_by_doctor(db, case3)
    ok("after C completes: only C active, one per study", active_doctors(db, case3) == {c_id} and one_active_per_study(db, case3, 2))
    ok("A clawed back (2 offsets), B never paid", len(offsets(db, case3)) == 2 and nb.get(a_id) == 0 and b_id not in nb and nb.get(c_id) == 30, str(nb))
    ok("center unchanged", center_sig(db, case3) == c3)

    # ======================= Case 4/5: mixed-signer completion ===============
    for a_index in (1, 2):
        print(f"\n=== 10.{a_index} Mixed signers: A signs study index {a_index} of 3, B the rest ===")
        case4, s4 = make_case(db, f"mix{a_index}", center, center_id, a_id, a_name, parts3)
        a_sid = s4[a_index - 1]
        sign(case4, a_sid, t_a, "A")
        code, r = reassign(case4, b_id, "partial reassign")
        rows = {s.id: s for s in study_rows(case4)}
        ok("A kept signed study", rows[a_sid].claimed_by == a_id and rows[a_sid].report_status == "SIGNED")
        ok("unsigned studies moved to B", all(rows[s].claimed_by == b_id for s in s4 if s != a_sid))
        ok("no payout lines before completion", lines(db, case4, "doctor") == [] and lines(db, case4, "center") == [])
        last = None
        for sid in s4:
            if sid != a_sid:
                _c, last = sign(case4, sid, t_b, "B")
        bill = (last or {}).get("billing") or {}
        ok("completion billing created once", bool(bill.get("billingEventId")) and not bill.get("skipped"), str(bill)[:200])
        ok("case Completed", case_status(case4) == "Completed")
        cs = center_sig(db, case4)
        ok("center billed exactly once: 3 lines, 60", cs[0] == 3 and cs[1] == 60, str(cs[:2]))
        dl4 = lines(db, case4, "doctor")
        by_idx = {li.study_index: (li.doctor_id, li.amount, st(li)) for li in dl4}
        exp = {i: ((a_id if i == a_index else b_id), (20 if i == 1 else 10), "ACTIVE") for i in (1, 2, 3)}
        ok("per-study attribution + index pricing", by_idx == exp and len(dl4) == 3, str(by_idx))
        nb = net_by_doctor(db, case4)
        ok("doctor total 40 split per signer", sum(nb.values()) == 40 and nb.get(a_id) == (20 if a_index == 1 else 10), str(nb))
        ok("no CLAWBACK lines", offsets(db, case4) == [])
        a_line = next(li for li in dl4 if li.doctor_id == a_id)
        ok("A line paired with its center line", a_line.paired_line_item_id == next(li.id for li in lines(db, case4, "center") if li.study_index == a_index))
        code, again = sign(case4, s4[-1] if s4[-1] != a_sid else s4[0], t_b, "B again")
        ok("idempotent re-sign: no new lines", len(lines(db, case4, "doctor")) == 3 and center_sig(db, case4) == cs)


    # ======================= Round 3: FIX 1/2/3 ================================
    lock_label = billing_svc.period_label(period)
    db.expire_all()
    ok("period starts unlocked (test precondition)", not billing_svc.is_period_locked(db, period))

    def lock():
        code, r = api("POST", "/billing/lock-period", token=t_admin, body={"period": period}, expect=200)
        FIX["locked_by_test"] = period
        return r

    def unlock():
        code, r = api("POST", "/billing/lock-period", token=t_admin, body={"period": period, "unlock": True}, expect=200)
        FIX["locked_by_test"] = None
        return r

    def sign_raw(case_id, sid, tok, text):
        return api("POST", f"/reports/{case_id}/studies/{sid}/sign", token=tok,
                   body={"findings": f"{text} findings", "impression": f"{text} impression", "technique": "X-Ray"})

    print("\n=== 12. FIX 1: REPORT_COMPLETED only after billing commits ===")
    # 12a first billing blocked by lock
    cw, sw = make_case(db, "ws1", center, center_id, a_id, a_name, parts2)
    sign(cw, sw[0], t_a, "A")
    lock()
    (code, r), msgs = ws_capture(lambda: sign_raw(cw, sw[1], t_a, "A"))
    ok("12a locked first-billing completing sign -> 409", code == 409, str(r)[:200])
    ok("12a NO REPORT_COMPLETED on 409", completed_events(msgs, cw) == [], str([m.get("type") for m in msgs]))
    ok("12a DB rolled back: case not Completed, no lines", case_status(cw) != "Completed" and lines(db, cw, "doctor") == [] and lines(db, cw, "center") == [])
    unlock()
    (code, r), msgs = ws_capture(lambda: sign_raw(cw, sw[1], t_a, "A"))
    ok("12a after unlock: 200 complete", code == 200 and (r or {}).get("caseComplete"), str(r)[:200])
    ok("12a exactly ONE REPORT_COMPLETED after success", len(completed_events(msgs, cw)) == 1, str([m.get("type") for m in msgs]))
    ok("12a response notified=True", (r or {}).get("notified") is True)
    ok("12a billed once", center_sig(db, cw)[0] == 2)
    (code, r), msgs = ws_capture(lambda: sign_raw(cw, sw[1], t_a, "A again"))
    ok("12a repeat sign on completed case: no second REPORT_COMPLETED", code == 200 and completed_events(msgs, cw) == [])
    # 12b already-billed path (reassigned, re-sign needs clawback) blocked by lock at sign time
    cw2, sw2 = make_case(db, "ws2", center, center_id, a_id, a_name, parts2)
    sign_all(cw2, sw2, t_a, "A")
    reassign(cw2, b_id, "to B before lock")
    sign(cw2, sw2[0], t_b, "B")
    lock()
    (code, r), msgs = ws_capture(lambda: sign_raw(cw2, sw2[1], t_b, "B"))
    detail = (r or {}).get("detail") or ""
    ok("12b locked clawback sign -> 409", code == 409, str(r)[:200])
    ok("12b 409 message names the period, not an invoice id", lock_label in detail and "inv-" not in detail, detail)
    ok("12b NO REPORT_COMPLETED on 409", completed_events(msgs, cw2) == [], str([m.get("type") for m in msgs]))
    ok("12b A still ACTIVE, no offsets, no B line", active_doctors(db, cw2) == {a_id} and offsets(db, cw2) == [])
    unlock()
    (code, r), msgs = ws_capture(lambda: sign_raw(cw2, sw2[1], t_b, "B"))
    ok("12b after unlock: 200 complete, B paid, A clawed back", code == 200 and active_doctors(db, cw2) == {b_id} and len(offsets(db, cw2)) == 2)
    ok("12b exactly ONE REPORT_COMPLETED after success", len(completed_events(msgs, cw2)) == 1, str([m.get("type") for m in msgs]))

    print("\n=== 13. FIX 2: reassign blocked up front under a locked period ===")
    cl, sl = make_case(db, "lockre", center, center_id, a_id, a_name, parts2)
    sign_all(cl, sl, t_a, "A")
    cr, sr = make_case(db, "lockaba", center, center_id, a_id, a_name, parts2)
    sign_all(cr, sr, t_a, "A")
    reassign(cr, b_id, "to B before lock (A->B->A)")
    cp, sp = make_case(db, "lockpart", center, center_id, a_id, a_name, parts3)
    sign(cp, sp[0], t_a, "A")
    lock()
    before = case_snapshot(db, cl)
    code, r = api("POST", f"/reports/{cl}/flag-reassign", token=t_center,
                  body={"reason": "reassign while locked", "toDoctorId": b_id}, expect=409)
    exp_msg = (f"This case's billing for {lock_label} is locked, so it can't be reassigned. "
               f"Ask the Super Admin to unlock the period first.")
    ok("13a 409 message", (r or {}).get("detail") == exp_msg, str(r))
    after = case_snapshot(db, cl)
    for k in before:
        ok(f"13a zero DB changes: {k}", before[k] == after[k], f"{len(before[k])} rows")
    code, r = api("POST", f"/reports/{cl}/flag-reassign", token=t_center,
                  body={"reason": "to C while locked", "toDoctorId": c_id}, expect=409)
    # recheck is not blocked (no billing involved) and re-sign reuses the payout
    code, rc = api("POST", f"/reports/{cl}/recheck", token=t_a, body={"reason": "recheck under lock"}, expect=200)
    ok("13b recheck under lock allowed, lines untouched", before["lines"] == case_snapshot(db, cl)["lines"])
    code, last = sign_raw(cl, sl[0], t_a, "A re")
    code, last = sign_raw(cl, sl[1], t_a, "A re")
    ok("13b re-sign under lock: 200 payout_already_active",
       code == 200 and ((last or {}).get("billing") or {}).get("doctorPayout", {}).get("reason") == "payout_already_active", str(last)[:200])
    ok("13b re-sign under lock: lines unchanged", before["lines"] == case_snapshot(db, cl)["lines"])
    # unbilled partial case reassigns normally
    code, r = api("POST", f"/reports/{cp}/flag-reassign", token=t_center,
                  body={"reason": "partial while locked", "toDoctorId": b_id}, expect=200)
    rows = {s.id: s for s in study_rows(cp)}
    ok("13c unbilled partial reassign under lock allowed: A keeps signed, rest to B",
       rows[sp[0]].claimed_by == a_id and all(rows[x].claimed_by == b_id for x in sp[1:]))
    # A->B->A under lock: target already holds the lines -> allowed, re-sign reuses
    code, r = api("POST", f"/reports/{cr}/flag-reassign", token=t_center,
                  body={"reason": "back to A while locked", "toDoctorId": a_id}, expect=200)
    ok("13d A->B->A reassign back to A under lock allowed", code == 200 and all(s.claimed_by == a_id for s in study_rows(cr)))
    sign_raw(cr, sr[0], t_a, "A again")
    code, last = sign_raw(cr, sr[1], t_a, "A again")
    ok("13d A re-signs under lock: 200, payout_already_active, no offsets",
       code == 200 and ((last or {}).get("billing") or {}).get("doctorPayout", {}).get("reason") == "payout_already_active"
       and offsets(db, cr) == [], str(last)[:200])
    unlock()
    code, r = api("POST", f"/reports/{cl}/flag-reassign", token=t_center,
                  body={"reason": "after unlock", "toDoctorId": b_id}, expect=200)
    ok("13e after unlock the same reassign succeeds", (r or {}).get("caseStatus") == "In Review")
    sign_all(cl, sl, t_b, "B")
    ok("13e B completes: A clawed back, B active", active_doctors(db, cl) == {b_id} and len(offsets(db, cl)) == 2)
    # finish the partial case so every fixture ends consistent
    sign_all(cp, sp[1:], t_b, "B")
    ok("13c partial case completes after unlock (A idx1 20, B 10+10)",
       {li.study_index: (li.doctor_id, li.amount) for li in lines(db, cp, "doctor")} == {1: (a_id, 20), 2: (b_id, 10), 3: (b_id, 10)})

    print("\n=== 14. FIX 3: mixed-signer recheck reopens only the requester's studies ===")
    cm, sm = make_case(db, "mixre", center, center_id, a_id, a_name, parts3)
    sign(cm, sm[0], t_a, "A")
    reassign(cm, b_id, "partial to B")
    sign(cm, sm[1], t_b, "B")
    sign(cm, sm[2], t_b, "B")
    ok("14 case Completed with A20/B10/B10",
       case_status(cm) == "Completed" and {li.study_index: (li.doctor_id, li.amount) for li in lines(db, cm, "doctor")} == {1: (a_id, 20), 2: (b_id, 10), 3: (b_id, 10)})
    before = case_snapshot(db, cm)
    a_before = next(x for x in before["studies"] if x["id"] == sm[0])
    code, rc = api("POST", f"/reports/{cm}/recheck", token=t_b, body={"reason": "B rechecks own studies"}, expect=200)
    ok("14 revertedStudyIds == B's 2 studies", sorted((rc or {}).get("revertedStudyIds") or []) == sorted(sm[1:]), str(rc)[:200])
    ok("14 case back to In Review", case_status(cm) == "In Review" and (rc or {}).get("caseStatus") == "In Review")
    aft = case_snapshot(db, cm)
    a_after = next(x for x in aft["studies"] if x["id"] == sm[0])
    ok("14 A's study row completely untouched (SIGNED, signed_by A, same history)", a_after == a_before, str((a_after.get("report_status"), a_after.get("signed_by"))))
    b_rows = [x for x in aft["studies"] if x["id"] in sm[1:]]
    ok("14 B's studies DRAFT with RECHECK snapshot by B",
       all(x["report_status"] == "DRAFT" and not x["signed_by"] and (x["metadata_"].get("reportHistory") or [{}])[-1].get("event") == "RECHECK"
           and (x["metadata_"].get("reportHistory") or [{}])[-1].get("signedBy") == b_id for x in b_rows))
    ok("14 recheck comment added", len(aft["comments"]) == len(before["comments"]) + 1 and any(c["kind"] == "RECHECK" for c in aft["comments"]))
    ok("14 payout lines untouched by recheck", aft["lines"] == before["lines"])
    sign_raw(cm, sm[1], t_b, "B re")
    code, last = sign_raw(cm, sm[2], t_b, "B re")
    dp = ((last or {}).get("billing") or {}).get("doctorPayout") or {}
    ok("14 B re-sign completes the case", code == 200 and (last or {}).get("caseComplete") and case_status(cm) == "Completed")
    ok("14 payout reuse: payout_already_active, 3 kept", dp.get("reason") == "payout_already_active" and len(dp.get("kept") or []) == 3, str(dp)[:200])
    ok("14 no clawback for anyone, lines identical", offsets(db, cm) == [] and case_snapshot(db, cm)["lines"] == before["lines"])

    print("\n=== 15. Recheck with no own signed studies is rejected ===")
    cn, sn = make_case(db, "noown", center, center_id, a_id, a_name, parts2)
    sign_all(cn, sn, t_a, "A")
    # Fixture: B holds the claim on study 2 but A signed it (no own signed study for B)
    db.expire_all()
    srow = db.query(StudyDB).filter(StudyDB.id == sn[1]).first()
    srow.claimed_by, srow.claimed_by_name = b_id, "B (fixture)"
    db.commit()
    before = case_snapshot(db, cn)
    code, r = api("POST", f"/reports/{cn}/recheck", token=t_b, body={"reason": "nothing of mine"}, expect=400)
    ok("15 400 message", (r or {}).get("detail") == "You have no signed studies in this case to recheck", str(r))
    ok("15 zero DB changes", case_snapshot(db, cn) == before)
    code, r = api("POST", f"/reports/{cn}/recheck", token=t_c, body={"reason": "no claim at all"}, expect=403)
    ok("15 doctor with no claim: 403, zero changes", case_snapshot(db, cn) == before)
    db.expire_all()
    ok("period unlocked at end of round-3 tests", not billing_svc.is_period_locked(db, period))


    print("\n=== 16. Study sequence_no (upload order) drives billing index ===")
    center_name = db.query(CaseDB).filter(CaseDB.radiology_center_id == center_id).first().radiology_center_name

    def api_case(tag, parts, status="Pending", cid=None):
        cid = cid or f"p6seq-{tag}-{int(time.time() * 1000)}"
        body = {"id": cid, "patientNumber": f"P6S-{tag}", "fullName": f"P6 SEQ {tag.upper()}", "age": 44, "gender": "Male",
                "phone": "9000000004", "radiologyCenterId": center_id, "radiologyCenterName": center_name,
                "referringPhysicianId": "ref-p6s", "referringPhysicianName": "DR REF P6S", "status": status,
                "studyDate": "25/09/2026", "bodyParts": parts, "modality": "X-Ray", "assignedDoctorIds": [a_id, b_id]}
        code, _ = api("POST", "/reports", token=t_center, body=body, expect=200)
        if cid not in FIX["cases"]:
            FIX["cases"].append(cid)
        db.expire_all()
        rows = db.query(StudyDB).filter(StudyDB.case_id == cid).all()
        FIX["studies"].extend([r.id for r in rows if r.id not in FIX["studies"]])
        time.sleep(0.01)
        return cid, {r.body_part: r for r in rows}

    def claim(cid, tok, did, name):
        api("POST", f"/reports/{cid}/claim", token=tok, body={"doctorId": did, "doctorName": name}, expect=200)

    def line_map(cid, party):
        db.expire_all()
        by_sid = {s.id: s.body_part for s in db.query(StudyDB).filter(StudyDB.case_id == cid)}
        return {by_sid[li.study_id]: (li.study_index, li.doctor_id, li.amount)
                for li in lines(db, cid, party) if st(li) == "ACTIVE" and li.amount > 0}

    b_name = db.query(DoctorDB).filter(DoctorDB.id == b_id).first().full_name
    L, C, K = "LUMBAR SPINE AP/LAT", "CHEST PA/AP", "KNEE JOINT AP/LAT"

    # 16a sequence_no from bodyParts order (non-alphabetical)
    cs, rs = api_case("order", [L, C, K])
    ok("16a sequence_no follows bodyParts order (LUMBAR 1, CHEST 2, KNEE 3)",
       {bp: r.sequence_no for bp, r in rs.items()} == {L: 1, C: 2, K: 3}, str({bp: r.sequence_no for bp, r in rs.items()}))
    # 16b non-alphabetical pricing (alphabetical would make CHEST index 1)
    claim(cs, t_a, a_id, a_name)
    for bp in (C, K, L):
        sign(cs, rs[bp].id, t_a, "A")
    ok("16b center priced by upload order: LUMBAR idx1 30, CHEST idx2 15, KNEE idx3 15",
       line_map(cs, "center") == {L: (1, a_id, 30), C: (2, a_id, 15), K: (3, a_id, 15)}, str(line_map(cs, "center")))
    ok("16b doctor priced by upload order: LUMBAR 20, CHEST 10, KNEE 10",
       line_map(cs, "doctor") == {L: (1, a_id, 20), C: (2, a_id, 10), K: (3, a_id, 10)}, str(line_map(cs, "doctor")))
    ok("16b display order unchanged (case_studies_ordered still created_at, id)",
       [x["id"] for x in (api("GET", f"/reports/{cs}", token=t_center)[1] or {}).get("studies", [])] == sorted(r.id for r in rs.values()))

    # 16c mixed signers priced by upload order, both variants
    for variant, a_bp, b_bp in (("A-first-uploaded", L, C), ("B-first-uploaded", C, L)):
        cm2, rm = api_case(f"mix-{variant[0].lower()}", [L, C])
        claim(cm2, t_a, a_id, a_name)
        sign(cm2, rm[a_bp].id, t_a, "A")
        reassign(cm2, b_id, "partial to B")
        db.expire_all()
        ok(f"16c[{variant}] unsigned study moved to B",
           db.query(StudyDB).filter(StudyDB.id == rm[b_bp].id).first().claimed_by == b_id)
        _c, last = sign(cm2, rm[b_bp].id, t_b, "B")
        att = {x["studyId"]: (x["studyIndex"], x["doctorId"], x["amount"]) for x in ((last or {}).get("billing") or {}).get("doctorAttribution", [])}
        exp_d = {L: (1, a_id if a_bp == L else b_id, 20), C: (2, a_id if a_bp == C else b_id, 10)}
        ok(f"16c[{variant}] doctor lines: first-uploaded LUMBAR 20 to its signer, CHEST 10",
           line_map(cm2, "doctor") == exp_d, str(line_map(cm2, "doctor")))
        ok(f"16c[{variant}] response attribution matches", att == {rm[bp].id: v for bp, v in exp_d.items()}, str(att))
        ok(f"16c[{variant}] center billed once: LUMBAR 30, CHEST 15",
           {k: v[0::2] for k, v in line_map(cm2, "center").items()} == {L: (1, 30), C: (2, 15)} and center_sig(db, cm2)[0] == 2)

    # 16d legacy case (sequence_no NULL) keeps created_at, id ordering, incl. re-issued payouts
    cl2, rl = api_case("legacy", [L, C])
    db.expire_all()
    for r in db.query(StudyDB).filter(StudyDB.case_id == cl2):
        r.sequence_no = None  # simulate a pre-change (legacy) case
    db.commit()
    claim(cl2, t_a, a_id, a_name)
    sign(cl2, rl[L].id, t_a, "A"); sign(cl2, rl[C].id, t_a, "A")
    ok("16d legacy: old ordering (id alphabetical) -> CHEST idx1 20, LUMBAR idx2 10",
       line_map(cl2, "doctor") == {C: (1, a_id, 20), L: (2, a_id, 10)}, str(line_map(cl2, "doctor")))
    ok("16d legacy: center CHEST 30, LUMBAR 15", {k: v[0::2] for k, v in line_map(cl2, "center").items()} == {C: (1, 30), L: (2, 15)})
    reassign(cl2, b_id, "legacy reassign")
    sign(cl2, rl[L].id, t_b, "B"); sign(cl2, rl[C].id, t_b, "B")
    ok("16d legacy re-issued payout keeps old index prices (B CHEST 20, LUMBAR 10), A clawed back",
       line_map(cl2, "doctor") == {C: (1, b_id, 20), L: (2, b_id, 10)} and len(offsets(db, cl2)) == 2, str(line_map(cl2, "doctor")))
    # partially-null sequence also falls back
    from backend.app import billing as _bs
    cpn, rpn = api_case("partnull", [L, C])
    db.expire_all()
    r1 = db.query(StudyDB).filter(StudyDB.id == rpn[L].id).first(); r1.sequence_no = None; db.commit()
    ok("16d any NULL sequence_no -> legacy ordering", [x.body_part for x in _bs.billing_ordered_studies(db, cpn)] == [C, L])
    ok("16d all set -> sequence ordering", [x.body_part for x in _bs.billing_ordered_studies(db, cs)] == [L, C, K])

    # 16e study added later gets max+1; existing never renumbered; legacy additions stay NULL
    ca2, ra = api_case("add", [K, L])
    ca2, ra2 = api_case("add", [K, L, C], cid=ca2)
    ok("16e added CHEST gets 3; KNEE 1 / LUMBAR 2 unchanged",
       {bp: r.sequence_no for bp, r in ra2.items()} == {K: 1, L: 2, C: 3}, str({bp: r.sequence_no for bp, r in ra2.items()}))
    ca3, ra3 = api_case("add2", [C], cid=ca2)
    ok("16e re-POST with fewer parts renumbers nothing", {bp: r.sequence_no for bp, r in ra3.items()} == {K: 1, L: 2, C: 3})
    cl3, _ = api_case("legacyadd", [L])
    db.expire_all()
    db.query(StudyDB).filter(StudyDB.case_id == cl3).first().sequence_no = None; db.commit()
    cl3, rl3 = api_case("legacyadd", [L, C], cid=cl3)
    ok("16e study added to a legacy case stays NULL (case keeps legacy ordering)",
       rl3[L].sequence_no is None and rl3[C].sequence_no is None)

    # 16f reworded first-billing lock message
    cf, rf = api_case("lockmsg", [L, C])
    claim(cf, t_a, a_id, a_name)
    sign(cf, rf[L].id, t_a, "A")
    lock()
    code, r = sign_raw(cf, rf[C].id, t_a, "A")
    exp_lock = (f"Billing for {lock_label} is locked, so this case can't be completed yet. "
                f"Ask the Super Admin to unlock {lock_label}, then sign again.")
    ok("16f first-billing lock: 409 with new wording", code == 409 and (r or {}).get("detail") == exp_lock, str(r))
    ok("16f nothing billed, case not Completed", lines(db, cf, "center") == [] and case_status(cf) != "Completed")
    unlock()
    code, r = sign_raw(cf, rf[C].id, t_a, "A")
    ok("16f after unlock: 200 complete, LUMBAR idx1 30", code == 200 and line_map(cf, "center").get(L) == (1, a_id, 30))
    db.expire_all()
    ok("period unlocked at end of section 16", not billing_svc.is_period_locked(db, period))

    print("\n=== 11. Invoice/revenue consistency ===")
    ok("invoice totals == sum(lines) for fixture-created invoices", invoice_totals_consistent(db, FIX["cases"]) == [],
       str(invoice_totals_consistent(db, FIX["cases"])))
    code, rev = api("GET", "/billing/revenue?months=1", token=t_admin, expect=200)
    db.expire_all()
    invs = db.query(InvoiceDB).filter(InvoiceDB.billing_period == period).all()
    dsum = sum(int(i.total_amount or 0) for i in invs if i.party_type == "doctor")
    csum = sum(int(i.total_amount or 0) for i in invs if i.party_type == "center")
    cm = (rev or {}).get("currentMonth") or {}
    ok("revenue doctorPayouts == DB", cm.get("doctorPayouts") == dsum, f"{cm.get('doctorPayouts')} vs {dsum}")
    ok("revenue net == center - doctor", cm.get("net") == csum - dsum)
    code, inv = api("GET", f"/invoices/inv-doctor-{a_id}-{period}", token=t_a, expect=200)
    mine = [li for li in (inv or {}).get("lineItems", []) if li.get("caseId") == case1]
    ok("A invoice exposes status fields", mine and all("status" in li and "offsetsLineItemId" in li for li in mine))
    ok("A invoice lines for case1 net 0", sum(li["amount"] for li in mine) == 0, str([li["amount"] for li in mine]))

    print("\n=== Password integrity ===")
    db.expire_all()
    for u in db.query(UserDB).filter(UserDB.email.in_(list(pw_before.keys()))).all():
        ok(f"password unchanged for {u.email}", (u.metadata_ or {}).get("password") == pw_before[u.email])

    print("\n=== Cleanup ===")
    cleanup(db)
    ok("fixtures removed", all(db.query(CaseDB).filter(CaseDB.id == c).first() is None for c in FIX["cases"])
       and db.query(DoctorDB).filter(DoctorDB.id == c_id).first() is None)
    db.close()
    print(f"\n==== SUMMARY: {PASS} passed, {FAIL} failed ====")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as e:
        print("FATAL:", e)
        try:
            db = SessionLocal()
            cleanup(db)
            db.close()
        except Exception:
            pass
        raise
