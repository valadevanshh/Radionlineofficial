import time
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

try:
    from backend.app.database import get_db
    from backend.app.models import (
        PendingApprovalDB, CaseDB, StudyDB, StudyImageDB, DoctorDB, CenterDB, TemplateDB, UserDB, ReportDB
    )
    from backend.app.schemas import ApprovalSubmitRequest, ApprovalReviewRequest, ApprovalResponse
    from backend.app.websocket import manager as ws_manager
    from backend.app.security import get_current_user, require_roles
    from backend.app import pricing
except ImportError:
    from app.database import get_db
    from app.models import (
        PendingApprovalDB, CaseDB, StudyDB, StudyImageDB, DoctorDB, CenterDB, TemplateDB, UserDB, ReportDB
    )
    from app.schemas import ApprovalSubmitRequest, ApprovalReviewRequest, ApprovalResponse
    from app.websocket import manager as ws_manager
    from app.security import get_current_user, require_roles
    from app import pricing


router = APIRouter(
    prefix="/approvals",
    tags=["Approvals"],
    dependencies=[Depends(get_current_user)],
)

def _redact_sensitive(d: Optional[dict]) -> Optional[dict]:
    """Omit password values from approval diffs (never expose credentials)."""
    if d is None:
        return None
    out = dict(d)
    for key in list(out.keys()):
        lk = str(key).lower()
        if "password" in lk:
            val = out.get(key)
            out[key] = "***" if val not in (None, "", "***") else None
    return out


def _snapshot_case(case_id: str, db: Session) -> Optional[dict]:
    c = db.query(CaseDB).filter(CaseDB.id == case_id).first()
    if not c:
        # Fall back to report row if case missing
        r = db.query(ReportDB).filter(ReportDB.id == case_id).first()
        if not r:
            return None
        meta = r.metadata_ or {}
        return {
            "id": r.id,
            "patientNumber": r.patient_number,
            "fullName": r.full_name,
            "age": r.age,
            "gender": r.gender,
            "phone": r.phone,
            "radiologyCenterId": r.radiology_center_id,
            "radiologyCenterName": r.radiology_center_name,
            "referringPhysicianId": r.referring_physician_id,
            "referringPhysicianName": r.referring_physician_name,
            "assignedDoctorId": r.assigned_doctor_id,
            "assignedDoctorName": r.assigned_doctor_name,
            "status": r.status,
            "isUrgent": bool(r.is_urgent) if r.is_urgent is not None else bool(meta.get("isUrgent", False)),
            "studyDate": r.study_date,
            "bodyParts": meta.get("bodyParts", []),
            "modality": meta.get("modality"),
            "clinicalNotes": meta.get("clinicalNotes"),
            "findings": meta.get("findings"),
            "impression": meta.get("impression"),
            "claimStatus": meta.get("claimStatus"),
            "claimedByDoctorId": meta.get("claimedByDoctorId"),
            "claimedByDoctorName": meta.get("claimedByDoctorName"),
        }
    meta = c.metadata_ or {}
    st = db.query(StudyDB).filter(StudyDB.case_id == case_id).first()
    return {
        "id": c.id,
        "patientNumber": c.patient_number,
        "fullName": c.full_name,
        "age": c.age,
        "gender": c.gender,
        "phone": c.phone,
        "radiologyCenterId": c.radiology_center_id,
        "radiologyCenterName": c.radiology_center_name,
        "referringPhysicianId": c.referring_physician_id,
        "referringPhysicianName": c.referring_physician_name,
        "status": c.status,
        "isUrgent": bool(c.is_urgent) if c.is_urgent is not None else bool(meta.get("isUrgent", False)),
        "studyDate": c.study_date,
        "bodyParts": meta.get("bodyParts", []),
        "modality": meta.get("modality") or (st.modality if st else None),
        "clinicalNotes": meta.get("clinicalNotes") or (st.clinical_notes if st else None),
        "findings": meta.get("findings") or (st.findings if st else None),
        "impression": meta.get("impression") or (st.impression if st else None),
        "claimStatus": st.status if st else meta.get("claimStatus"),
        "claimedByDoctorId": (st.claimed_by if st else None) or meta.get("claimedByDoctorId"),
        "claimedByDoctorName": (st.claimed_by_name if st else None) or meta.get("claimedByDoctorName"),
        "docContent": (st.doc_content if st else None) or meta.get("docContent"),
    }


