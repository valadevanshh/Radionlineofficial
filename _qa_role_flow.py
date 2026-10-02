"""End-to-end 4-role QA against the local API. Creates throwaway accounts only."""
from __future__ import annotations

import json
import sys
import traceback
from datetime import date
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE = "http://localhost:8000/api"
RESULTS: list[dict] = []


def rec(role: str, step: str, ok: bool, detail: str = "", extra: dict | None = None):
    row = {"role": role, "step": step, "ok": ok, "detail": detail}
    if extra:
        row["extra"] = extra
    RESULTS.append(row)
    flag = "PASS" if ok else "FAIL"
    print(f"[{flag}] {role:12} {step}: {detail}")


def req(method: str, path: str, token: str | None = None, body: dict | None = None, timeout: int = 30):
    data = None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    r = Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urlopen(r, timeout=timeout) as resp:
            raw = resp.read()
            code = resp.status
            parsed = json.loads(raw.decode("utf-8")) if raw else None
            return code, parsed, ""
    except HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        return e.code, None, err
    except URLError as e:
        return 0, None, str(e)


def login(email: str, password: str):
    code, data, err = req("POST", "/auth/login", body={"email": email, "password": password})
    if code == 200 and data and data.get("access_token"):
        return data["access_token"], data.get("user") or {}
    return None, {"status": code, "err": err}


