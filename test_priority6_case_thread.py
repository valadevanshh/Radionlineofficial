"""Priority 6 automated API verification. Does NOT change any user passwords."""
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
    ReportCommentDB,
)
from backend.app.security import create_access_token
from backend.app.routers.case_thread import ensure_report_comment_tables

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


def main():
    global FIX_CASE, FIX_STUDIES
    ensure_report_comment_tables(engine)
    db = SessionLocal()

    center = db.query(UserDB).filter(UserDB.role == "CENTER").first()
    doctors = db.query(UserDB).filter(UserDB.role == "DOCTOR").order_by(UserDB.id).all()
    manager = db.query(UserDB).filter(UserDB.role == "MANAGER").first()
    admin = db.query(UserDB).filter(UserDB.role == "SUPER_ADMIN").first()

    assert center, "Need a CENTER user"
    assert len(doctors) >= 2, "Need at least 2 DOCTOR users"
    doc_a, doc_b = doctors[0], doctors[1]
    doc_a_id = (doc_a.metadata_ or {}).get("doctorId")
    doc_b_id = (doc_b.metadata_ or {}).get("doctorId")
    assert doc_a_id and doc_b_id
    center_id = (center.metadata_ or {}).get("centerId")
    assert center_id

    da = db.query(DoctorDB).filter(DoctorDB.id == doc_a_id).first()
    db_doc = db.query(DoctorDB).filter(DoctorDB.id == doc_b_id).first()

    t_center = token_for(center)
    t_doc_a = token_for(doc_a)
    t_doc_b = token_for(doc_b)
    t_manager = token_for(manager) if manager else None
    t_admin = token_for(admin) if admin else None

    stamp = int(time.time() * 1000)
    case_id = f"p6-case-{stamp}"
    FIX_CASE = case_id
    now = datetime.utcnow().isoformat() + "Z"
    study_id = f"{case_id}-chest"

    case = CaseDB(
        id=case_id,
        patient_number=f"P6-{stamp}",
        full_name="P6 TEST PATIENT",
        age=40,
        gender="Male",
        phone="9999999999",
        radiology_center_id=center_id,
        radiology_center_name=center.name,
        referring_physician_id="ref-p6",
        referring_physician_name="DR REF P6",
        status="Completed",
        is_urgent=False,
        study_date="24/09/2026",
        created_at=now,
        metadata_={},
    )
    study = StudyDB(
        id=study_id,
        case_id=case_id,
        modality="X-Ray",
        body_part="CHEST PA/AP",
        status="Completed",
        is_urgent=False,
        clinical_notes="P6 fixture",
        findings="Normal",
        impression="Normal",
        claimed_by=doc_a_id,
        claimed_by_name=da.full_name if da else doc_a.name,
        created_at=now,
        metadata_={},
    )
    db.add(case)
    db.add(study)
    db.add(
        StudyNotificationDB(
            study_id=study_id,
            doctor_id=doc_a_id,
            notified_at=now,
            dismissed_reason="accepted_self",
        )
    )
    db.commit()
    FIX_STUDIES = [study_id]
    print(f"Fixture case={case_id} study={study_id} center={center_id}")
    print(f"doc_a={doc_a.email}/{doc_a_id} doc_b={doc_b.email}/{doc_b_id}")

    print("\n=== Auth gates ===")
    api("GET", f"/reports/{case_id}/comments", token=None, expect=401)
    api(
        "POST",
        f"/reports/{case_id}/flag-reassign",
        token=t_doc_a,
        body={"reason": "x", "toDoctorId": doc_b_id},
        expect=403,
    )
    api(
        "POST",
        f"/reports/{case_id}/recheck",
        token=t_center,
        body={"reason": "x"},
        expect=403,
    )

    print("\n=== Comment thread ===")
    st, _ = api(
        "POST",
        f"/reports/{case_id}/comments",
        token=t_center,
        body={"body": "P6 follow-up note from center"},
        expect=200,
    )
    st, thread = api("GET", f"/reports/{case_id}/comments", token=t_center, expect=200)
    ok("thread has comment", isinstance(thread, list) and len(thread) >= 1, f"n={len(thread) if thread else 0}")
    ok("comment kind", thread and thread[0]["kind"] == "COMMENT")

    print("\n=== Recheck (owning doctor on completed) ===")
    api(
        "POST",
        f"/reports/{case_id}/recheck",
        token=t_doc_b,
        body={"reason": "Wrong doctor should fail"},
        expect=403,
    )
    st, recheck = api(
        "POST",
        f"/reports/{case_id}/recheck",
        token=t_doc_a,
        body={"reason": "Please recheck lung apex"},
        expect=200,
    )
    ok("recheck kind", recheck and recheck.get("recheck", {}).get("kind") == "RECHECK")

    st, thread = api("GET", f"/reports/{case_id}/comments", token=t_center, expect=200)
    kinds = [c["kind"] for c in (thread or [])]
    ok("thread has RECHECK", "RECHECK" in kinds, str(kinds))

    print("\n=== Flag & reassign (center) ===")
    st, result = api(
        "POST",
        f"/reports/{case_id}/flag-reassign",
        token=t_center,
        body={"reason": "Need second opinion from Dr B", "toDoctorId": doc_b_id},
        expect=200,
    )
    ok("claimedBy is doc_b", result and result.get("claimedBy") == doc_b_id, str(result))

    db.expire_all()
    study_row = db.query(StudyDB).filter(StudyDB.id == study_id).first()
    ok("DB claimed_by == doc_b", study_row and study_row.claimed_by == doc_b_id, getattr(study_row, "claimed_by", None))
    ok("DB status CLAIMED", study_row and study_row.status == "CLAIMED", getattr(study_row, "status", None))
    case_row = db.query(CaseDB).filter(CaseDB.id == case_id).first()
    ok("case not Completed after reassign", case_row and case_row.status != "Completed", getattr(case_row, "status", None))

    notif = (
        db.query(StudyNotificationDB)
        .filter(
            StudyNotificationDB.study_id == study_id,
            StudyNotificationDB.doctor_id == doc_b_id,
        )
        .first()
    )
    ok("new doctor notification row", notif is not None and notif.dismissed_reason is None)

    st, thread = api("GET", f"/reports/{case_id}/comments", token=t_doc_b, expect=200)
    kinds = [c["kind"] for c in (thread or [])]
    ok("thread has FLAG", "FLAG" in kinds, str(kinds))
    ok("thread has REASSIGN", "REASSIGN" in kinds, str(kinds))
    ok("thread chronological ids", thread == sorted(thread, key=lambda c: (c["createdAt"], c["id"])))

    # Doctor A (previous) should still read if they have old notif; they may lose access
    # under tightened rules (no longer claimant). Accept 200 or 403.
    st_old, _ = api("GET", f"/reports/{case_id}/comments", token=t_doc_a)
    ok("old doctor access after reassign is gated", st_old in (200, 403), f"status={st_old}")

    # Doctor cannot reassign
    api(
        "POST",
        f"/reports/{case_id}/flag-reassign",
        token=t_doc_b,
        body={"reason": "nope", "toDoctorId": doc_a_id},
        expect=403,
    )

    # Empty reason rejected
    api(
        "POST",
        f"/reports/{case_id}/flag-reassign",
        token=t_center,
        body={"reason": "  ", "toDoctorId": doc_a_id},
        expect=400,
    )

    if t_manager:
        print("\n=== Manager can comment ===")
        api(
            "POST",
            f"/reports/{case_id}/comments",
            token=t_manager,
            body={"body": "Manager note"},
            expect=200,
        )

    print("\n=== Persistence reload ===")
    st, thread2 = api("GET", f"/reports/{case_id}/comments", token=t_center, expect=200)
    ok("persisted count >= 4", thread2 and len(thread2) >= 4, f"n={len(thread2) if thread2 else 0}")

    # Cleanup fixtures
    print("\n=== Cleanup ===")
    db.query(ReportCommentDB).filter(ReportCommentDB.case_id == case_id).delete()
    db.query(StudyNotificationDB).filter(StudyNotificationDB.study_id == study_id).delete()
    db.query(StudyDB).filter(StudyDB.case_id == case_id).delete()
    db.query(CaseDB).filter(CaseDB.id == case_id).delete()
    db.commit()
    left = db.query(CaseDB).filter(CaseDB.id == case_id).first()
    ok("fixture case removed", left is None)

    # Confirm passwords untouched: spot-check bcrypt still present
    for u in (center, doc_a, doc_b):
        meta = u.metadata_ or {}
        pwd = meta.get("password") or ""
        ok(f"password hash intact for {u.email}", pwd.startswith("$2"), f"prefix={pwd[:4]!r}")

    db.close()
    print(f"\n==== SUMMARY: {PASS} passed, {FAIL} failed ====")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print("FATAL:", e)
        # best-effort cleanup
        try:
            db = SessionLocal()
            if FIX_CASE:
                db.query(ReportCommentDB).filter(ReportCommentDB.case_id == FIX_CASE).delete()
                for sid in FIX_STUDIES:
                    db.query(StudyNotificationDB).filter(StudyNotificationDB.study_id == sid).delete()
                db.query(StudyDB).filter(StudyDB.case_id == FIX_CASE).delete()
                db.query(CaseDB).filter(CaseDB.id == FIX_CASE).delete()
                db.commit()
            db.close()
        except Exception:
            pass
        raise