def _snapshot_doctor(doc_id: str, db: Session) -> Optional[dict]:
    d = db.query(DoctorDB).filter(DoctorDB.id == doc_id).first()
    if not d:
        return None
    meta = d.metadata_ or {}
    return {
        "id": d.id,
        "firstName": d.first_name,
        "lastName": d.last_name,
        "fullName": d.full_name,
        "email": d.email,
        "username": d.username,
        "contactNumber": d.contact_number,
        "address": meta.get("address"),
        "signatureUrl": meta.get("signatureUrl"),
        "profileFileUrl": meta.get("profileFileUrl"),
        "degree": meta.get("degree"),
        "registrationNumber": meta.get("registrationNumber"),
        "createdAt": d.created_at,
        # password intentionally omitted from before snapshot
    }


def _snapshot_center(center_id: str, db: Session) -> Optional[dict]:
    c = db.query(CenterDB).filter(CenterDB.id == center_id).first()
    if not c:
        return None
    meta = c.metadata_ or {}
    return {
        "id": c.id,
        "centerName": c.center_name,
        "firstName": meta.get("firstName"),
        "lastName": meta.get("lastName"),
        "email": c.email,
        "username": meta.get("username"),
        "contactNumber": c.contact_number,
        "address": meta.get("address"),
        "headerTemplateUrl": meta.get("headerTemplateUrl"),
        "logoUrl": meta.get("logoUrl"),
        "createdAt": c.created_at,
    }


def _snapshot_template(tmpl_id: str, db: Session) -> Optional[dict]:
    t = db.query(TemplateDB).filter(TemplateDB.id == tmpl_id).first()
    if not t:
        return None
    meta = t.metadata_ or {}
    return {
        "id": t.id,
        "title": t.title,
        "centerId": t.center_id,
        "centerName": t.center_name,
        "modality": t.modality,
        "bodyPart": meta.get("bodyPart"),
        "findings": meta.get("findings"),
        "impression": meta.get("impression"),
        "content": meta.get("content"),
        "createdAt": t.created_at,
    }


def _current_entity_snapshot(entity_type: str, entity_id: Optional[str], action_type: str, db: Session) -> Optional[dict]:
    """Load current DB values for before/after diffs. CREATE has no before."""
    if not entity_id:
        return None
    at = (action_type or "").upper()
    if at.startswith("CREATE"):
        return None
    et = (entity_type or "").lower()
    if et == "case" or "CASE" in at:
        return _snapshot_case(entity_id, db)
    if et == "doctor" or "DOCTOR" in at:
        return _snapshot_doctor(entity_id, db)
    if et == "center" or "CENTER" in at:
        return _snapshot_center(entity_id, db)
    if et == "template" or "TEMPLATE" in at:
        return _snapshot_template(entity_id, db)
    return None


def db_to_schema(a: PendingApprovalDB, before: Optional[dict] = None) -> dict:
    return {
        "id": a.id,
        "managerId": a.manager_id,
        "managerName": a.manager_name,
        "actionType": a.action_type,
        "entityType": a.entity_type,
        "entityId": a.entity_id,
        "payload": _redact_sensitive(a.payload or {}),
        "before": _redact_sensitive(before) if before is not None else None,
        "status": a.status,
        "rejectionReason": a.rejection_reason,
        "createdAt": a.created_at,
        "reviewedAt": a.reviewed_at,
        "reviewedBy": a.reviewed_by,
    }

