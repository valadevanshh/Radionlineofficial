import time
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
try:
    from backend.app.database import get_db
    from backend.app.models import DoctorDB, UserDB
    from backend.app.schemas import DoctorCreate, DoctorResponse
    from backend.app.security import get_current_user, require_roles, hash_password, looks_like_bcrypt
except ImportError:
    from app.database import get_db
    from app.models import DoctorDB, UserDB
    from app.schemas import DoctorCreate, DoctorResponse
    from app.security import get_current_user, require_roles, hash_password, looks_like_bcrypt
from sqlalchemy.orm.attributes import flag_modified

router = APIRouter(
    prefix="/doctors",
    tags=["Doctors"],
    dependencies=[Depends(get_current_user)],
)

def db_to_schema(d: DoctorDB) -> dict:
    meta = d.metadata_ or {}
    return {
        "id": d.id,
        "firstName": d.first_name,
        "lastName": d.last_name,
        "fullName": d.full_name,
        "email": d.email,
        "username": d.username,
        "password": None,
        "contactNumber": d.contact_number,
        "address": meta.get("address"),
        "signatureUrl": meta.get("signatureUrl"),
        "profileFileUrl": meta.get("profileFileUrl"),
        "degree": meta.get("degree", "M.D. (Radiodiagnosis)"),
        "registrationNumber": meta.get("registrationNumber"),
        "createdAt": d.created_at,
    }

@router.get("", response_model=list[DoctorResponse])
def get_doctors(db: Session = Depends(get_db)):
    docs = db.query(DoctorDB).all()
    return [db_to_schema(d) for d in docs]

@router.post("", response_model=DoctorResponse)
def save_doctor(
    doc_in: DoctorCreate,
    db: Session = Depends(get_db),
    _current_user: UserDB = Depends(require_roles("SUPER_ADMIN", "MANAGER")),
):
    doc_id = doc_in.id or f"doc-{int(time.time() * 1000)}"
    existing = db.query(DoctorDB).filter(DoctorDB.id == doc_id).first()

    hashed_pw = None
    if doc_in.password:
        hashed_pw = doc_in.password if looks_like_bcrypt(doc_in.password) else hash_password(doc_in.password)
    meta_payload = {
        "password": hashed_pw,
        "address": doc_in.address,
        "signatureUrl": doc_in.signatureUrl,
        "profileFileUrl": doc_in.profileFileUrl,
        "degree": doc_in.degree or "M.D. (Radiodiagnosis)",
        "registrationNumber": doc_in.registrationNumber,
    }

    if existing:
        existing.first_name = doc_in.firstName
        existing.last_name = doc_in.lastName
        existing.full_name = doc_in.fullName
        existing.email = doc_in.email
        existing.username = doc_in.username
        existing.contact_number = doc_in.contactNumber
        existing.metadata_ = meta_payload
        db.commit()
        db.refresh(existing)
        saved_doc = existing
    else:
        created_at = datetime.utcnow().strftime("%Y-%m-%d")
        new_doc = DoctorDB(
            id=doc_id,
            first_name=doc_in.firstName,
            last_name=doc_in.lastName,
            full_name=doc_in.fullName,
            email=doc_in.email,
            username=doc_in.username,
            contact_number=doc_in.contactNumber,
            created_at=created_at,
            metadata_=meta_payload,
        )
        db.add(new_doc)
        db.commit()
        db.refresh(new_doc)
        saved_doc = new_doc

    # Auto-register user account for Doctor login (password stored as bcrypt)
    login_email = saved_doc.username or saved_doc.email
    if login_email and hashed_pw:
        existing_user = db.query(UserDB).filter(UserDB.email.ilike(login_email)).first()
        if existing_user:
            user_meta = dict(existing_user.metadata_ or {})
            user_meta["password"] = hashed_pw
            user_meta["doctorId"] = saved_doc.id
            existing_user.name = saved_doc.full_name
            existing_user.metadata_ = user_meta
            flag_modified(existing_user, "metadata_")
        else:
            new_u = UserDB(
                email=login_email,
                name=saved_doc.full_name,
                role="DOCTOR",
                metadata_={"password": hashed_pw, "doctorId": saved_doc.id}
            )
            db.add(new_u)
        db.commit()

    return db_to_schema(saved_doc)

@router.delete("/{doctor_id}", status_code=204)
def delete_doctor(
    doctor_id: str,
    db: Session = Depends(get_db),
    _current_user: UserDB = Depends(require_roles("SUPER_ADMIN", "MANAGER")),
):
    doc = db.query(DoctorDB).filter(DoctorDB.id == doctor_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor not found")
    db.delete(doc)
    db.commit()
    return None
