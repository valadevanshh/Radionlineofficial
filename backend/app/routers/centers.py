import time
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
try:
    from backend.app.database import get_db
    from backend.app.models import CenterDB, UserDB
    from backend.app.schemas import CenterCreate, CenterResponse
    from backend.app.security import get_current_user, require_roles, hash_password, looks_like_bcrypt
except ImportError:
    from app.database import get_db
    from app.models import CenterDB, UserDB
    from app.schemas import CenterCreate, CenterResponse
    from app.security import get_current_user, require_roles, hash_password, looks_like_bcrypt
from sqlalchemy.orm.attributes import flag_modified

router = APIRouter(
    prefix="/centers",
    tags=["Radiology Centers"],
    dependencies=[Depends(get_current_user)],
)

def db_to_schema(c: CenterDB) -> dict:
    meta = c.metadata_ or {}
    return {
        "id": c.id,
        "centerName": c.center_name,
        "firstName": meta.get("firstName"),
        "lastName": meta.get("lastName"),
        "email": c.email,
        "username": meta.get("username"),
        "password": None,
        "contactNumber": c.contact_number,
        "address": meta.get("address"),
        "headerTemplateUrl": meta.get("headerTemplateUrl"),
        "logoUrl": meta.get("logoUrl"),
        "createdAt": c.created_at,
    }

@router.get("", response_model=list[CenterResponse])
def get_centers(db: Session = Depends(get_db)):
    centers = db.query(CenterDB).all()
    return [db_to_schema(c) for c in centers]

@router.post("", response_model=CenterResponse)
def save_center(
    center_in: CenterCreate,
    db: Session = Depends(get_db),
    _current_user: UserDB = Depends(require_roles("SUPER_ADMIN", "MANAGER")),
):
    c_id = center_in.id or f"center-{int(time.time() * 1000)}"
    existing = db.query(CenterDB).filter(CenterDB.id == c_id).first()

    hashed_pw = None
    if center_in.password:
        hashed_pw = center_in.password if looks_like_bcrypt(center_in.password) else hash_password(center_in.password)
    meta_payload = {
        "firstName": center_in.firstName,
        "lastName": center_in.lastName,
        "username": center_in.username,
        "password": hashed_pw,
        "address": center_in.address,
        "headerTemplateUrl": center_in.headerTemplateUrl,
        "logoUrl": center_in.logoUrl,
    }

    if existing:
        existing.center_name = center_in.centerName
        existing.email = center_in.email
        existing.contact_number = center_in.contactNumber
        existing.metadata_ = meta_payload
        db.commit()
        db.refresh(existing)
        saved_c = existing
    else:
        created_at = datetime.utcnow().strftime("%Y-%m-%d")
        new_c = CenterDB(
            id=c_id,
            center_name=center_in.centerName,
            email=center_in.email,
            contact_number=center_in.contactNumber,
            created_at=created_at,
            metadata_=meta_payload,
        )
        db.add(new_c)
        db.commit()
        db.refresh(new_c)
        saved_c = new_c

    # Auto-register user account for Center login (password stored as bcrypt)
    login_email = center_in.username or saved_c.email
    if login_email and hashed_pw:
        existing_user = db.query(UserDB).filter(UserDB.email.ilike(login_email)).first()
        if existing_user:
            user_meta = dict(existing_user.metadata_ or {})
            user_meta["password"] = hashed_pw
            user_meta["centerId"] = saved_c.id
            existing_user.name = saved_c.center_name
            existing_user.metadata_ = user_meta
            flag_modified(existing_user, "metadata_")
        else:
            new_u = UserDB(
                email=login_email,
                name=saved_c.center_name,
                role="CENTER",
                metadata_={"password": hashed_pw, "centerId": saved_c.id}
            )
            db.add(new_u)
        db.commit()

    return db_to_schema(saved_c)

@router.delete("/{center_id}", status_code=204)
def delete_center(
    center_id: str,
    db: Session = Depends(get_db),
    _current_user: UserDB = Depends(require_roles("SUPER_ADMIN", "MANAGER")),
):
    center = db.query(CenterDB).filter(CenterDB.id == center_id).first()
    if not center:
        raise HTTPException(status_code=404, detail="Center not found")
    db.delete(center)
    db.commit()
    return None
