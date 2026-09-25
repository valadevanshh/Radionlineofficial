"""INDEPENDENT AUDIT of the P6 reassign/clawback hotfix (round 2).
Runs ONLY against clone DB radionet_audit_20260925 + clone backend :8060 (and :8061 = same clone,
billing period patched to 2026-10). Never touches live. Does not modify app code.
Writes raw HTTP + DB evidence to %TEMP%\\p6audit\\raw\\audit_log.json."""
import json, os, sys, time, threading, urllib.request, urllib.error
from datetime import datetime
ROOT = r"D:\Project\radionlineofficial"
sys.path.insert(0, ROOT); os.chdir(ROOT)
from backend.app.database import SessionLocal, engine
from backend.app.models import (UserDB, DoctorDB, CaseDB, StudyDB, ReportDB, ReportCommentDB,
                                InvoiceDB, InvoiceLineItemDB, BillingPeriodLockDB)
from backend.app.security import create_access_token

assert engine.url.database == "radionet_audit_20260925", "REFUSING: not the audit clone"
B8060 = "http://127.0.0.1:8060/api"
B8061 = "http://127.0.0.1:8061/api"
RAW = os.path.join(os.environ["TEMP"], "p6audit", "raw"); os.makedirs(RAW, exist_ok=True)
LOG = []            # every HTTP call + DB snapshot
CHECKS = []         # (section, name, ok, detail)
SECTION = ["-"]

def sec(name):
    SECTION[0] = name; print(f"\n===== {name} ====="); LOG.append({"section": name})

def check(name, cond, detail=""):
    CHECKS.append((SECTION[0], name, bool(cond), str(detail)[:400]))
    print(f"  {'PASS' if cond else 'FAIL'}: {name}" + (f" -- {str(detail)[:300]}" if detail else ""))

def tok(u):
    return create_access_token({"sub": str(u.id), "email": u.email, "role": u.role, "name": u.name})

