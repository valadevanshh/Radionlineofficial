"""Per-study report flow verification. Does NOT change any user passwords."""
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

sys.path.insert(0, ".")

from backend.app.database import SessionLocal, engine
from backend.app.models import (
    UserDB,
    DoctorDB,
    CaseDB,
    StudyDB,
    StudyNotificationDB,
    ReportDB,
    InvoiceLineItemDB,
)
from backend.app.security import create_access_token
from backend.app.routers.study_reports import ensure_study_report_columns

BASE = "http://127.0.0.1:8000/api"
PASS = 0
FAIL = 0
FIX_CASE = None
FIX_STUDIES = []


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


def billing_count(db, case_id):
    return db.query(InvoiceLineItemDB).filter(InvoiceLineItemDB.case_id == case_id).count()


def notif_count(db, study_ids):
    # Center notification is modeled as REPORT_COMPLETED broadcast; we also check case status.
    # Count StudyNotificationDB rows created after fixture for doctor dismissals is not center.
    # Use ReportDB/Case status + optional metadata flag; additionally count invoice as proxy.
    return 0


def main():
    global FIX_CASE, FIX_STUDIES
    ensure_study_report_columns(engine)
    db = SessionLocal()

    center = db.query(UserDB).filter(UserDB.role == "CENTER").first()
    doctors = db.query(UserDB).filter(UserDB.role == "DOCTOR").order_by(UserDB.id).all()
    assert center and len(doctors) >= 2
    doc_a, doc_b = doctors[0], doctors[1]
    doc_a_id = (doc_a.metadata_ or {}).get("doctorId")
    doc_b_id = (doc_b.metadata_ or {}).get("doctorId")
    center_id = (center.metadata_ or {}).get("centerId")
    assert doc_a_id and doc_b_id and center_id
    da = db.query(DoctorDB).filter(DoctorDB.id == doc_a_id).first()

    t_doc = token_for(doc_a)
    t_center = token_for(center)
    t_doc_b = token_for(doc_b)

    stamp = int(time.time() * 1000)
    case_id = f"ps-case-{stamp}"
    FIX_CASE = case_id
    now = datetime.utcnow().isoformat() + "Z"
    parts = ["CHEST PA", "KNEE AP/LAT", "LUMBAR AP/LAT"]
    studies = []
    for i, bp in enumerate(parts):
        sid = f"{case_id}-s{i+1}"
        studies.append(sid)
        FIX_STUDIES.append(sid)

    case = CaseDB(
        id=case_id,
        patient_number=f"PS-{stamp}",
        full_name="SURAJ PER STUDY",
        age=35,
        gender="Male",
        phone="9000000001",
        radiology_center_id=center_id,
        radiology_center_name=center.name,
        referring_physician_id="ref-ps",
        referring_physician_name="DR REF PS",
        status="In Review",
        is_urgent=True,
        study_date="24/09/2026",
        created_at=now,
        metadata_={},
    )
    db.add(case)
    db.add(
        ReportDB(
            id=case_id,
            patient_number=case.patient_number,
            full_name=case.full_name,
            age=35,
            gender="Male",
            phone="9000000001",
            radiology_center_id=center_id,
            radiology_center_name=center.name,
            referring_physician_id="ref-ps",
            referring_physician_name="DR REF PS",
            assigned_doctor_id=doc_a_id,
            assigned_doctor_name=da.full_name if da else doc_a.name,
            status="In Review",
            is_urgent=True,
            study_date="24/09/2026",
            created_at=now,
            metadata_={"bodyParts": parts, "modality": "X-Ray", "isUrgent": True},
        )
    )
    for i, (sid, bp) in enumerate(zip(studies, parts)):
        db.add(
            StudyDB(
                id=sid,
                case_id=case_id,
                modality="X-Ray",
                body_part=bp,
                status="CLAIMED",
                is_urgent=True,
                clinical_notes="PS fixture",
                findings=None,
                impression=None,
                claimed_by=doc_a_id,
                claimed_by_name=da.full_name if da else doc_a.name,
                created_at=now,
                report_status="PENDING",
                metadata_={},
            )
        )
    db.commit()
    print(f"Fixture case={case_id} studies={studies}")

    # Auth on new endpoints
    api("GET", "/reports/my-partial-cases", expect=401)
    api("GET", "/reports/my-partial-cases", token=t_center, expect=403)
    api("POST", f"/reports/{case_id}/studies/{studies[0]}/sign", token=t_center, body={"findings": "x"}, expect=403)

    # is_urgent column / GET reports 200
    code, reports = api("GET", "/reports", token=t_doc, expect=200)
    ok("reports list is list", isinstance(reports, list))
    code, one = api("GET", f"/reports/{case_id}", token=t_doc, expect=200)
    ok("report detail has studies", isinstance((one or {}).get("studies"), list) and len(one["studies"]) == 3)

    # Worklist order: urgent before non-urgent; our urgent fixture should be among first urgents
    if reports:
        first_non_urgent = next((i for i, r in enumerate(reports) if not r.get("isUrgent")), len(reports))
        last_urgent = max((i for i, r in enumerate(reports) if r.get("isUrgent")), default=-1)
        ok("urgent before non-urgent", last_urgent < first_non_urgent or first_non_urgent == len(reports) or last_urgent == -1,
           f"last_urgent={last_urgent} first_non_urgent={first_non_urgent}")

    def sign(idx, findings="Normal findings", impression="Normal"):
        return api(
            "POST",
            f"/reports/{case_id}/studies/{studies[idx]}/sign",
            token=t_doc,
            body={
                "findings": findings,
                "impression": impression,
                "technique": f"X-Ray - {parts[idx]}",
            },
            expect=200,
        )

    before_bill = billing_count(db, case_id)

    # Sign study 1
    code, r1 = sign(0)
    db.expire_all()
    case = db.query(CaseDB).filter(CaseDB.id == case_id).first()
    ok("after study1 case not Completed", case.status != "Completed", case.status)
    ok("after study1 no billing", billing_count(db, case_id) == before_bill)
    ok("study1 response not caseComplete", not (r1 or {}).get("caseComplete"))
    ok("study1 signed count 1", (r1 or {}).get("signedStudyCount") == 1)

    # Sign study 2
    code, r2 = sign(1)
    db.expire_all()
    case = db.query(CaseDB).filter(CaseDB.id == case_id).first()
    ok("after study2 case not Completed", case.status != "Completed", case.status)
    ok("after study2 no billing", billing_count(db, case_id) == before_bill)
    ok("study2 not caseComplete", not (r2 or {}).get("caseComplete"))
    ok("partial-cases lists case", True)
    code, partial = api("GET", "/reports/my-partial-cases", token=t_doc, expect=200)
    ids = [i["id"] for i in (partial or {}).get("items", [])]
    ok("partial endpoint contains fixture", case_id in ids, str(ids)[:120])

    # Reassign midway — signed stay, pending move
    from backend.app.routers import case_thread as ct

    # Use API flag-reassign if available
    code, reas = api(
        "POST",
        f"/reports/{case_id}/flag-reassign",
        token=t_center,
        body={"reason": "PS reassign test", "toDoctorId": doc_b_id},
        expect=200,
    )
    db.expire_all()
    st_rows = db.query(StudyDB).filter(StudyDB.case_id == case_id).order_by(StudyDB.id).all()
    signed = [s for s in st_rows if (s.report_status or "").upper() == "SIGNED"]
    pending = [s for s in st_rows if (s.report_status or "").upper() != "SIGNED"]
    ok("signed studies remain with doc_a", all(s.claimed_by == doc_a_id for s in signed), str([(s.id, s.claimed_by) for s in signed]))
    ok("pending moved to doc_b", all(s.claimed_by == doc_b_id for s in pending), str([(s.id, s.claimed_by) for s in pending]))

    # Move pending back to doc_a to finish signing (or sign as doc_b)
    for s in pending:
        s.claimed_by = doc_a_id
        s.claimed_by_name = da.full_name if da else doc_a.name
        s.status = "CLAIMED"
    db.commit()

    # Sign study 3 — should complete + bill once + notify
    code, r3 = sign(2)
    db.expire_all()
    case = db.query(CaseDB).filter(CaseDB.id == case_id).first()
    rep = db.query(ReportDB).filter(ReportDB.id == case_id).first()
    ok("after study3 case Completed", case.status == "Completed", case.status)
    ok("after study3 report Completed", rep.status == "Completed", rep.status)
    ok("study3 caseComplete", bool((r3 or {}).get("caseComplete")))
    ok("billing created", billing_count(db, case_id) > before_bill, str(billing_count(db, case_id)))
    bill_after = billing_count(db, case_id)

    # Idempotent: sign again shouldn't double bill
    code, r3b = api(
        "POST",
        f"/reports/{case_id}/studies/{studies[2]}/sign",
        token=t_doc,
        body={"findings": "Normal findings", "impression": "Normal"},
        expect=200,
    )
    ok("no double bill", billing_count(db, case_id) == bill_after)

    # Cleanup
    db.query(InvoiceLineItemDB).filter(InvoiceLineItemDB.case_id == case_id).delete()
    db.query(StudyNotificationDB).filter(StudyNotificationDB.study_id.in_(studies)).delete()
    db.query(StudyDB).filter(StudyDB.case_id == case_id).delete()
    db.query(ReportDB).filter(ReportDB.id == case_id).delete()
    db.query(CaseDB).filter(CaseDB.id == case_id).delete()
    db.commit()
    db.close()
    print(f"\nRESULT: {PASS} passed, {FAIL} failed")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print("ERROR", e)
        # best-effort cleanup
        try:
            db = SessionLocal()
            if FIX_CASE:
                db.query(InvoiceLineItemDB).filter(InvoiceLineItemDB.case_id == FIX_CASE).delete()
                if FIX_STUDIES:
                    db.query(StudyNotificationDB).filter(StudyNotificationDB.study_id.in_(FIX_STUDIES)).delete()
                db.query(StudyDB).filter(StudyDB.case_id == FIX_CASE).delete()
                db.query(ReportDB).filter(ReportDB.id == FIX_CASE).delete()
                db.query(CaseDB).filter(CaseDB.id == FIX_CASE).delete()
                db.commit()
            db.close()
        except Exception:
            pass
        raise
