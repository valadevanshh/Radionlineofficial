import logging
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

try:
    from backend.app.models import UserDB, DoctorDB, CenterDB, ReportDB, TemplateDB
    from backend.app.security import hash_password, looks_like_bcrypt
except ImportError:
    from app.models import UserDB, DoctorDB, CenterDB, ReportDB, TemplateDB
    from app.security import hash_password, looks_like_bcrypt

logger = logging.getLogger(__name__)

INITIAL_DOCTORS = []
INITIAL_CENTERS = []
INITIAL_REPORTS = []
INITIAL_TEMPLATES = []

DEMO_USERS = [
    {
        "email": "admin@radio.com",
        "name": "Super Administrator",
        "role": "SUPER_ADMIN",
        "metadata_": {"password": "radio@1"},
    },
    {
        "email": "manager@radio.com",
        "name": "SURESHBHAI PATEL",
        "role": "MANAGER",
        "metadata_": {"password": "manager@123"},
    },
]


def _ensure_hashed_password(meta: dict) -> tuple[dict, bool]:
    """Return (meta, changed) with password migrated to bcrypt if plaintext."""
    if not meta:
        return meta or {}, False
    pwd = meta.get("password")
    if not pwd or looks_like_bcrypt(pwd):
        return meta, False
    updated = dict(meta)
    updated["password"] = hash_password(pwd)
    return updated, True


def migrate_plaintext_passwords(db: Session):
    """Hash any plaintext passwords stored in users.metadata in place."""
    changed = 0
    users = db.query(UserDB).all()
    for u in users:
        meta = dict(u.metadata_ or {})
        new_meta, did = _ensure_hashed_password(meta)
        if did:
            u.metadata_ = new_meta
            flag_modified(u, "metadata_")
            changed += 1
    if changed:
        db.commit()
        logger.info("Migrated %s user password(s) to bcrypt", changed)


def seed_db(db: Session):
    for u in DEMO_USERS:
        ex = db.query(UserDB).filter(UserDB.email.ilike(u["email"])).first()
        if not ex:
            meta = dict(u.get("metadata_") or {})
            meta, _ = _ensure_hashed_password(meta)
            db.add(
                UserDB(
                    email=u["email"],
                    name=u["name"],
                    role=u["role"],
                    metadata_=meta,
                )
            )
    db.commit()
    migrate_plaintext_passwords(db)