def api(method, path, t=None, body=None, base=B8060, quiet=False):
    data = None if body is None else json.dumps(body).encode()
    h = {"Content-Type": "application/json"}
    if t: h["Authorization"] = f"Bearer {t}"
    req = urllib.request.Request(base + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode(); code = r.status
    except urllib.error.HTTPError as e:
        raw = e.read().decode(); code = e.code
    try: payload = json.loads(raw) if raw else None
    except Exception: payload = {"raw": raw[:2000]}
    LOG.append({"http": f"{method} {base.split(':')[-1]}{path}", "req": body, "status": code, "resp": payload})
    if not quiet: print(f"    {method} {path} -> {code}")
    return code, payload

db = SessionLocal()
def q(): db.expire_all(); return db

def lines(case_id, party=None):
    qq = q().query(InvoiceLineItemDB, InvoiceDB.party_type, InvoiceDB.billing_period, InvoiceDB.locked).join(
        InvoiceDB, InvoiceDB.id == InvoiceLineItemDB.invoice_id).filter(InvoiceLineItemDB.case_id == case_id)
    out = []
    for li, pt, per, lk in qq.all():
        if party and pt != party: continue
        out.append({"id": li.id, "party": pt, "invoice": li.invoice_id, "period": per, "invLocked": lk,
                    "study": li.study_id, "idx": li.study_index, "doctor": li.doctor_id, "amount": li.amount,
                    "status": (li.status or "ACTIVE"), "offsets": li.offsets_line_item_id})
    return sorted(out, key=lambda d: (d["party"], d["idx"] or 0, d["id"]))

def active_doc(case_id):
    return [l for l in lines(case_id, "doctor") if l["status"] == "ACTIVE" and l["amount"] > 0 and not l["offsets"]]
def offsets(case_id):
    return [l for l in lines(case_id, "doctor") if l["status"] == "CLAWBACK" or l["offsets"]]
def one_active_per_study(case_id, n):
    a = active_doc(case_id); per = {}
    for l in a: per.setdefault(l["study"], []).append(l)
    return len(per) == n and all(len(v) == 1 for v in per.values())
def active_map(case_id):
    return {l["idx"]: (l["doctor"], l["amount"]) for l in active_doc(case_id)}

def studies(case_id):
    rows = q().query(StudyDB).filter(StudyDB.case_id == case_id).order_by(StudyDB.created_at, StudyDB.id).all()
    return [{"id": s.id, "status": s.status, "report_status": s.report_status, "claimed_by": s.claimed_by,
             "signed_by": s.signed_by, "history": [(h.get("version"), h.get("event"), h.get("signedBy"))
             for h in ((s.metadata_ or {}).get("reportHistory") or [])],
             "metaKeys": sorted((s.metadata_ or {}).keys())} for s in rows]

def case_row(case_id):
    c = q().query(CaseDB).filter(CaseDB.id == case_id).first()
    r = q().query(ReportDB).filter(ReportDB.id == case_id).first()
    return {"case_status": c.status if c else None, "report_status": r.status if r else None}

def snap(label, case_id):
    d = {"snapshot": label, "case": case_id, **case_row(case_id), "studies": studies(case_id),
         "lines": lines(case_id)}
    LOG.append(d); return d

def inv_consistency(case_ids):
    ids = set()
    for c in case_ids: ids |= {l["invoice"] for l in lines(c)}
    bad = []
    for iid in ids:
        inv = q().query(InvoiceDB).filter(InvoiceDB.id == iid).first()
        s = sum(int(li.amount) for li in q().query(InvoiceLineItemDB).filter(InvoiceLineItemDB.invoice_id == iid))
        if int(inv.total_amount or 0) != s: bad.append((iid, inv.total_amount, s, "locked" if inv.locked else ""))
    return bad

# ------------------------------------------------------------------ actors
center = q().query(UserDB).filter(UserDB.id == 9).one()
ua = q().query(UserDB).filter(UserDB.id == 8).one()
ub = q().query(UserDB).filter(UserDB.id == 10).one()
admin = q().query(UserDB).filter(UserDB.role == "SUPER_ADMIN").order_by(UserDB.id).first()
CENTER_ID = center.metadata_["centerId"]; A = ua.metadata_["doctorId"]; B = ub.metadata_["doctorId"]
assert (CENTER_ID, A, B) == ("center-1789410759761", "doc-1789410598715", "doc-1789912233530")
tC, tA, tB, tAdm = tok(center), tok(ua), tok(ub), tok(admin)
A_NAME = q().query(DoctorDB).filter(DoctorDB.id == A).one().full_name
B_NAME = q().query(DoctorDB).filter(DoctorDB.id == B).one().full_name
CENTER_NAME = q().query(CaseDB).filter(CaseDB.radiology_center_id == CENTER_ID).first().radiology_center_name
STAMP = int(time.time() * 1000)

sec("SETUP Doctor C via admin POST /doctors (clone only)")
code, dc = api("POST", "/doctors", tAdm, {"firstName": "AUDIT", "lastName": "DOCTORC", "fullName": "DR. AUDIT DOCTOR C",
               "email": f"audit-c-{STAMP}@example.invalid", "contactNumber": "9000000009"})
check("POST /doctors 200", code == 200, dc)
C = dc["id"]; C_NAME = dc["fullName"]
uc = UserDB(email=f"audit-c-{STAMP}@example.invalid", name=C_NAME, role="DOCTOR", metadata_={"doctorId": C})
db.add(uc); db.commit(); tCc = tok(uc)
print(f"  A={A} B={B} C={C} (user {uc.id}) center={CENTER_ID}")

PARTS3 = ["CHEST PA/AP", "KNEE AP/LAT", "LUMBAR AP/LAT"]
def make_case(tag, parts, doctor_tok, doctor_id, doctor_name):
    cid = f"aud-{tag}-{int(time.time()*1000)}"
    body = {"id": cid, "patientNumber": f"AUD-{tag}", "fullName": f"AUDIT {tag.upper()}", "age": 40, "gender": "Male",
            "phone": "9000000001", "radiologyCenterId": CENTER_ID, "radiologyCenterName": CENTER_NAME,
            "bodyParts": parts, "referringPhysicianId": "ref-aud", "referringPhysicianName": "DR REF AUDIT",
            "status": "Pending", "studyDate": "25/09/2026", "modality": "X-Ray", "assignedDoctorIds": ["ALL"]}
    code, r = api("POST", "/reports", tC, body)
    assert code == 200, r
    code, r = api("POST", f"/reports/{cid}/claim", doctor_tok, {"doctorId": doctor_id, "doctorName": doctor_name})
    assert code == 200, r
    sids = [s["id"] for s in studies(cid)]
    time.sleep(0.02)
    return cid, sids

def sign(cid, sid, t, text, base=B8060):
    return api("POST", f"/reports/{cid}/studies/{sid}/sign", t,
               {"findings": f"{text} findings", "impression": f"{text} impression", "technique": "X-Ray"}, base=base)
def reassign(cid, to, reason="audit reassign"):
    return api("POST", f"/reports/{cid}/flag-reassign", tC, {"reason": reason, "toDoctorId": to})

ALL_CASES = []

# ================================================================== 4c-2 + 4a: A rechecks own case
sec("S1 recheck by A on A's own signed case (no clawback) + repeated sign idempotency")
c1, s1 = make_case("self", PARTS3[:2], tA, A, A_NAME); ALL_CASES.append(c1)
for s in s1: sign(c1, s, tA, "A")
check("case Completed after A signs all", case_row(c1)["case_status"] == "Completed")
L0 = lines(c1); check("billed: 2 center + 2 doctor lines", len([l for l in L0 if l["party"] == "center"]) == 2 and len(active_doc(c1)) == 2, L0)
code, r = api("POST", f"/reports/{c1}/recheck", tA, {"reason": "audit self recheck"})
check("recheck 200", code == 200, r)
st = studies(c1); check("case In Review after recheck", case_row(c1)["case_status"] == "In Review", case_row(c1))
check("studies DRAFT/CLAIMED, unsigned", all(x["report_status"] == "DRAFT" and x["status"] == "CLAIMED" and not x["signed_by"] for x in st), st)
check("reportHistory v1 RECHECK signedBy A", all(x["history"] == [(1, "RECHECK", A)] for x in st), [x["history"] for x in st])
check("A payout lines still ACTIVE, no offsets", active_map(c1) == {1: (A, 20), 2: (A, 10)} and not offsets(c1), active_map(c1))
for s in s1: code, r = sign(c1, s, tA, "A2")
check("re-sign completes, doctorPayout skipped/kept", r["caseComplete"] and (r["billing"] or {}).get("doctorPayout", {}).get("reason") == "payout_already_active", r.get("billing"))
for _ in range(2): code, r = sign(c1, s1[0], tA, "A3")
check("repeat sign x2: alreadySigned, same lines", r.get("alreadySigned") is True and lines(c1) == L0 or [l["id"] for l in lines(c1)] == [l["id"] for l in L0], len(lines(c1)))
check("S1 exactly 0 offsets, 1 active/study", not offsets(c1) and one_active_per_study(c1, 2))
snap("S1 final", c1)

# ================================================================== 4c-1 + 4a + 4b
sec("S2 A signs, reassign->B (x2), B draft, B recheck-before-sign, B signs, repeats, B recheck, reassign->A")
c2, s2 = make_case("rc", PARTS3[:2], tA, A, A_NAME); ALL_CASES.append(c2)
for s in s2: sign(c2, s, tA, "A")
center_before = [l for l in lines(c2) if l["party"] == "center"]
code, r = reassign(c2, B, "second opinion"); check("reassign 200", code == 200, r)
code, r2 = reassign(c2, B, "second opinion again"); check("repeat reassign 200", code == 200, r2)
check("repeat reassign reverted nothing", r2.get("revertedStudyIds") == [], r2.get("revertedStudyIds"))
check("after 2 reassigns: no offsets, A still ACTIVE", not offsets(c2) and active_map(c2) == {1: (A, 20), 2: (A, 10)}, active_map(c2))
check("history exactly 1 REASSIGN snapshot per study (not duplicated)", all(x["history"] == [(1, "REASSIGN", A)] for x in studies(c2)), [x["history"] for x in studies(c2)])
code, r = api("POST", f"/reports/{c2}/studies/{s2[0]}/sign", tA, {"findings": "x"})
check("A can no longer sign after reassign (403)", code == 403, r)
code, r = api("POST", f"/reports/{c2}/studies/{s2[0]}/draft", tB, {"findings": "B draft", "dicomSnapshots": ["snap://1"]})
check("B draft save 200", code == 200, r)
st = studies(c2)[0]; check("draft save kept reportHistory + added dicomSnapshots", st["history"] == [(1, "REASSIGN", A)] and "dicomSnapshots" in st["metaKeys"], st)
# center re-saves the case via POST /api/reports (upsert) -> must not touch study metadata
code, r = api("POST", "/reports", tC, {"id": c2, "patientNumber": "AUD-rc", "fullName": "AUDIT RC", "age": 40, "gender": "Male",
    "phone": "9000000001", "radiologyCenterId": CENTER_ID, "radiologyCenterName": CENTER_NAME, "bodyParts": PARTS3[:2],
    "referringPhysicianId": "ref-aud", "referringPhysicianName": "DR REF AUDIT", "status": "In Review", "studyDate": "25/09/2026", "modality": "X-Ray"})
check("center upsert POST /api/reports 200", code == 200, str(r)[:200])
check("upsert kept reportHistory on both studies", all(x["history"] == [(1, "REASSIGN", A)] for x in studies(c2)), [x["history"] for x in studies(c2)])
code, r = api("POST", f"/reports/{c2}/recheck", tB, {"reason": "B recheck before signing"})
check("B recheck BEFORE signing is rejected (case not Completed)", code == 400, r)
check("rejected recheck left A lines ACTIVE", active_map(c2) == {1: (A, 20), 2: (A, 10)} and not offsets(c2))
code, r = sign(c2, s2[0], tB, "B"); check("B signs study1 (case not complete yet): no billing change", r.get("caseComplete") is False and not offsets(c2) and active_map(c2) == {1: (A, 20), 2: (A, 10)}, active_map(c2))
code, r = sign(c2, s2[1], tB, "B"); check("B signs study2 -> complete 200", code == 200 and r.get("caseComplete"), r.get("billing"))
LOG.append({"S2_completion_billing": r.get("billing")})
o = offsets(c2); check("exactly 2 CLAWBACK offsets (-20,-10) for A", sorted(x["amount"] for x in o) == [-20, -10] and all(x["doctor"] == A for x in o), o)
check("A originals CLAWED_BACK", sorted(l["status"] for l in lines(c2, "doctor") if l["doctor"] == A and l["amount"] > 0) == ["CLAWED_BACK", "CLAWED_BACK"])
check("B active idx1=20 idx2=10 (index price reused)", active_map(c2) == {1: (B, 20), 2: (B, 10)}, active_map(c2))
check("center lines unchanged (still 2, 45, not re-billed)", [l for l in lines(c2) if l["party"] == "center"] == center_before)
n_before = len(lines(c2))
for _ in range(3): sign(c2, s2[1], tB, "B again")
check("3 repeated sign calls: no new lines", len(lines(c2)) == n_before, len(lines(c2)))
code, r = api("POST", "/reports", tC, {"id": c2, "patientNumber": "AUD-rc", "fullName": "AUDIT RC", "age": 40, "gender": "Male",
    "phone": "9000000001", "radiologyCenterId": CENTER_ID, "radiologyCenterName": CENTER_NAME, "bodyParts": PARTS3[:2],
    "referringPhysicianId": "ref-aud", "referringPhysicianName": "DR REF AUDIT", "status": "Completed", "studyDate": "25/09/2026", "modality": "X-Ray"})
check("POST /api/reports status=Completed (other finalize path) adds no lines", code == 200 and len(lines(c2)) == n_before, (code, len(lines(c2))))
code, r = api("POST", f"/reports/{c2}/recheck", tB, {"reason": "B recheck after signing"})
check("B recheck after completion 200", code == 200, r)
check("B recheck: no new offsets, B still ACTIVE", len(offsets(c2)) == 2 and active_map(c2) == {1: (B, 20), 2: (B, 10)})
for s in s2: code, r = sign(c2, s, tB, "B re-sign")
check("B re-sign after recheck: still 2 offsets, 1 active/study (B)", len(offsets(c2)) == 2 and one_active_per_study(c2, 2) and active_map(c2) == {1: (B, 20), 2: (B, 10)}, active_map(c2))
hist = [x["history"] for x in studies(c2)]
check("history appended: v1 REASSIGN(A) v2 RECHECK(B) on each study", all(h == [(1, "REASSIGN", A), (2, "RECHECK", B)] for h in hist), hist)
# reassign back to A after B was paid; A re-signs -> B clawed, A reissued
reassign(c2, A, "back to A")
check("reassign->A: no payout change yet", len(offsets(c2)) == 2 and active_map(c2) == {1: (B, 20), 2: (B, 10)})
for s in s2: code, r = sign(c2, s, tA, "A final")
check("A re-signs: 4 offsets total, A active again, invariant holds", len(offsets(c2)) == 4 and one_active_per_study(c2, 2) and active_map(c2) == {1: (A, 20), 2: (A, 10)}, (len(offsets(c2)), active_map(c2)))
net = {}
for l in lines(c2, "doctor"): net[l["doctor"]] = net.get(l["doctor"], 0) + l["amount"]
check("net payout: A 30, B 0", net.get(A) == 30 and net.get(B) == 0, net)
check("history now 3 versions per study", all(len(x["history"]) == 3 for x in studies(c2)), [x["history"] for x in studies(c2)])
snap("S2 final", c2)

# ================================================================== A->B->A
sec("S3 A->B->A with B never signing: no offsets")
c3, s3 = make_case("aba", PARTS3[:2], tA, A, A_NAME); ALL_CASES.append(c3)
for s in s3: sign(c3, s, tA, "A")
L3 = [l["id"] for l in lines(c3)]
reassign(c3, B, "to B"); reassign(c3, A, "back to A")
check("after A->B->A: A still active, no offsets", active_map(c3) == {1: (A, 20), 2: (A, 10)} and not offsets(c3))
for s in s3: code, r = sign(c3, s, tA, "A again")
check("A re-signs: case Completed, no offsets, no new lines", r.get("caseComplete") and not offsets(c3) and [l["id"] for l in lines(c3)] == L3, (r.get("billing"), len(lines(c3))))
snap("S3 final", c3)

# ================================================================== A->B->C full case
sec("S4 A signs full case -> B (no sign) -> C signs: A ACTIVE until C completes")
c4, s4 = make_case("abc", PARTS3[:2], tA, A, A_NAME); ALL_CASES.append(c4)
for s in s4: sign(c4, s, tA, "A")
reassign(c4, B, "to B"); check("after ->B: A active", active_map(c4) == {1: (A, 20), 2: (A, 10)} and not offsets(c4))
code, r = reassign(c4, C, "to C"); check("after ->C: A active, studies claimed by C", active_map(c4) == {1: (A, 20), 2: (A, 10)} and not offsets(c4) and all(x["claimed_by"] == C for x in studies(c4)), studies(c4))
code, r = sign(c4, s4[0], tCc, "C"); check("C signs 1/2: A still active", active_map(c4) == {1: (A, 20), 2: (A, 10)} and not offsets(c4))
code, r = sign(c4, s4[1], tCc, "C"); check("C completes: A clawed (2 offsets), C paid 20/10, B nothing", len(offsets(c4)) == 2 and active_map(c4) == {1: (C, 20), 2: (C, 10)} and not [l for l in lines(c4) if l["doctor"] == B], lines(c4))
snap("S4 final", c4)

# ================================================================== 5 three-way mixed
sec("S5 THREE-WAY MIXED SIGNER (item 5)")
c5, s5 = make_case("mix3", PARTS3, tA, A, A_NAME); ALL_CASES.append(c5)
code, r = sign(c5, s5[0], tA, "A"); check("A signs 1/3 (no billing yet)", r.get("caseComplete") is False and not lines(c5), r.get("billing"))
code, r = reassign(c5, B, "partial to B"); LOG.append({"S5_reassign_B": r})
st = studies(c5); check("partial reassign: study1 stays A/SIGNED, 2&3 -> B", st[0]["claimed_by"] == A and st[0]["report_status"] == "SIGNED" and st[1]["claimed_by"] == B and st[2]["claimed_by"] == B, st)
check("partial reassign: revertedStudyIds empty, case In Review", r.get("revertedStudyIds") == [] and r.get("caseStatus") == "In Review", r)
code, r = sign(c5, s5[1], tB, "B"); check("B signs study2", code == 200 and r.get("caseComplete") is False)
code, r = reassign(c5, C, "partial to C")
st = studies(c5); check("2nd partial reassign: only study3 -> C", [x["claimed_by"] for x in st] == [A, B, C], [x["claimed_by"] for x in st])
code, r = sign(c5, s5[2], tCc, "C"); check("C signs study3 -> case complete", code == 200 and r.get("caseComplete"), r.get("billing"))
LOG.append({"S5_completion_response_billing": r.get("billing")})
cl = [l for l in lines(c5) if l["party"] == "center"]
check("center billed once: 3 lines 30/15/15 = 60", len(cl) == 3 and sum(l["amount"] for l in cl) == 60 and [l["amount"] for l in cl] == [30, 15, 15], cl)
check("center lines name each study's signer", [l["doctor"] for l in cl] == [A, B, C], [l["doctor"] for l in cl])
check("doctor lines: idx1 A 20, idx2 B 10, idx3 C 10", active_map(c5) == {1: (A, 20), 2: (B, 10), 3: (C, 10)}, active_map(c5))
check("no CLAWBACK lines for mixed case", not offsets(c5) and all(l["status"] == "ACTIVE" for l in lines(c5)))
check("history untouched (partial reassign never snapshots)", all(x["history"] == [] for x in studies(c5)))
snap("S5 final", c5)
LOG.append({"S5_invoices": [{"id": i.id, "total": i.total_amount, "lines_sum": sum(int(li.amount) for li in q().query(InvoiceLineItemDB).filter(InvoiceLineItemDB.invoice_id == i.id))}
            for i in q().query(InvoiceDB).filter(InvoiceDB.id.in_({l["invoice"] for l in lines(c5)})).all()]})
print("  invoices:", LOG[-1]["S5_invoices"])
# recheck on mixed case by B: side effect on A's and C's studies
code, r = api("POST", f"/reports/{c5}/recheck", tB, {"reason": "B recheck on mixed case"})
st = studies(c5)
check("[finding] B recheck on mixed case unsigns ALL 3 studies incl. A's and C's", code == 200 and all(x["report_status"] == "DRAFT" for x in st), [(x["claimed_by"], x["report_status"]) for x in st])
code2, r2 = api("POST", f"/reports/{c5}/studies/{s5[0]}/sign", tB, {"findings": "B tries A study"})
check("[finding] B cannot re-sign A's study (403) -> case stuck until A and C re-sign", code2 == 403, r2)
sign(c5, s5[0], tA, "A re"); sign(c5, s5[1], tB, "B re"); code, r = sign(c5, s5[2], tCc, "C re")
check("after A,B,C re-sign: complete, still no offsets, same 3 active lines", r.get("caseComplete") and not offsets(c5) and active_map(c5) == {1: (A, 20), 2: (B, 10), 3: (C, 10)}, active_map(c5))
snap("S5 after mixed recheck", c5)

# ================================================================== concurrency
sec("S6 concurrent duplicate sign calls on the completing study (race)")
c6, s6 = make_case("race", PARTS3[:2], tA, A, A_NAME); ALL_CASES.append(c6)
for s in s6: sign(c6, s, tA, "A")
reassign(c6, B, "race"); sign(c6, s6[0], tB, "B")
res = []
def worker():
    res.append(sign(c6, s6[1], tB, "B race")[0])
ths = [threading.Thread(target=worker) for _ in range(6)]
[t.start() for t in ths]; [t.join() for t in ths]
LOG.append({"S6_status_codes": res}); print("  concurrent statuses:", res)
check("race: exactly 2 offsets, 1 active per study (B), no duplicate payouts", len(offsets(c6)) == 2 and one_active_per_study(c6, 2) and active_map(c6) == {1: (B, 20), 2: (B, 10)}, (res, len(offsets(c6)), active_doc(c6)))
check("race: all requests 200 (no 500s)", all(c == 200 for c in res), res)
snap("S6 final", c6)

# ================================================================== 3 LOCKED PERIOD
sec("S7 LOCKED PERIOD (item 3)")
L0c, L0s = make_case("lk0", PARTS3[:2], tA, A, A_NAME); ALL_CASES.append(L0c)
L1c, L1s = make_case("lk1", PARTS3[:2], tA, A, A_NAME); ALL_CASES.append(L1c)
L2c, L2s = make_case("lk2", PARTS3[:2], tA, A, A_NAME); ALL_CASES.append(L2c)
for s in L1s: sign(L1c, s, tA, "A")
for s in L2s: sign(L2c, s, tA, "A")
sign(L0c, L0s[0], tA, "A")      # L0: 1 of 2 signed, not yet billed
check("L1/L2 billed in 2026-09 with A ACTIVE", active_map(L1c) == {1: (A, 20), 2: (A, 10)} and active_map(L2c) == {1: (A, 20), 2: (A, 10)})
code, r = api("POST", "/billing/lock-period", tAdm, {"period": "2026-09"})
check("admin POST /billing/lock-period 2026-09 -> 200", code == 200 and r.get("locked"), r)
LOG.append({"lock_resp": r})
code, r = api("POST", "/billing/lock-period", tC, {"period": "2026-09"})
check("center cannot lock (403)", code == 403, r)
# L0: never-billed case, last study signed while locked
code, r = sign(L0c, L0s[1], tA, "A")
check("L0 first-time billing while locked -> 409", code == 409, r); LOG.append({"L0_409": r})
d = snap("L0 stuck", L0c)
check("L0 stuck: study2 NOT signed (rolled back), case not Completed, no lines", d["studies"][1]["report_status"] != "SIGNED" and d["case_status"] != "Completed" and not d["lines"], (d["case_status"], [(x["report_status"], x["status"]) for x in d["studies"]]))
# L1/L2: reassign while locked
code, r = reassign(L1c, B, "reassign while locked"); check("reassign while period locked -> 200 (billing untouched)", code == 200 and r.get("caseStatus") == "In Review", r)
LOG.append({"L1_reassign_locked": r})
reassign(L2c, B, "reassign while locked")
check("A lines ACTIVE after locked reassign", active_map(L1c) == {1: (A, 20), 2: (A, 10)} and not offsets(L1c))
code, r = sign(L1c, L1s[0], tB, "B"); check("B signs study1 (not completing) while locked -> 200", code == 200 and r.get("caseComplete") is False, r.get("billing"))
code, r = sign(L1c, L1s[1], tB, "B"); check("B signs completing study while locked -> 409", code == 409, r)
LOG.append({"L1_409": r}); print("   409 body:", r)
d = snap("L1 stuck", L1c)
check("L1 stuck: study1 SIGNED by B (committed earlier), study2 not SIGNED (rolled back)", d["studies"][0]["report_status"] == "SIGNED" and d["studies"][0]["signed_by"] == B and d["studies"][1]["report_status"] != "SIGNED", [(x["report_status"], x["signed_by"]) for x in d["studies"]])
check("L1 stuck: case In Review, A lines ACTIVE, no offsets, no B line (no half-write)", d["case_status"] == "In Review" and active_map(L1c) == {1: (A, 20), 2: (A, 10)} and not offsets(L1c) and not [l for l in d["lines"] if l["doctor"] == B], (d["case_status"], d["lines"]))
code, r = sign(L1c, L1s[1], tB, "B retry"); check("B retry while still locked -> 409 again", code == 409, r)
code, r = api("POST", f"/reports/{L1c}/studies/{L1s[1]}/draft", tB, {"findings": "B draft while locked"})
check("B can still save drafts while stuck", code == 200)
# next period simulated on :8061 (same clone, current_billing_period patched to 2026-10)
code, r = sign(L1c, L1s[1], tB, "B next month", base=B8061)
check("[sim Oct] B signs completing study -> 200", code == 200 and r.get("caseComplete"), r)
LOG.append({"L1_oct_resp_billing": r.get("billing") if isinstance(r, dict) else r})
Lx = lines(L1c)
check("[sim Oct] A Sept originals CLAWED_BACK (status mutated on LOCKED Sept invoice), offsets land in A's 2026-10 invoice, B paid in 2026-10",
      all(l["status"] == "CLAWED_BACK" for l in Lx if l["doctor"] == A and l["amount"] > 0) and all(l["period"] == "2026-10" for l in offsets(L1c)) and active_map(L1c) == {1: (B, 20), 2: (B, 10)} and all(l["period"] == "2026-10" for l in active_doc(L1c)), Lx)
sept_a = q().query(InvoiceDB).filter(InvoiceDB.id == f"inv-doctor-{A}-2026-09").first()
check("[sim Oct] locked Sept A invoice total unchanged (still counts clawed-back +lines)", sept_a.locked, (sept_a.total_amount, sept_a.locked))
snap("L1 after simulated October", L1c)
# L2: stuck then unlock and retry
sign(L2c, L2s[0], tB, "B"); code, r = sign(L2c, L2s[1], tB, "B"); check("L2 stuck with 409", code == 409, r)
code, r = api("POST", "/billing/lock-period", tAdm, {"period": "2026-09", "unlock": True})
check("admin unlock 2026-09 -> 200", code == 200 and r.get("locked") is False, r)
code, r = sign(L2c, L2s[1], tB, "B after unlock"); check("L2: B retry after unlock -> 200 complete", code == 200 and r.get("caseComplete"), r.get("billing"))
check("L2 after unlock: 2 offsets in 2026-09, B active 20/10", len(offsets(L2c)) == 2 and active_map(L2c) == {1: (B, 20), 2: (B, 10)} and all(l["period"] == "2026-09" for l in offsets(L2c)))
code, r = sign(L0c, L0s[1], tA, "A after unlock"); check("L0: A retry after unlock -> billed", code == 200 and r.get("caseComplete") and len(lines(L0c)) == 4, r.get("billing"))
snap("L2 final", L2c); snap("L0 final", L0c)

# ================================================================== invariants
sec("GLOBAL invariants over all audit cases")
for c in ALL_CASES:
    n = len(studies(c))
    check(f"{c}: one ACTIVE doctor line per study", one_active_per_study(c, n), active_doc(c))
    check(f"{c}: exactly n center lines", len([l for l in lines(c) if l["party"] == "center"]) == n)
    ids = [l["id"] for l in lines(c)]; check(f"{c}: offset ids unique / each original clawed at most once",
          len({l["offsets"] for l in offsets(c)}) == len(offsets(c)))
bad = inv_consistency(ALL_CASES)
check("all touched unlocked invoices: total == sum(lines)", not [b for b in bad if not b[3]], bad)
LOG.append({"invoice_inconsistencies": bad})

npass = sum(1 for c in CHECKS if c[2]); nfail = len(CHECKS) - npass
print(f"\nAUDIT RESULT: {npass} PASS / {nfail} FAIL")
for c in CHECKS:
    if not c[2]: print("  FAILED:", c[0], "|", c[1], "|", c[3])
json.dump({"cases": ALL_CASES, "doctorC": C, "userC": uc.id, "checks": CHECKS, "log": LOG},
          open(os.path.join(RAW, "audit_log.json"), "w"), indent=1, default=str)
print("cases:", ALL_CASES)
