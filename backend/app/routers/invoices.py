"""Invoice & billing period API (JWT + role enforcement)."""
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

try:
    from backend.app.database import get_db, engine
    from backend.app.models import UserDB, InvoiceDB, InvoiceLineItemDB, BillingPeriodLockDB
    from backend.app.security import get_current_user, require_roles
    from backend.app import billing as billing_svc
    from backend.app import pricing
except ImportError:
    from app.database import get_db, engine
    from app.models import UserDB, InvoiceDB, InvoiceLineItemDB, BillingPeriodLockDB
    from app.security import get_current_user, require_roles
    from app import billing as billing_svc
    from app import pricing

router = APIRouter(
    prefix="/invoices",
    tags=["Invoices"],
    dependencies=[Depends(get_current_user)],
)

billing_router = APIRouter(
    prefix="/billing",
    tags=["Billing"],
    dependencies=[Depends(get_current_user)],
)


class InvoiceStatusUpdate(BaseModel):
    status: str  # paid | pending


class LockPeriodRequest(BaseModel):
    period: str  # YYYY-MM
    unlock: Optional[bool] = False


def _meta(user: UserDB) -> dict:
    return user.metadata_ or {}


@billing_router.get("/pricing")
def get_pricing(_user: UserDB = Depends(get_current_user)):
    return pricing.pricing_public_dict()


@billing_router.get("/revenue")
def get_revenue_summary(
    months: int = Query(6, ge=1, le=24),
    db: Session = Depends(get_db),
    _user: UserDB = Depends(require_roles("SUPER_ADMIN")),
):
    """Super Admin only: monthly revenue from Priority 3 invoice tables (real DB sums)."""
    return billing_svc.revenue_summary(db, months=months)


@billing_router.get("/periods")
def list_periods(
    db: Session = Depends(get_db),
    user: UserDB = Depends(require_roles("SUPER_ADMIN")),
):
    locks = db.query(BillingPeriodLockDB).order_by(BillingPeriodLockDB.period.desc()).all()
    # Also include periods that have invoices but no lock row yet
    periods_from_inv = [
        r[0]
        for r in db.query(InvoiceDB.billing_period).distinct().order_by(InvoiceDB.billing_period.desc()).all()
    ]
    lock_map = {l.period: l for l in locks}
    all_periods = sorted(set(list(lock_map.keys()) + periods_from_inv), reverse=True)
    out = []
    for p in all_periods:
        l = lock_map.get(p)
        out.append({
            "period": p,
            "locked": bool(l.locked) if l else False,
            "lockedAt": l.locked_at if l else None,
            "lockedBy": l.locked_by if l else None,
            "effectiveStatusHint": billing_svc.compute_effective_status("pending", p),
        })
    return out


@billing_router.post("/lock-period")
def lock_period(
    body: LockPeriodRequest,
    db: Session = Depends(get_db),
    user: UserDB = Depends(require_roles("SUPER_ADMIN")),
):
    try:
        if body.unlock:
            result = billing_svc.unlock_billing_period(db, body.period, user.name or user.email)
        else:
            result = billing_svc.lock_billing_period(db, body.period, user.name or user.email)
        db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("")
def list_invoices(
    party_type: Optional[str] = Query(None, alias="partyType"),
    party_id: Optional[str] = Query(None, alias="partyId"),
    period: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    user: UserDB = Depends(get_current_user),
):
    q = db.query(InvoiceDB)
    meta = _meta(user)

    if user.role == "CENTER":
        cid = meta.get("centerId")
        if not cid:
            raise HTTPException(status_code=403, detail="Center account missing centerId")
        q = q.filter(InvoiceDB.party_type == "center", InvoiceDB.party_id == cid)
    elif user.role == "DOCTOR":
        did = meta.get("doctorId")
        if not did:
            raise HTTPException(status_code=403, detail="Doctor account missing doctorId")
        q = q.filter(InvoiceDB.party_type == "doctor", InvoiceDB.party_id == did)
    elif user.role == "SUPER_ADMIN":
        if party_type:
            q = q.filter(InvoiceDB.party_type == party_type)
        if party_id:
            q = q.filter(InvoiceDB.party_id == party_id)
    elif user.role == "MANAGER":
        # Managers can view center invoices only (read-only via this list)
        if party_type:
            q = q.filter(InvoiceDB.party_type == party_type)
        else:
            q = q.filter(InvoiceDB.party_type == "center")
        if party_id:
            q = q.filter(InvoiceDB.party_id == party_id)
    else:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    if period:
        q = q.filter(InvoiceDB.billing_period == period)

    invoices = q.order_by(InvoiceDB.billing_period.desc(), InvoiceDB.party_name.asc()).all()
    result = [billing_svc.invoice_to_dict(inv) for inv in invoices]
    if status_filter:
        sf = status_filter.lower()
        result = [r for r in result if r["status"] == sf]
    return result


@router.get("/{invoice_id}")
def get_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    user: UserDB = Depends(get_current_user),
):
    inv = db.query(InvoiceDB).filter(InvoiceDB.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _authorize_invoice_read(user, inv)

    lines = (
        db.query(InvoiceLineItemDB)
        .filter(InvoiceLineItemDB.invoice_id == invoice_id)
        .order_by(InvoiceLineItemDB.service_date.asc(), InvoiceLineItemDB.study_index.asc())
        .all()
    )
    data = billing_svc.invoice_to_dict(inv)
    data["lineItems"] = [billing_svc.line_item_to_dict(li) for li in lines]
    data["byDay"] = billing_svc.group_lines_by_day(lines)
    if inv.party_type == "doctor":
        data["byCenter"] = billing_svc.group_lines_by_center(lines)
    return data


@router.patch("/{invoice_id}/status")
def update_invoice_status(
    invoice_id: str,
    body: InvoiceStatusUpdate,
    db: Session = Depends(get_db),
    user: UserDB = Depends(require_roles("SUPER_ADMIN")),
):
    try:
        inv = billing_svc.set_invoice_status(db, invoice_id, body.status)
        db.commit()
        db.refresh(inv)
        return billing_svc.invoice_to_dict(inv)
    except KeyError:
        raise HTTPException(status_code=404, detail="Invoice not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _authorize_invoice_read(user: UserDB, inv: InvoiceDB) -> None:
    meta = _meta(user)
    if user.role == "SUPER_ADMIN":
        return
    if user.role == "MANAGER" and inv.party_type == "center":
        return
    if user.role == "CENTER" and inv.party_type == "center" and inv.party_id == meta.get("centerId"):
        return
    if user.role == "DOCTOR" and inv.party_type == "doctor" and inv.party_id == meta.get("doctorId"):
        return
    raise HTTPException(status_code=403, detail="Not allowed to view this invoice")
