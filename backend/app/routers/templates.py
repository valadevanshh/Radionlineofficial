import time
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
try:
    from backend.app.database import get_db
    from backend.app.models import TemplateDB
    from backend.app.schemas import TemplateCreate, TemplateResponse
    from backend.app.security import get_current_user
except ImportError:
    from app.database import get_db
    from app.models import TemplateDB
    from app.schemas import TemplateCreate, TemplateResponse
    from app.security import get_current_user

router = APIRouter(
    prefix="/templates",
    tags=["Templates"],
    dependencies=[Depends(get_current_user)],
)

def db_to_schema(t: TemplateDB) -> dict:
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

@router.get("", response_model=list[TemplateResponse])
def get_templates(db: Session = Depends(get_db)):
    templates = db.query(TemplateDB).order_by(TemplateDB.created_at.desc()).all()
    return [db_to_schema(t) for t in templates]

@router.post("", response_model=TemplateResponse)
def save_template(tmpl_in: TemplateCreate, db: Session = Depends(get_db)):
    t_id = tmpl_in.id or f"tmpl-{int(time.time() * 1000)}"
    existing = db.query(TemplateDB).filter(TemplateDB.id == t_id).first()

    meta_payload = {
        "bodyPart": tmpl_in.bodyPart,
        "findings": tmpl_in.findings,
        "impression": tmpl_in.impression,
        "content": tmpl_in.content,
    }

    if existing:
        existing.title = tmpl_in.title
        existing.center_id = tmpl_in.centerId
        existing.center_name = tmpl_in.centerName
        existing.modality = tmpl_in.modality
        existing.metadata_ = meta_payload
        db.commit()
        db.refresh(existing)
        return db_to_schema(existing)
    else:
        created_at = datetime.utcnow().isoformat() + "Z"
        new_t = TemplateDB(
            id=t_id,
            title=tmpl_in.title,
            center_id=tmpl_in.centerId,
            center_name=tmpl_in.centerName,
            modality=tmpl_in.modality,
            created_at=created_at,
            metadata_=meta_payload,
        )
        db.add(new_t)
        db.commit()
        db.refresh(new_t)
        return db_to_schema(new_t)


@router.get("/match")
def match_template(
    modality: str = Query(..., min_length=1),
    bodyPart: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    """Return first template whose modality + bodyPart equal the query (case-insensitive trim)."""
    mod_n = modality.strip().lower()
    bp_n = bodyPart.strip().lower()
    if not mod_n or not bp_n:
        return Response(status_code=204)

    templates = db.query(TemplateDB).order_by(TemplateDB.created_at.desc()).all()
    for t in templates:
        if (t.modality or "").strip().lower() != mod_n:
            continue
        meta = t.metadata_ or {}
        t_bp = (meta.get("bodyPart") or "").strip().lower()
        if t_bp == bp_n:
            return db_to_schema(t)
    return Response(status_code=204)

@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: str, db: Session = Depends(get_db)):
    tmpl = db.query(TemplateDB).filter(TemplateDB.id == template_id).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(tmpl)
    db.commit()
    return None