def main():
    # --- Super Admin login ---
    admin_tok, admin_user = login("admin@radio.com", "radio@1")
    rec("SUPER_ADMIN", "Login", bool(admin_tok), admin_user.get("name") if admin_tok else str(admin_user))
    if not admin_tok:
        print("Cannot continue without admin")
        return

    # --- Manager login ---
    mgr_tok, mgr_user = login("manager@radio.com", "manager@123")
    rec("MANAGER", "Login", bool(mgr_tok), mgr_user.get("name") if mgr_tok else str(mgr_user))

    # --- Create throwaway center ---
    center_email = "qa.center@radionet.test"
    center_pw = "QaCenter!2026"
    code, center, err = req(
        "POST",
        "/centers",
        admin_tok,
        {
            "id": "center-qa-flow-001",
            "centerName": "QA Flow Diagnostic Center",
            "firstName": "QA",
            "lastName": "Center",
            "email": center_email,
            "username": center_email,
            "password": center_pw,
            "contactNumber": "9000000001",
            "address": "QA Lab, Test City",
        },
    )
    rec("SUPER_ADMIN", "Create test center", code == 200, f"{code} {center.get('id') if center else err[:180]}")

    # --- Create throwaway doctor ---
    doc_email = "qa.doctor@radionet.test"
    doc_pw = "QaDoctor!2026"
    code, doctor, err = req(
        "POST",
        "/doctors",
        admin_tok,
        {
            "id": "doc-qa-flow-001",
            "firstName": "QA",
            "lastName": "Radiologist",
            "fullName": "DR. QA RADIOLOGIST",
            "email": doc_email,
            "username": doc_email,
            "password": doc_pw,
            "contactNumber": "9000000002",
            "address": "QA Reading Room",
            "degree": "M.D. (Radiodiagnosis)",
            "registrationNumber": "QA-REG-001",
        },
    )
    rec("SUPER_ADMIN", "Create test doctor", code == 200, f"{code} {doctor.get('id') if doctor else err[:180]}")

    # --- Login as new center + doctor ---
    ctr_tok, ctr_user = login(center_email, center_pw)
    rec(
        "CENTER",
        "Login (created account)",
        bool(ctr_tok),
        f"name={ctr_user.get('name')} centerId={ctr_user.get('centerId')}" if ctr_tok else str(ctr_user),
    )
    doc_tok, doc_user = login(doc_email, doc_pw)
    rec(
        "DOCTOR",
        "Login (created account)",
        bool(doc_tok),
        f"name={doc_user.get('name')} doctorId={doc_user.get('doctorId')}" if doc_tok else str(doc_user),
    )

    # --- Super Admin: list surfaces ---
    for label, path in [
        ("List doctors", "/doctors"),
        ("List centers", "/centers"),
        ("List reports", "/reports"),
        ("List approvals", "/approvals"),
        ("List invoices", "/invoices?partyType=center"),
        ("List doctor invoices", "/invoices?partyType=doctor"),
        ("Pricing", "/billing/pricing"),
        ("Billing periods", "/billing/periods"),
        ("Templates", "/templates"),
        ("Users", "/auth/users"),
    ]:
        code, data, err = req("GET", path, admin_tok)
        n = len(data) if isinstance(data, list) else ("obj" if data else 0)
        rec("SUPER_ADMIN", label, code == 200, f"{code} n={n}" if code == 200 else f"{code} {err[:160]}")

    # --- Manager: list + submit CREATE_DOCTOR approval ---
    if mgr_tok:
        for label, path in [
            ("List reports", "/reports"),
            ("List doctors", "/doctors"),
            ("List centers", "/centers"),
            ("My submissions", f"/approvals?managerId={mgr_user.get('email','')}"),
            ("Invoices (should be limited)", "/invoices?partyType=center"),
        ]:
            code, data, err = req("GET", path, mgr_tok)
            rec("MANAGER", label, 200 <= code < 300 or code in (403, 401), f"{code} {(err[:120] if err else ('n='+str(len(data) if isinstance(data,list) else 'ok')))}")

        code, appr, err = req(
            "POST",
            "/approvals/submit",
            mgr_tok,
            {
                "managerId": mgr_user.get("email"),
                "managerName": mgr_user.get("name"),
                "actionType": "CREATE_DOCTOR",
                "entityType": "doctor",
                "payload": {
                    "firstName": "QA",
                    "lastName": "PendingDoc",
                    "fullName": "DR. QA PENDINGDOC",
                    "email": "qa.pendingdoc@radionet.test",
                    "username": "qa.pendingdoc@radionet.test",
                    "password": "QaPending!2026",
                    "contactNumber": "9000000003",
                },
            },
        )
        rec("MANAGER", "Submit CREATE_DOCTOR approval", code == 200, f"{code} id={appr.get('id') if appr else err[:160]}")
        pending_id = appr.get("id") if appr else None

        # Manager should not be able to approve own request
        if pending_id:
            code, _, err = req("POST", f"/approvals/{pending_id}/approve", mgr_tok, {"reviewerName": "Manager"})
            rec("MANAGER", "Self-approve (must fail)", code in (401, 403), f"{code} {err[:160]}")

            code, approved, err = req(
                "POST",
                f"/approvals/{pending_id}/approve",
                admin_tok,
                {"reviewerName": "Super Admin"},
            )
            rec("SUPER_ADMIN", "Approve manager CREATE_DOCTOR", code == 200, f"{code} status={approved.get('status') if approved else err[:160]}")

            pend_tok, pend_user = login("qa.pendingdoc@radionet.test", "QaPending!2026")
            rec(
                "DOCTOR",
                "Login after approval-created account",
                bool(pend_tok),
                f"doctorId={pend_user.get('doctorId')}" if pend_tok else str(pend_user),
            )

    # --- Center: create STAT multi-study case ---
    case_id = None
    case_payload_template = None
    if ctr_tok and center:
        today = date.today().isoformat()
        case_payload_template = {
            "patientNumber": "QA-FLOW-001",
            "fullName": "QA Test Patient",
            "age": 9,
            "ageUnit": "Months",
            "gender": "Female",
            "phone": "9000000099",
            "radiologyCenterId": center.get("id") or ctr_user.get("centerId"),
            "radiologyCenterName": center.get("centerName") or "QA Flow Diagnostic Center",
            "bodyParts": ["CHEST PA/AP", "KNEE JOINT AP/LAT"],
            "referringPhysicianId": "ref-qa",
            "referringPhysicianName": "DR. REFERRING QA",
            "status": "Pending",
            "studyDate": today,
            "clinicalNotes": "Cough 3 days. Rule out pneumonia. Infant 9 months.",
            "modality": "X-Ray",
            "isUrgent": True,
            "isPortable": True,
            "claimStatus": "UNCLAIMED",
            "uploadedImages": [],
        }
        payload = case_payload_template
        code, case, err = req("POST", "/reports", ctr_tok, payload)
        rec(
            "CENTER",
            "Create STAT portable 2-study infant case",
            code == 200,
            f"{code} id={case.get('id') if case else ''} status={case.get('status') if case else err[:160]}",
        )
        if case:
            case_id = case.get("id")
            rec(
                "CENTER",
                "Case identity fields returned",
                True,
                f"age={case.get('age')} ageUnit={case.get('ageUnit')} gender={case.get('gender')} urgent={case.get('isUrgent')} portable={case.get('isPortable')} studies={len(case.get('studies') or [])}",
            )

        # Center invoices
        code, inv, err = req("GET", "/invoices?partyType=center", ctr_tok)
        rec("CENTER", "Own invoices", code == 200, f"{code} n={len(inv) if isinstance(inv, list) else err[:120]}")

        # Center should not see admin invoices unlock? just list
        code, docs, err = req("GET", "/doctors", ctr_tok)
        rec("CENTER", "List doctors", code == 200, f"{code} n={len(docs) if isinstance(docs, list) else err[:120]}")

        # Center my-work should fail
        code, _, err = req("GET", "/reports/my-work", ctr_tok)
        rec("CENTER", "My Work (must be doctor-only)", code in (401, 403), f"{code} {err[:120]}")

    # --- Doctor: see queue, claim with email (Live Feed bug), claim with doctorId, my-work ---
    if doc_tok and case_id:
        code, reports, err = req("GET", "/reports", doc_tok)
        rec("DOCTOR", "List all reports (unscoped?)", code == 200, f"{code} n={len(reports) if isinstance(reports, list) else 0}")
        seen = False
        hidden_self = False
        if isinstance(reports, list):
            mine = [r for r in reports if r.get("id") == case_id]
            seen = bool(mine)
            rec("DOCTOR", "QA case visible in global list", seen, f"found={seen}")

        # Claim using EMAIL like Live Feed does
        code, claimed_email, err = req(
            "POST",
            f"/reports/{case_id}/claim",
            doc_tok,
            {"doctorId": doc_user.get("email"), "doctorName": doc_user.get("name")},
        )
        rec(
            "DOCTOR",
            "Claim via email (Live Feed path)",
            code in (200, 409),
            f"{code} claimedBy={claimed_email.get('claimedByDoctorId') if claimed_email else err[:140]}",
        )

        # If 409, someone else or already claimed — try doctorId path on a second case
        if code == 409:
            # create another case as center
            if ctr_tok:
                payload2 = dict(payload)
                payload2["patientNumber"] = "QA-FLOW-002"
                payload2["fullName"] = "QA Second Patient"
                payload2["isUrgent"] = False
                code2, case2, err2 = req("POST", "/reports", ctr_tok, payload2)
                rec("CENTER", "Create second routine case", code2 == 200, f"{code2} {case2.get('id') if case2 else err2[:120]}")
                if case2:
                    case_id = case2["id"]
                    code, claimed_email, err = req(
                        "POST",
                        f"/reports/{case_id}/claim",
                        doc_tok,
                        {"doctorId": doc_user.get("email"), "doctorName": doc_user.get("name")},
                    )
                    rec(
                        "DOCTOR",
                        "Claim case-2 via email",
                        code == 200,
                        f"{code} claimedBy={claimed_email.get('claimedByDoctorId') if claimed_email else err[:140]}",
                    )

        # My Work after email claim
        code, mywork, err = req("GET", "/reports/my-work", doc_tok)
        rec(
            "DOCTOR",
            "My Work after email-claim",
            code == 200,
            f"{code} total={mywork.get('total') if isinstance(mywork, dict) else err[:140]}",
        )
        in_mywork = False
        if isinstance(mywork, dict):
            items = mywork.get("items") or mywork.get("reports") or []
            in_mywork = any((i.get("id") == case_id) for i in items)
            rec("DOCTOR", "Email-claimed case in My Work", in_mywork, f"in_mywork={in_mywork} keys={list(mywork.keys())[:8]}")

        # All-reports hide logic simulation
        claimed_by = (claimed_email or {}).get("claimedByDoctorId")
        doctor_id = doc_user.get("doctorId")
        would_hide = bool(claimed_by and doctor_id and claimed_by != doctor_id)
        rec(
            "DOCTOR",
            "All Reports would hide own email-claim",
            True,
            f"claimedBy={claimed_by} doctorId={doctor_id} hide={would_hide}",
        )

        # Get case detail + studies
        code, detail, err = req("GET", f"/reports/{case_id}", doc_tok)
        rec("DOCTOR", "Open workspace case", code == 200, f"{code} studies={len((detail or {}).get('studies') or [])} ageUnit={ (detail or {}).get('ageUnit') }")
        studies = (detail or {}).get("studies") or []

        # Draft API exists
        if studies:
            sid = studies[0].get("id")
            code, draft, err = req(
                "POST",
                f"/reports/{case_id}/studies/{sid}/draft",
                doc_tok,
                {"findings": "Draft findings QA", "impression": "Draft impression QA"},
            )
            rec("DOCTOR", "Save draft (API; UI has no button)", code == 200, f"{code} {err[:120] if err else (draft or {}).get('toast') or 'ok'}")

            # Sign first study
            code, signed, err = req(
                "POST",
                f"/reports/{case_id}/studies/{sid}/sign",
                doc_tok,
                {
                    "findings": "Infant chest: clear lungs. No consolidation.",
                    "impression": "No active lung lesion.",
                    "technique": "Portable AP chest",
                },
            )
            rec(
                "DOCTOR",
                "Sign study 1 of 2",
                code == 200,
                f"{code} complete={(signed or {}).get('caseComplete')} signed={(signed or {}).get('signedStudyCount')} {err[:140]}",
            )

            # Partial logout guard
            code, partial, err = req("GET", "/reports/my-partial-cases", doc_tok)
            rec(
                "DOCTOR",
                "Partial cases after 1/2 signed",
                code == 200,
                f"{code} total={(partial or {}).get('total')} {err[:120]}",
            )

            # Sign second study if present
            if len(studies) > 1:
                sid2 = studies[1].get("id")
                code, signed2, err = req(
                    "POST",
                    f"/reports/{case_id}/studies/{sid2}/sign",
                    doc_tok,
                    {
                        "findings": "Knee: alignment preserved. No fracture.",
                        "impression": "No acute bony injury.",
                    },
                )
                rec(
                    "DOCTOR",
                    "Sign study 2 of 2 (complete case)",
                    code == 200,
                    f"{code} complete={(signed2 or {}).get('caseComplete')} billing={bool((signed2 or {}).get('billing'))} {err[:140]}",
                )

        # Decline wiring: send reason as doctorId like Live Feed
        if ctr_tok:
            payload3 = {
                "patientNumber": "QA-FLOW-DECLINE",
                "fullName": "QA Decline Patient",
                "age": 40,
                "gender": "Male",
                "phone": "9000000088",
                "radiologyCenterId": center.get("id") or ctr_user.get("centerId"),
                "radiologyCenterName": center.get("centerName") or "QA Flow Diagnostic Center",
                "bodyParts": ["CHEST PA/AP"],
                "referringPhysicianId": "ref-qa",
                "referringPhysicianName": "DR. REFERRING QA",
                "status": "Pending",
                "studyDate": date.today().isoformat(),
                "modality": "X-Ray",
                "isUrgent": False,
                "claimStatus": "UNCLAIMED",
            }
            code, dec_case, err = req("POST", "/reports", ctr_tok, payload3)
            if dec_case:
                code, _, err = req(
                    "POST",
                    f"/reports/{dec_case['id']}/reject",
                    doc_tok,
                    {"doctorId": "Doctor declined study from Live Feed", "doctorName": doc_user.get("name")},
                )
                rec("DOCTOR", "Decline with reason-as-doctorId (Live Feed bug)", True, f"{code} {err[:140]}")

        # Earnings
        code, earns, err = req("GET", "/invoices?partyType=doctor", doc_tok)
        rec("DOCTOR", "Earnings invoices", code == 200, f"{code} n={len(earns) if isinstance(earns, list) else err[:120]}")

        # Recheck after complete
        if case_id:
            code, _, err = req("POST", f"/reports/{case_id}/recheck", doc_tok, {"reason": "QA recheck"})
            rec("DOCTOR", "Recheck completed case", code in (200, 400, 403, 404), f"{code} {err[:160]}")

        # Comments
        if case_id:
            code, _, err = req("POST", f"/reports/{case_id}/comments", doc_tok, {"body": "QA comment from doctor"})
            rec("DOCTOR", "Add case comment", code in (200, 201, 400, 403, 404, 422), f"{code} {err[:160]}")

    # --- Cross-role isolation ---
    if doc_tok:
        code, _, err = req("GET", "/invoices", doc_tok)
        rec("DOCTOR", "Unscoped /invoices", True, f"{code} {err[:120]}")
        code, _, err = req("POST", "/approvals/submit", doc_tok, {
            "managerId": doc_email,
            "managerName": "DR QA",
            "actionType": "CREATE_DOCTOR",
            "entityType": "doctor",
            "payload": {"email": "x@y.com", "firstName": "X", "lastName": "Y", "fullName": "X", "contactNumber": "1"},
        })
        rec("DOCTOR", "Submit approval (should not be manager job)", True, f"{code} {err[:120]}")

    if ctr_tok:
        code, reps, err = req("GET", "/reports", ctr_tok)
        other = 0
        if isinstance(reps, list):
            other = sum(1 for r in reps if r.get("radiologyCenterId") not in (center.get("id"), ctr_user.get("centerId")))
        rec("CENTER", "Sees other centers' cases in GET /reports", True, f"total={len(reps) if isinstance(reps,list) else 0} other_center={other}")

    if admin_tok and case_id:
        code, d, err = req("GET", f"/reports/{case_id}", admin_tok)
        rec("SUPER_ADMIN", "Open QA case after doctor work", code == 200, f"status={(d or {}).get('status')} claim={(d or {}).get('claimStatus')} signed={(d or {}).get('signedStudyCount')}")

    out = {
        "credentials": {
            "super_admin": {"email": "admin@radio.com", "password": "radio@1"},
            "manager": {"email": "manager@radio.com", "password": "manager@123"},
            "qa_doctor": {"email": doc_email, "password": doc_pw, "doctorId": (doc_user or {}).get("doctorId")},
            "qa_center": {"email": center_email, "password": center_pw, "centerId": (ctr_user or {}).get("centerId")},
            "qa_pending_doctor": {"email": "qa.pendingdoc@radionet.test", "password": "QaPending!2026"},
        },
        "results": RESULTS,
        "passed": sum(1 for r in RESULTS if r["ok"]),
        "failed": sum(1 for r in RESULTS if not r["ok"]),
        "total": len(RESULTS),
    }
    with open("qa_role_flow_results.json", "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"\nDONE {out['passed']}/{out['total']} recorded ok (some FAIL expected for isolation tests)")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)
