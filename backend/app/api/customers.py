"""Nexora - Customers API Routes.

Endpoints for customer CRUD, order history, and RFM analysis.
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member, create_audit_log
from app.database import get_db
from app.middleware.auth import get_principal, AuthContext
from app.models.customer import Customer
from app.models.order import Order, OrderStatus
from app.models.user import User
from app.models.workspace import WorkspaceRole
from app.schemas.customer import (
    CustomerCreate,
    CustomerResponse,
    CustomerUpdate,
    RFMAnalysisResponse,
    RFMSegment,
)
from app.utils.logging import get_logger
from app.utils.pagination import PaginatedResponse, PaginationParams

router = APIRouter(prefix="/workspaces/{slug}/customers")
logger = get_logger(__name__)


# ===========================================================================
# Customer CRUD
# ===========================================================================


@router.get(
    "",
    response_model=PaginatedResponse[CustomerResponse],
    summary="List customers (paginated)",
)
async def list_customers(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
    pagination: Annotated[PaginationParams, Depends()],
    search: Optional[str] = Query(None, description="Search by name, email, or phone"),
    tag: Optional[str] = Query(None, description="Filter by tag"),
) -> PaginatedResponse[CustomerResponse]:
    """Return paginated customers for the workspace."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)

    query = select(Customer).where(Customer.workspace_id == workspace.id)
    count_query = select(func.count(Customer.id)).where(Customer.workspace_id == workspace.id)

    if search:
        search_term = f"%{search}%"
        from sqlalchemy import or_
        search_filter = or_(
            Customer.name.ilike(search_term),
            Customer.email.ilike(search_term),
            Customer.phone.ilike(search_term),
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    if tag:
        query = query.where(Customer.tags.contains(tag))
        count_query = count_query.where(Customer.tags.contains(tag))

    count_result = await db.execute(count_query)
    total = count_result.scalar_one()

    result = await db.execute(
        query.order_by(Customer.created_at.desc())
        .offset(pagination.offset)
        .limit(pagination.limit)
    )
    customers = result.scalars().all()

    items = [_build_customer_response(c) for c in customers]
    return PaginatedResponse.create(items=items, total=total, params=pagination)


@router.post(
    "",
    response_model=CustomerResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a customer",
)
async def create_customer(
    slug: str,
    customer_data: CustomerCreate,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CustomerResponse:
    """Create a new customer in the workspace."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)

    customer = Customer(
        id=str(uuid.uuid4()),
        workspace_id=workspace.id,
        name=customer_data.name,
        email=customer_data.email,
        phone=customer_data.phone,
        tags=customer_data.tags or [],
        notes=customer_data.notes,
        source=customer_data.source,
    )
    db.add(customer)
    await db.flush()

    await create_audit_log(
        db=db,
        workspace_id=workspace.id,
        user_id=principal.user_id,
        action="customer.created",
        resource_type="customer",
        resource_id=customer.id,
        details={"name": customer.name, "email": customer.email},
    )

    logger.info("Customer created: %s (email=%s)", customer.name, customer.email)
    return _build_customer_response(customer)


# ===========================================================================
# RFM Analysis
# ===========================================================================


@router.get(
    "/cohort-retention",
    summary="Cohort 留存分析（首购月份 × 留存月份热力图）",
)
async def cohort_retention(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """按客户首购月份分群，计算各群在后续月份的留存率。

    返回：
      cohorts: [{month: "2026-05", size: 12, retention: [null, 83.3, 66.7, ...]}]
      - retention[i] = 第 i 个月后仍有订单的客户占比（%），首月为 null（即 100% 起点）
      - 仅计算有订单的客户（首购 = 最早订单月）
    """
    from datetime import datetime, timezone, timedelta
    from collections import OrderedDict

    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)

    # 拉取该工作空间全部订单（客户 + 时间）
    rows = (
        await db.execute(
            select(Order.customer_id, Order.created_at).where(
                Order.workspace_id == workspace.id
            )
        )
    ).all()
    if not rows:
        return {"cohorts": []}

    # 客户 → 活跃月份集合（去重）
    customer_months: dict[str, set[str]] = {}
    first_month: dict[str, str] = {}
    for customer_id, created_at in rows:
        if customer_id is None or created_at is None:
            continue
        cid = str(customer_id)
        month = created_at.strftime("%Y-%m")
        customer_months.setdefault(cid, set()).add(month)
        if cid not in first_month or month < first_month[cid]:
            first_month[cid] = month

    # 月份范围（最小首购月 ~ 当前月）
    all_months = sorted({m for m in first_month.values()})
    if not all_months:
        return {"cohorts": []}
    start = datetime.strptime(all_months[0], "%Y-%m").replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc).replace(day=1)
    month_list: list[str] = []
    cur = start
    while cur <= now:
        month_list.append(cur.strftime("%Y-%m"))
        cur = (cur + timedelta(days=32)).replace(day=1)

    # 分群
    cohort_map: "OrderedDict[str, list[str]]" = OrderedDict()
    for cid, fm in first_month.items():
        cohort_map.setdefault(fm, []).append(cid)

    cohorts = []
    for fm, cids in cohort_map.items():
        base_idx = month_list.index(fm) if fm in month_list else 0
        size = len(cids)
        retention: list[float | None] = [None]  # 首月
        for j in range(base_idx + 1, len(month_list)):
            m = month_list[j]
            active = sum(1 for c in cids if m in customer_months.get(c, set()))
            retention.append(round(active / size * 100, 1) if size else 0.0)
        cohorts.append({"month": fm, "size": size, "retention": retention})

    return {"cohorts": cohorts, "months": month_list}


@router.get(
    "/rfm-analysis",
    response_model=RFMAnalysisResponse,
    summary="RFM customer analysis",
)
async def rfm_analysis(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RFMAnalysisResponse:
    """Perform RFM (Recency, Frequency, Monetary) analysis on workspace customers.

    Returns customer segments: champions, loyal, potential, at_risk, lost, etc.
    """
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)

    customers_result = await db.execute(
        select(Customer).where(Customer.workspace_id == workspace.id)
    )
    customers = customers_result.scalars().all()

    if not customers:
        return RFMAnalysisResponse(
            workspace_id=workspace.id,
            total_customers=0,
            segments=[],
            analyzed_at=datetime.now(timezone.utc),
        )

    now = datetime.now(timezone.utc)
    segment_data: dict[str, dict] = {}

    # Batch query all orders for all customers in one query (fix N+1)
    customer_ids = [c.id for c in customers]
    all_orders_result = await db.execute(
        select(Order).where(
            Order.customer_id.in_(customer_ids),
            Order.workspace_id == workspace.id,
            Order.status.notin_([OrderStatus.CANCELLED, OrderStatus.REFUNDED]),
        )
    )
    all_orders = all_orders_result.scalars().all()
    orders_by_customer: dict[str, list[Order]] = {}
    for o in all_orders:
        orders_by_customer.setdefault(o.customer_id, []).append(o)

    for customer in customers:
        customer_orders = orders_by_customer.get(customer.id, [])

        if not customer_orders:
            r_score, f_score, m_score = 1, 1, 1
            rfm_score = 1.0
        else:
            last_order = max(o.created_at for o in customer_orders)
            # Ensure both datetimes are offset-aware (SQLite stores naive datetimes)
            if last_order.tzinfo is None:
                last_order = last_order.replace(tzinfo=timezone.utc)
            recency = (now - last_order).days
            frequency = len(customer_orders)
            monetary = sum(o.total for o in customer_orders)

            r_score = _score_recency(recency)
            f_score = _score_frequency(frequency)
            m_score = _score_monetary(monetary)
            rfm_score = round((r_score + f_score + m_score) / 3, 2)

        segment_name = _classify_segment(r_score, f_score, m_score)
        if segment_name not in segment_data:
            segment_data[segment_name] = {
                "count": 0,
                "total_spent": 0.0,
                "r_sum": 0,
                "f_sum": 0,
                "m_sum": 0,
                "rfm_sum": 0.0,
            }
        sd = segment_data[segment_name]
        sd["count"] += 1
        sd["total_spent"] += float(customer.total_spent)
        sd["r_sum"] += r_score
        sd["f_sum"] += f_score
        sd["m_sum"] += m_score
        sd["rfm_sum"] += rfm_score

    segments = []
    for seg_name, sd in segment_data.items():
        cnt = sd["count"]
        segments.append(
            RFMSegment(
                segment=seg_name,
                r_score=round(sd["r_sum"] / cnt),
                f_score=round(sd["f_sum"] / cnt),
                m_score=round(sd["m_sum"] / cnt),
                rfm_score=round(sd["rfm_sum"] / cnt, 2),
                customer_count=cnt,
                average_total_spent=round(sd["total_spent"] / cnt, 2),
            )
        )
    segments.sort(key=lambda s: s.rfm_score, reverse=True)

    return RFMAnalysisResponse(
        workspace_id=workspace.id,
        total_customers=len(customers),
        segments=segments,
        analyzed_at=datetime.now(timezone.utc),
    )

@router.get("/value-segments", summary="客户价值分层（可直接用的分组列表）")
async def value_segments(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    from datetime import datetime as _dt, timezone as _tz
    from app.models.customer import Customer

    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    customers = (
        await db.execute(
            select(Customer).where(Customer.workspace_id == workspace.id)
        )
    ).scalars().all()

    now = _dt.now(_tz.utc)
    groups: dict[str, list] = {
        k: [] for k in ("champions", "loyal", "potential", "at_risk", "lost")
    }

    for c in customers:
        total_orders = c.total_orders or 0
        total_spent = float(c.total_spent or 0)
        last_at = c.last_order_at
        days_since = (now - last_at.replace(tzinfo=_tz.utc)).days if last_at else 999
        # 简化 RFM 打分
        r = 5 if days_since <= 7 else 4 if days_since <= 14 else 3 if days_since <= 30 else 2 if days_since <= 60 else 1
        f = 5 if total_orders >= 10 else 4 if total_orders >= 5 else 3 if total_orders >= 3 else 2 if total_orders >= 2 else 1
        m = 5 if total_spent >= 20000 else 4 if total_spent >= 10000 else 3 if total_spent >= 5000 else 2 if total_spent >= 1000 else 1
        seg = _classify_segment(r, f, m)
        if seg not in groups:
            continue
        groups[seg].append({
            "id": c.id,
            "name": c.name or c.email or "匿名客户",
            "email": c.email,
            "total_orders": total_orders,
            "total_spent": round(total_spent, 2),
            "days_since_last": days_since if last_at else None,
        })

    return {
        "segments": [
            {
                "key": k,
                "label": _SEGMENT_LABELS.get(k, k),
                "count": len(groups[k]),
                "customers": groups[k][:20],
            }
            for k in groups
        ],
    }


@router.post("/value-segments/{segment}/marketing", summary="对客户分组一键发营销（创建唤醒券）")
async def segment_marketing(
    slug: str,
    segment: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    from datetime import datetime as _dt, timedelta as _td
    from app.models.coupon import Coupon
    from app.models.store import Store
    from app.services.store import StoreService
    from app.services.platforms import PLATFORM_REGISTRY
    import random

    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    if segment not in _SEGMENT_LABELS:
        raise HTTPException(status_code=400, detail="未知客户分组")

    code = f"VIP{random.randint(1000, 9999)}" if segment in ("champions", "loyal") else f"WAKE{random.randint(1000, 9999)}"

    # 真实 Shopify 建券（若已连接）
    shopify_written = False
    try:
        store_row = (
            await db.execute(
                select(Store).where(
                    Store.workspace_id == workspace.id, Store.platform == "shopify",
                ).order_by(Store.created_at.desc()).limit(1)
            )
        ).scalar_one_or_none()
        if store_row is not None:
            cfg = await StoreService.get_plain_credentials(store_row)
            integ_cls = PLATFORM_REGISTRY.get("shopify")
            if integ_cls is not None:
                shopify_written = await integ_cls().create_coupon_on_shopify(
                    cfg, code=code, value=20.0, min_amount=99.0, max_uses=300, expires_in_days=14,
                )
    except Exception:
        pass

    # 本地建券
    db.add(Coupon(
        workspace_id=workspace.id,
        code=code,
        type="fixed",
        value=20.0,
        min_order_amount=99.0,
        max_uses=300,
        expires_at=_dt.utcnow() + _td(days=14),
    ))
    await db.commit()

    return {
        "created": True,
        "code": code,
        "segment": segment,
        "message": f"已为「{_SEGMENT_LABELS[segment]}」创建唤醒券 {code}（满 99 减 20）"
                   + ("，并同步 Shopify 真实优惠券" if shopify_written else ""),
    }


@router.get(
    "/{customer_id}",
    response_model=CustomerResponse,
    summary="Get customer detail with order history",
)
async def get_customer(
    slug: str,
    customer_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CustomerResponse:
    """Return customer details. Use ?include_orders=true for order history."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)

    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.workspace_id == workspace.id,
        )
    )
    customer = result.scalar_one_or_none()
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found.",
        )

    return _build_customer_response(customer)


