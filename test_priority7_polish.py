"""Priority 7 automated API verification. Does NOT change any user passwords."""
import json
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
    CenterDB,
    CaseDB,
    StudyDB,
    PendingApprovalDB,
    InvoiceDB,
    TemplateDB,
)
from backend.app.security import create_access_token
from backend.app import billing as billing_svc

BASE = "http://127.0.0.1:8000/api"
PASS = 0
FAIL = 0
FIX_IDS = {"approvals": [], "cases": [], "templates": [], "invoices": []}


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


def cleanup(db):
    for aid in FIX_IDS["approvals"]:
        db.query(PendingApprovalDB).filter(PendingApprovalDB.id == aid).delete()
    for tid in FIX_IDS["templates"]:
        db.query(TemplateDB).filter(TemplateDB.id == tid).delete()
    for cid in FIX_IDS["cases"]:
        db.query(StudyDB).filter(StudyDB.case_id == cid).delete()
        db.query(CaseDB).filter(CaseDB.id == cid).delete()
    for iid in FIX_IDS["invoices"]:
        db.query(InvoiceDB).filter(InvoiceDB.id == iid).delete()
    db.commit()


def main():
    db = SessionLocal()
    center = db.query(UserDB).filter(UserDB.role == "CENTER").first()
    doctor = db.query(UserDB).filter(UserDB.role == "DOCTOR").first()
    manager = db.query(UserDB).filter(UserDB.role == "MANAGER").first()
    admin = db.query(UserDB).filter(UserDB.role == "SUPER_ADMIN").first()
    assert admin, "Need SUPER_ADMIN"
    assert doctor, "Need DOCTOR"
    assert center, "Need CENTER"

    t_admin = token_for(admin)
    t_doc = token_for(doctor)
    t_center = token_for(center)
    t_manager = token_for(manager) if manager else None

    stamp = int(time.time() * 1000)
    period = billing_svc.current_billing_period()

    # --- Auth gates for revenue ---
    print("\n=== Revenue auth ===")
    api("GET", "/billing/revenue", token=None, expect=401)
    api("GET", "/billing/revenue", token=t_doc, expect=403)
    api("GET", "/billing/revenue", token=t_center, expect=403)
    if t_manager:
        api("GET", "/billing/revenue", token=t_manager, expect=403)

    # Seed known invoices for current period, then verify sums
    c_inv_id = f"inv-center-p7test-{stamp}"
    d_inv_id = f"inv-doctor-p7test-{stamp}"
    FIX_IDS["invoices"] = [c_inv_id, d_inv_id]
    ts = billing_svc.now_ist_iso()
    db.add(
        InvoiceDB(
            id=c_inv_id,
            party_type="center",
            party_id=f"p7-center-{stamp}",
            party_name="P7 Test Center",
            billing_period=period,
            status="pending",
            locked=False,
            total_amount=90,
            currency="INR",
            created_at=ts,
            updated_at=ts,
            metadata_={},
        )
    )
    db.add(
        InvoiceDB(
            id=d_inv_id,
            party_type="doctor",
            party_id=f"p7-doc-{stamp}",
            party_name="P7 Test Doctor",
            billing_period=period,
            status="paid",
            locked=False,
            total_amount=40,
            currency="INR",
            created_at=ts,
            updated_at=ts,
            metadata_={},
        )
    )
    db.commit()

    # Independent DB sum for current period
    invs = db.query(InvoiceDB).filter(InvoiceDB.billing_period == period).all()
    center_sum = sum(int(i.total_amount or 0) for i in invs if i.party_type == "center")
    doctor_sum = sum(int(i.total_amount or 0) for i in invs if i.party_type == "doctor")
    net = center_sum - doctor_sum
    center_paid = sum(
        int(i.total_amount or 0)
        for i in invs
        if i.party_type == "center" and billing_svc.compute_effective_status(i.status, i.billing_period) == "paid"
    )
    center_pending = center_sum - center_paid

    st, rev = api("GET", "/billing/revenue?months=6", token=t_admin, expect=200)
    ok("revenue has currentMonth", isinstance(rev, dict) and "currentMonth" in (rev or {}))
    cm = (rev or {}).get("currentMonth") or {}
    ok("centerBilling matches DB", cm.get("centerBilling") == center_sum, f"api={cm.get('centerBilling')} db={center_sum}")
    ok("doctorPayouts matches DB", cm.get("doctorPayouts") == doctor_sum, f"api={cm.get('doctorPayouts')} db={doctor_sum}")
    ok("net matches DB", cm.get("net") == net, f"api={cm.get('net')} db={net}")
    ok("centerPending matches", cm.get("centerPending") == center_pending, f"api={cm.get('centerPending')} db={center_pending}")
    ok("fixture amounts reflected", cm.get("centerBilling", 0) >= 90 and cm.get("doctorPayouts", 0) >= 40)
    ok("trend is list", isinstance((rev or {}).get("trend"), list))
    ok("currentPeriod is IST month", (rev or {}).get("currentPeriod") == period, str((rev or {}).get("currentPeriod")))

    # --- Approval before/after ---
    print("\n=== Approval diffs ===")
    center_row = db.query(CenterDB).first()
    assert center_row
    case_id = f"p7-case-{stamp}"
    FIX_IDS["cases"].append(case_id)
    now = datetime.utcnow().isoformat() + "Z"
    db.add(
        CaseDB(
            id=case_id,
            patient_number=f"P7-{stamp}",
            full_name="P7 BEFORE NAME",
            age=45,
            gender="Male",
            phone="9000000000",
            radiology_center_id=center_row.id,
            radiology_center_name=center_row.center_name,
            referring_physician_id="ref-p7",
            referring_physician_name="DR P7",
            status="Pending",
            is_urgent=False,
            study_date="24/09/2026",
            created_at=now,
            metadata_={"bodyParts": ["CHEST PA/AP"], "modality": "X-Ray", "clinicalNotes": "before notes"},
        )
    )
    db.add(
        StudyDB(
            id=f"{case_id}-s1",
            case_id=case_id,
            modality="X-Ray",
            body_part="CHEST PA/AP",
            status="UNCLAIMED",
            is_urgent=False,
            clinical_notes="before notes",
            created_at=now,
            metadata_={},
        )
    )
    db.commit()

    # Auth on approvals list
    api("GET", "/approvals", token=None, expect=401)

    payload = {
        "id": case_id,
        "fullName": "P7 AFTER NAME",
        "age": 46,
        "gender": "Male",
        "phone": "9000000000",
        "radiologyCenterId": center_row.id,
        "radiologyCenterName": center_row.center_name,
        "referringPhysicianId": "ref-p7",
        "referringPhysicianName": "DR P7",
        "status": "Pending",
        "isUrgent": True,
        "studyDate": "24/09/2026",
        "bodyParts": ["CHEST PA/AP"],
        "modality": "X-Ray",
        "clinicalNotes": "after notes",
        "patientNumber": f"P7-{stamp}",
    }
    submit_body = {
        "managerId": str(manager.id) if manager else "mgr-p7",
        "managerName": (manager.name if manager else "Manager P7"),
        "actionType": "UPDATE_CASE",
        "entityType": "case",
        "entityId": case_id,
        "payload": payload,
    }
    token_submit = t_manager or t_admin
    st, appr = api("POST", "/approvals/submit", token=token_submit, body=submit_body, expect=200)
    appr_id = (appr or {}).get("id")
    ok("approval created", bool(appr_id))
    if appr_id:
        FIX_IDS["approvals"].append(appr_id)

    st, alist = api("GET", "/approvals?status=PENDING", token=t_admin, expect=200)
    found = next((a for a in (alist or []) if a.get("id") == appr_id), None)
    ok("pending approval in list", found is not None)
    if found:
        before = found.get("before") or {}
        after = found.get("payload") or {}
        ok("before present", isinstance(before, dict) and before.get("fullName") == "P7 BEFORE NAME", str(before.get("fullName")))
        ok("after has new name", after.get("fullName") == "P7 AFTER NAME")
        ok("before age 45", before.get("age") == 45, str(before.get("age")))
        ok("after age 46", after.get("age") == 46)
        ok("password not in before", "password" not in before or before.get("password") in (None, "***"))

    # --- Template match endpoint still works; filter is frontend ---
    print("\n=== Templates match ===")
    tmpl_id = f"tmpl-p7-{stamp}"
    FIX_IDS["templates"].append(tmpl_id)
    db.add(
        TemplateDB(
            id=tmpl_id,
            title="P7 Chest Template",
            center_id="ALL",
            center_name="All Centers",
            modality="X-Ray",
            created_at=now,
            metadata_={"bodyPart": "CHEST PA/AP", "findings": "Clear", "impression": "Normal"},
        )
    )
    # distractor
    tmpl_other = f"tmpl-p7-other-{stamp}"
    FIX_IDS["templates"].append(tmpl_other)
    db.add(
        TemplateDB(
            id=tmpl_other,
            title="P7 Knee Template",
            center_id="ALL",
            center_name="All Centers",
            modality="X-Ray",
            created_at=now,
            metadata_={"bodyPart": "KNEE JOINT", "findings": "Knee", "impression": "OK"},
        )
    )
    db.commit()

    st, matched = api("GET", f"/templates/match?modality=X-Ray&bodyPart=CHEST%20PA%2FAP", token=t_admin, expect=200)
    ok("match returns chest template", matched and matched.get("id") == tmpl_id, str((matched or {}).get("id")))
    st, all_tmpls = api("GET", "/templates", token=t_admin, expect=200)
    ids = [t.get("id") for t in (all_tmpls or [])]
    ok("list includes both templates", tmpl_id in ids and tmpl_other in ids)
    # Frontend filter evidence: matching logic replicated
    def matches(tmpl, modality, body_parts):
        t_mod = (tmpl.get("modality") or "").strip().lower()
        t_bp = (tmpl.get("bodyPart") or "").strip().lower()
        case_mod = modality.strip().lower()
        bps = [b.strip().lower() for b in body_parts]
        modality_ok = not case_mod or not t_mod or t_mod == case_mod
        body_ok = (not bps) or (not t_bp) or any(bp == t_bp or bp in t_bp or t_bp in bp for bp in bps)
        return modality_ok and body_ok

    filtered = [t for t in (all_tmpls or []) if matches(t, "X-Ray", ["CHEST PA/AP"])]
    filtered_ids = [t["id"] for t in filtered]
    ok("filter keeps chest", tmpl_id in filtered_ids)
    ok("filter drops knee", tmpl_other not in filtered_ids, str(filtered_ids))

    # Passwords untouched spot-check
    print("\n=== Password integrity ===")
    for u in (admin, doctor, center):
        meta = u.metadata_ or {}
        pwd = meta.get("password") or ""
        ok(f"password hash intact for {u.email}", pwd.startswith("$2") or pwd == "", f"prefix={pwd[:4]!r}")

    print("\n=== Cleanup ===")
    cleanup(db)
    left = db.query(PendingApprovalDB).filter(PendingApprovalDB.id.in_(FIX_IDS["approvals"] or ["__none__"])).count()
    ok("approvals cleaned", left == 0)
    left_c = db.query(CaseDB).filter(CaseDB.id == case_id).first()
    ok("case cleaned", left_c is None)
    left_i = db.query(InvoiceDB).filter(InvoiceDB.id.in_(FIX_IDS["invoices"])).count()
    ok("invoices cleaned", left_i == 0)

    db.close()
    print(f"\n==== SUMMARY: {PASS} passed, {FAIL} failed ====")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print("FATAL:", e)
        try:
            db = SessionLocal()
            cleanup(db)
            db.close()
        except Exception:
            pass
        raise