@router.get("", response_model=List[ApprovalResponse])
def get_approvals(
    status: Optional[str] = Query(None),
    managerId: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(PendingApprovalDB)
    if status:
        query = query.filter(PendingApprovalDB.status == status)
    if managerId:
        query = query.filter(PendingApprovalDB.manager_id == managerId)
    
    approvals = query.order_by(PendingApprovalDB.created_at.desc()).all()
    result = []
    for a in approvals:
        before = None
        # Only pending rows get a live DB snapshot (post-approve current != true before)
        if a.status == "PENDING":
            before = _current_entity_snapshot(a.entity_type, a.entity_id, a.action_type, db)
        result.append(db_to_schema(a, before=before))
    return result

@router.post("/submit", response_model=ApprovalResponse)
async def submit_approval(
    req: ApprovalSubmitRequest,
    db: Session = Depends(get_db),
    _user: UserDB = Depends(require_roles("MANAGER", "SUPER_ADMIN")),
):
    approval_id = f"appr-{int(time.time() * 1000)}"
    created_at = datetime.utcnow().isoformat()
    
    new_approval = PendingApprovalDB(
        id=approval_id,
        manager_id=req.managerId,
        manager_name=req.managerName,
        action_type=req.actionType,
        entity_type=req.entityType,
        entity_id=req.entityId,
        payload=req.payload,
        status="PENDING",
        created_at=created_at,
    )
    
    db.add(new_approval)
    db.commit()
    db.refresh(new_approval)
    
    schema_data = db_to_schema(new_approval)
    
    # Broadcast WS event for Super Admin notification
    await ws_manager.broadcast({
        "type": "PENDING_APPROVAL_REQUEST",
        "approval": schema_data
    })
    
    return schema_data

@router.post("/{approval_id}/approve", response_model=ApprovalResponse)
async def approve_request(
    approval_id: str,
    req: Optional[ApprovalReviewRequest] = None,
    db: Session = Depends(get_db),
    _user: UserDB = Depends(require_roles("SUPER_ADMIN")),
):
    appr = db.query(PendingApprovalDB).filter(PendingApprovalDB.id == approval_id).first()
    if not appr:
        raise HTTPException(status_code=404, detail="Approval request not found")
    
    if appr.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Approval request is already {appr.status}")
    
    payload = appr.payload or {}
    reviewer_name = req.reviewerName if req and req.reviewerName else "Super Admin"
    
    # Apply staged action to actual database tables
    try:
        if appr.entity_type == "case" or "CASE" in appr.action_type:
            _apply_case_action(appr.action_type, appr.entity_id, payload, db)
        elif appr.entity_type == "doctor" or "DOCTOR" in appr.action_type:
            _apply_doctor_action(appr.action_type, appr.entity_id, payload, db)
        elif appr.entity_type == "center" or "CENTER" in appr.action_type:
            _apply_center_action(appr.action_type, appr.entity_id, payload, db)
        elif appr.entity_type == "template" or "TEMPLATE" in appr.action_type:
            _apply_template_action(appr.action_type, appr.entity_id, payload, db)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to apply approved change: {str(e)}")
    
    appr.status = "APPROVED"
    appr.reviewed_at = datetime.utcnow().isoformat()
    appr.reviewed_by = reviewer_name
    
    db.commit()
    db.refresh(appr)
    
    schema_data = db_to_schema(appr)
    
    # Broadcast WS resolution
    await ws_manager.broadcast({
        "type": "APPROVAL_RESOLVED",
        "approvalId": appr.id,
        "status": "APPROVED",
        "actionType": appr.action_type,
        "entityType": appr.entity_type,
        "entityId": appr.entity_id,
        "reviewedBy": reviewer_name,
        "approval": schema_data
    })
    
    return schema_data

@router.post("/{approval_id}/reject", response_model=ApprovalResponse)
async def reject_request(
    approval_id: str,
    req: ApprovalReviewRequest,
    db: Session = Depends(get_db),
    _user: UserDB = Depends(require_roles("SUPER_ADMIN")),
):
    appr = db.query(PendingApprovalDB).filter(PendingApprovalDB.id == approval_id).first()
    if not appr:
        raise HTTPException(status_code=404, detail="Approval request not found")
    
    if appr.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Approval request is already {appr.status}")
    
    reviewer_name = req.reviewerName or "Super Admin"
    reason = req.rejectionReason or "Rejected by Super Admin"
    
    appr.status = "REJECTED"
    appr.rejection_reason = reason
    appr.reviewed_at = datetime.utcnow().isoformat()
    appr.reviewed_by = reviewer_name
    
    db.commit()
    db.refresh(appr)
    
    schema_data = db_to_schema(appr)
    
    # Broadcast WS resolution
    await ws_manager.broadcast({
        "type": "APPROVAL_RESOLVED",
        "approvalId": appr.id,
        "status": "REJECTED",
        "rejectionReason": reason,
        "reviewedBy": reviewer_name,
        "approval": schema_data
    })
    
    return schema_data



def _resolve_case_modality(p: dict) -> str:
    raw = p.get("modality")
    if raw is None or (isinstance(raw, str) and not str(raw).strip()):
        return pricing.DEFAULT_STUDY_MODALITY  # legacy fallback when payload omits modality
    value = str(raw).strip()
    aliases = {
        "xray": "X-Ray", "x-ray": "X-Ray", "x ray": "X-Ray",
        "ct": "CT", "ct scan": "CT", "mri": "MRI",
        "sonography": "Sonography", "ultrasound": "Sonography", "usg": "Sonography",
        "blood report": "Blood Report", "blood": "Blood Report",
    }
    key = value.lower()
    if key in aliases:
        value = aliases[key]
    if value not in pricing.ALLOWED_STUDY_MODALITIES:
        value = pricing.DEFAULT_STUDY_MODALITY
    return value

def _apply_case_action(action_type: str, entity_id: Optional[str], p: dict, db: Session):
    case_id = entity_id or p.get("id") or f"case-{int(time.time() * 1000)}"
    if action_type.startswith("DELETE"):
        db.query(StudyImageDB).filter(StudyImageDB.study_id == case_id).delete()
        db.query(StudyDB).filter(StudyDB.case_id == case_id).delete()
        db.query(CaseDB).filter(CaseDB.id == case_id).delete()
        db.query(ReportDB).filter(ReportDB.id == case_id).delete()
        return

    # Create or update case
    c = db.query(CaseDB).filter(CaseDB.id == case_id).first()
    body_parts = p.get("bodyParts", ["X-Ray"])
    body_part_str = ", ".join(body_parts) if isinstance(body_parts, list) else str(body_parts)
    now_str = datetime.utcnow().strftime("%Y-%m-%d")
    
    is_urg = bool(p.get("isUrgent", False))
    meta = {
        "bodyParts": body_parts,
        "clinicalNotes": p.get("clinicalNotes"),
        "findings": p.get("findings"),
        "impression": p.get("impression"),
        "dicomFileUrl": p.get("dicomFileUrl"),
        "dicomMetadata": p.get("dicomMetadata"),
        "dicomSnapshots": p.get("dicomSnapshots", []),
        "uploadedImages": p.get("uploadedImages", []),
        "reportsByBodyPart": p.get("reportsByBodyPart", {}),
        "impressionsByBodyPart": p.get("impressionsByBodyPart", {}),
        "hasHeaderUrl": p.get("hasHeaderUrl", True),
        "hasNoHeaderUrl": p.get("hasNoHeaderUrl", True),
        "signatureApplied": p.get("signatureApplied", False),
        "isUrgent": is_urg,
        "modality": _resolve_case_modality(p),
    }

    if not c:
        c = CaseDB(
            id=case_id,
            patient_number=p.get("patientNumber", f"P-{int(time.time())}"),
            full_name=p.get("fullName", "Unnamed Patient"),
            age=int(p.get("age", 30)),
            gender=p.get("gender", "Male"),
            phone=p.get("phone", "0000000000"),
            radiology_center_id=p.get("radiologyCenterId", "center-1"),
            radiology_center_name=p.get("radiologyCenterName", "Main Center"),
            referring_physician_id=p.get("referringPhysicianId", "doc-ref-1"),
            referring_physician_name=p.get("referringPhysicianName", "Dr. Referring"),
            status=p.get("status", "Pending"),
            is_urgent=is_urg,
            study_date=p.get("studyDate", now_str),
            created_at=p.get("createdAt", now_str),
            metadata_=meta,
        )
        db.add(c)
        
        case_modality = _resolve_case_modality(p)
        st = StudyDB(
            id=case_id,
            case_id=case_id,
            modality=case_modality,
            body_part=body_part_str,
            status=p.get("claimStatus", "UNCLAIMED"),
            is_urgent=is_urg,
            clinical_notes=p.get("clinicalNotes"),
            findings=p.get("findings"),
            impression=p.get("impression"),
            doc_content=p.get("docContent"),
            claimed_by=p.get("claimedByDoctorId"),
            claimed_by_name=p.get("claimedByDoctorName"),
            sequence_no=1,  # single-study case: first (and only) study
            created_at=c.created_at,
            metadata_={},
        )
        db.add(st)

        rep = ReportDB(
            id=case_id,
            patient_number=c.patient_number,
            full_name=c.full_name,
            age=c.age,
            gender=c.gender,
            phone=c.phone,
            radiology_center_id=c.radiology_center_id,
            radiology_center_name=c.radiology_center_name,
            referring_physician_id=c.referring_physician_id,
            referring_physician_name=c.referring_physician_name,
            assigned_doctor_id=p.get("assignedDoctorId"),
            assigned_doctor_name=p.get("assignedDoctorName"),
            status=c.status,
            is_urgent=is_urg,
            study_date=c.study_date,
            created_at=c.created_at,
            metadata_=meta,
        )
        db.add(rep)
    else:
        c.full_name = p.get("fullName", c.full_name)
        c.age = int(p.get("age", c.age))
        c.gender = p.get("gender", c.gender)
        c.phone = p.get("phone", c.phone)
        c.status = p.get("status", c.status)
        c.is_urgent = is_urg
        c.study_date = p.get("studyDate", c.study_date)
        c.metadata_ = meta
        
        st = db.query(StudyDB).filter(StudyDB.case_id == case_id).first()
        if st:
            st.body_part = body_part_str
            st.is_urgent = is_urg
            st.clinical_notes = p.get("clinicalNotes", st.clinical_notes)
            st.findings = p.get("findings", st.findings)
            st.impression = p.get("impression", st.impression)
            st.doc_content = p.get("docContent", st.doc_content)
            st.claimed_by = p.get("claimedByDoctorId", st.claimed_by)
            st.claimed_by_name = p.get("claimedByDoctorName", st.claimed_by_name)
            if p.get("claimStatus"):
                st.status = p["claimStatus"]

        rep = db.query(ReportDB).filter(ReportDB.id == case_id).first()
        if rep:
            rep.full_name = c.full_name
            rep.age = c.age
            rep.gender = c.gender
            rep.phone = c.phone
            rep.status = c.status
            rep.is_urgent = is_urg
            rep.study_date = c.study_date
            rep.metadata_ = meta


    # Save images
    images = p.get("uploadedImages", []) + p.get("dicomSnapshots", [])
    if images:
        for idx, img_url in enumerate(images):
            img_id = f"img-{case_id}-{idx}"
            ex_img = db.query(StudyImageDB).filter(StudyImageDB.id == img_id).first()
            if not ex_img:
                db.add(StudyImageDB(
                    id=img_id,
                    study_id=case_id,
                    image_url=img_url,
                    image_type="uploaded",
                    created_at=now_str
                ))


def _apply_doctor_action(action_type: str, entity_id: Optional[str], p: dict, db: Session):
    doc_id = entity_id or p.get("id") or f"doc-{int(time.time() * 1000)}"
    if action_type.startswith("DELETE"):
        db.query(DoctorDB).filter(DoctorDB.id == doc_id).delete()
        return

    doc = db.query(DoctorDB).filter(DoctorDB.id == doc_id).first()
    meta = {
        "password": p.get("password"),
        "address": p.get("address"),
        "signatureUrl": p.get("signatureUrl"),
        "profileFileUrl": p.get("profileFileUrl"),
    }
    now_str = datetime.utcnow().strftime("%Y-%m-%d")

    if doc:
        doc.first_name = p.get("firstName", doc.first_name)
        doc.last_name = p.get("lastName", doc.last_name)
        doc.full_name = p.get("fullName", doc.full_name)
        doc.email = p.get("email", doc.email)
        doc.username = p.get("username", doc.username)
        doc.contact_number = p.get("contactNumber", doc.contact_number)
        doc.metadata_ = meta
    else:
        doc = DoctorDB(
            id=doc_id,
            first_name=p.get("firstName", "Doctor"),
            last_name=p.get("lastName", "Name"),
            full_name=p.get("fullName", "Dr. Doctor Name"),
            email=p.get("email", "doctor@example.com"),
            username=p.get("username"),
            contact_number=p.get("contactNumber", "0000000000"),
            created_at=now_str,
            metadata_=meta,
        )
        db.add(doc)

    login_email = doc.username or doc.email
    if login_email and p.get("password"):
        ex_u = db.query(UserDB).filter(UserDB.email.ilike(login_email)).first()
        if ex_u:
            ex_u.name = doc.full_name
            ex_u.metadata_ = {"password": p.get("password"), "doctorId": doc.id}
        else:
            db.add(UserDB(
                email=login_email,
                name=doc.full_name,
                role="DOCTOR",
                metadata_={"password": p.get("password"), "doctorId": doc.id}
            ))


def _apply_center_action(action_type: str, entity_id: Optional[str], p: dict, db: Session):
    center_id = entity_id or p.get("id") or f"center-{int(time.time() * 1000)}"
    if action_type.startswith("DELETE"):
        db.query(CenterDB).filter(CenterDB.id == center_id).delete()
        return

    c = db.query(CenterDB).filter(CenterDB.id == center_id).first()
    meta = {
        "firstName": p.get("firstName"),
        "lastName": p.get("lastName"),
        "username": p.get("username"),
        "password": p.get("password"),
        "address": p.get("address"),
        "headerTemplateUrl": p.get("headerTemplateUrl"),
        "logoUrl": p.get("logoUrl"),
    }
    now_str = datetime.utcnow().strftime("%Y-%m-%d")

    if c:
        c.center_name = p.get("centerName", c.center_name)
        c.email = p.get("email", c.email)
        c.contact_number = p.get("contactNumber", c.contact_number)
        c.metadata_ = meta
    else:
        c = CenterDB(
            id=center_id,
            center_name=p.get("centerName", "New Center"),
            email=p.get("email", "center@example.com"),
            contact_number=p.get("contactNumber", "0000000000"),
            created_at=now_str,
            metadata_=meta,
        )
        db.add(c)

    login_email = p.get("username") or c.email
    if login_email and p.get("password"):
        ex_u = db.query(UserDB).filter(UserDB.email.ilike(login_email)).first()
        if ex_u:
            ex_u.name = c.center_name
            ex_u.metadata_ = {"password": p.get("password"), "centerId": c.id}
        else:
            db.add(UserDB(
                email=login_email,
                name=c.center_name,
                role="CENTER",
                metadata_={"password": p.get("password"), "centerId": c.id}
            ))


def _apply_template_action(action_type: str, entity_id: Optional[str], p: dict, db: Session):
    tmpl_id = entity_id or p.get("id") or f"tmpl-{int(time.time() * 1000)}"
    if action_type.startswith("DELETE"):
        db.query(TemplateDB).filter(TemplateDB.id == tmpl_id).delete()
        return

    t = db.query(TemplateDB).filter(TemplateDB.id == tmpl_id).first()
    meta = {
        "bodyPart": p.get("bodyPart"),
        "findings": p.get("findings"),
        "impression": p.get("impression"),
        "content": p.get("content"),
    }
    now_str = datetime.utcnow().strftime("%Y-%m-%d")

    if t:
        t.title = p.get("title", t.title)
        t.center_id = p.get("centerId", t.center_id)
        t.center_name = p.get("centerName", t.center_name)
        t.modality = p.get("modality", t.modality)
        t.metadata_ = meta
    else:
        t = TemplateDB(
            id=tmpl_id,
            title=p.get("title", "New Template"),
            center_id=p.get("centerId", "ALL"),
            center_name=p.get("centerName", "All Centers"),
            modality=p.get("modality", "X-Ray"),
            created_at=now_str,
            metadata_=meta,
        )
        db.add(t)