@router.put(
    "/{customer_id}",
    response_model=CustomerResponse,
    summary="Update customer",
)
async def update_customer(
    slug: str,
    customer_id: str,
    update_data: CustomerUpdate,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CustomerResponse:
    """Update an existing customer. Only provided fields are updated."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)

    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.workspace_id == workspace.id,
        )
    )
    customer = result.scalar_one_or_none()
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found.",
        )

    update_dict = update_data.model_dump(exclude_unset=True)

    for field, value in update_dict.items():
        setattr(customer, field, value)

    await db.flush()
    await db.refresh(customer)
    await create_audit_log(
        db=db,
        workspace_id=workspace.id,
        user_id=principal.user_id,
        action="customer.updated",
        resource_type="customer",
        resource_id=customer.id,
        details={"name": customer.name},
    )

    logger.info("Customer updated: %s (id=%s)", customer.name, customer.id)
    return _build_customer_response(customer)


@router.delete(
    "/{customer_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete customer",
)
async def delete_customer(
    slug: str,
    customer_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a customer from the workspace."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)

    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.workspace_id == workspace.id,
        )
    )
    customer = result.scalar_one_or_none()
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found.",
        )

    # Check if customer has orders before deleting
    order_count_result = await db.execute(
        select(func.count(Order.id)).where(Order.customer_id == customer_id)
    )
    order_count = order_count_result.scalar()
    if order_count > 0:
        # Don't physically delete, just mark as inactive or return error
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"无法删除：该客户关联了 {order_count} 个订单"
        )

    await create_audit_log(
        db=db,
        workspace_id=workspace.id,
        user_id=principal.user_id,
        action="customer.deleted",
        resource_type="customer",
        resource_id=customer.id,
        details={"name": customer.name, "email": customer.email},
    )

    await db.delete(customer)
    await db.flush()
    logger.info("Customer deleted: %s (id=%s)", customer.name, customer.id)


# ===========================================================================
# Helper builders
# ===========================================================================


def _build_customer_response(customer: Customer) -> CustomerResponse:
    """Build a CustomerResponse from a Customer model instance."""
    tags = customer.tags
    if isinstance(tags, str):
        tags = _parse_json_list(tags)
    return CustomerResponse(
        id=customer.id,
        workspace_id=customer.workspace_id,
        name=customer.name,
        email=customer.email,
        phone=customer.phone,
        tags=tags or [],
        total_orders=customer.total_orders,
        total_spent=round(customer.total_spent, 2),
        last_order_at=customer.last_order_at,
        membership_level=customer.membership_level,
        membership_points=int(customer.membership_points or 0),
        notes=customer.notes,
        source=customer.source,
        created_at=customer.created_at,
        updated_at=customer.updated_at,
    )


def _parse_json_list(value: str | None) -> list | None:
    """Safely parse a JSON-encoded string to a list."""
    if value is None:
        return None
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return None


# ===========================================================================
# RFM Scoring helpers
# ===========================================================================


def _score_recency(days: int) -> int:
    """Score recency: lower days = higher score."""
    if days <= 7:
        return 5
    elif days <= 30:
        return 4
    elif days <= 90:
        return 3
    elif days <= 180:
        return 2
    else:
        return 1


def _score_frequency(count: int) -> int:
    """Score frequency: higher count = higher score."""
    if count >= 10:
        return 5
    elif count >= 5:
        return 4
    elif count >= 3:
        return 3
    elif count >= 2:
        return 2
    else:
        return 1


def _score_monetary(amount: float) -> int:
    """Score monetary: higher spend = higher score."""
    if amount >= 10000:
        return 5
    elif amount >= 5000:
        return 4
    elif amount >= 1000:
        return 3
    elif amount >= 500:
        return 2
    else:
        return 1


def _classify_segment(r: int, f: int, m: int) -> str:
    """Classify customer into a segment based on RFM scores."""
    avg = (r + f + m) / 3
    if avg >= 4.5:
        return "champions"
    elif avg >= 3.5:
        return "loyal"
    elif avg >= 2.5:
        return "potential"
    elif avg >= 1.5:
        return "at_risk"
    else:
        return "lost"

# ----------------------------------------------------------------------
# 客户价值分层（可直接用的分组 + 一键营销）
# ----------------------------------------------------------------------

_SEGMENT_LABELS = {
    "champions": "高价值客户",
    "loyal": "忠诚客户",
    "potential": "潜力客户",
    "at_risk": "流失风险",
    "lost": "已流失",
}
