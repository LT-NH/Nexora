"""Nexora - Order Service.

Handles Order and OrderItem CRUD, status transitions, and sales
statistics — all scoped to a workspace.  Every write method accepts a
``user_id`` parameter for audit logging.
"""

import os
import random
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.audit import create_audit_log
from app.models.customer import Customer
from app.models.order import Order, OrderItem, OrderStatus, PaymentStatus
from app.models.product import Product, ProductVariant
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.schemas.order import (
    OrderCreate,
    OrderDetailResponse,
    OrderItemCreate,
    OrderItemResponse,
    OrderResponse,
    OrderUpdate,
)
from app.services.events import publish
from app.services.queue import enqueue
# Importing the webhook service registers its event-bus subscribers
# (outbound webhooks + admin notifications) for the order.* events
# published below.  The import itself is a no-op otherwise.
import app.services.webhook as _webhook_module  # noqa: F401
from app.utils.logging import get_logger

logger = get_logger(__name__)

EXCLUDED_STATUSES = [OrderStatus.CANCELLED, OrderStatus.REFUNDED]


def _publish_order_event(event: str, workspace_id, data: dict) -> None:
    """Publish an order event to the in-process event bus (fire-and-forget).

    Subscribers registered in ``app.services.webhook`` forward the event
    to outbound webhooks and in-app notifications without blocking the
    request.
    """
    publish(
        event,
        {
            "workspace_id": str(workspace_id),
            "event": event,
            "data": data,
        },
    )


class OrderService:
    """Service for order-related business logic."""

    # ── Order CRUD ─────────────────────────────────────────────────────────

    @staticmethod
    async def create_order(
        db: AsyncSession,
        workspace: Workspace,
        order_data: OrderCreate,
        *,
        user_id: str,
    ) -> OrderDetailResponse:
        """Create a new order with line items.

        Auto-generates ``order_number`` if not provided.  Validates that
        referenced products and variants belong to the workspace.
        Updates linked customer aggregate stats on success.
        """
        # Auto-generate order number if not supplied
        if not order_data.order_number:
            ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
            order_data.order_number = f"ORD-{ts}-{random.randint(1000, 9999)}"

        # Check order_number uniqueness
        existing = await db.execute(
            select(Order).where(Order.order_number == order_data.order_number)
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Order number '{order_data.order_number}' already exists.",
            )

        # Calculate subtotal from items
        subtotal = sum(item.total_price for item in order_data.items)

        order = Order(
            workspace_id=workspace.id,
            customer_id=order_data.customer_id,
            customer_name=order_data.customer_name,
            customer_email=order_data.customer_email,
            order_number=order_data.order_number,
            status=OrderStatus(order_data.status),
            subtotal=subtotal,
            tax=order_data.tax,
            shipping=order_data.shipping,
            discount=order_data.discount,
            total=subtotal + order_data.tax + order_data.shipping - order_data.discount,
            shipping_address=order_data.shipping_address or {},
            notes=order_data.notes,
            payment_status=PaymentStatus(order_data.payment_status),
            platform=order_data.platform,
        )
        db.add(order)
        await db.flush()

        # Create order items with product/variant workspace validation
        items: List[OrderItem] = []
        for item_data in order_data.items:
            if item_data.product_id:
                p_check = await db.execute(
                    select(Product).where(
                        Product.id == item_data.product_id,
                        Product.workspace_id == workspace.id,
                    )
                )
                if p_check.scalar_one_or_none() is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Product '{item_data.product_id}' not found in this workspace.",
                    )
            if item_data.variant_id:
                v_check = await db.execute(
                    select(ProductVariant).join(Product).where(
                        ProductVariant.id == item_data.variant_id,
                        Product.workspace_id == workspace.id,
                    )
                )
                if v_check.scalar_one_or_none() is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Variant '{item_data.variant_id}' not found in this workspace.",
                    )
            item = OrderItem(
                order_id=order.id,
                product_id=item_data.product_id,
                variant_id=item_data.variant_id,
                product_name=item_data.product_name.strip()
                if item_data.product_name
                else "",
                sku=item_data.sku,
                quantity=item_data.quantity,
                unit_price=item_data.unit_price,
                total_price=item_data.total_price,
            )
            db.add(item)
            items.append(item)

        # Update customer stats if linked
        if order_data.customer_id:
            await OrderService._update_customer_stats_on_create(
                db, workspace, order_data.customer_id, float(order.total)
            )

        # Deduct stock for each order item
        for item_data in order_data.items:
            if item_data.product_id:
                product = await db.execute(select(Product).where(Product.id == item_data.product_id))
                product = product.scalar_one_or_none()
                if product:
                    product.stock = max(0, product.stock - item_data.quantity)

        await db.flush()
        await db.refresh(order)

        await create_audit_log(
            db=db,
            workspace_id=workspace.id,
            user_id=user_id,
            action="order.created",
            resource_type="order",
            resource_id=order.id,
            details={
                "order_number": order.order_number,
                "total": float(order.total),
            },
        )

        # Publish order.created event — outbound webhooks and admin
        # notifications are handled fire-and-forget by event-bus
        # subscribers, so this does not block the request.
        try:
            _publish_order_event(
                "order.created",
                order.workspace_id,
                {
                    "order_id": order.id,
                    "order_number": order.order_number,
                    "total": float(order.total),
                    "status": order.status.value,
                    "customer_name": order.customer_name,
                    "customer_email": order.customer_email,
                },
            )
        except Exception as e:
            logger.warning("Failed to publish order.created event: %s", e)

        # Send email notification to workspace owner. The blocking SMTP
        # send is offloaded to the background task queue (with error
        # logging) so the API returns instantly.
        try:
            from app.services.email import send_new_order_notification_async

            owner_result = await db.execute(
                select(User)
                .join(WorkspaceMember)
                .where(
                    WorkspaceMember.workspace_id == workspace.id,
                    WorkspaceMember.role == WorkspaceRole.OWNER,
                )
                .limit(1)
            )
            owner = owner_result.scalar_one_or_none()
            if owner:
                email_data = {
                    "order_number": order.order_number,
                    "customer_name": order.customer_name,
                    "total": f"{order.total:.2f}",
                    "status": order.status.value,
                    "site_url": os.getenv("SITE_URL", "http://localhost:3000"),
                }
                enqueue(
                    lambda: send_new_order_notification_async(
                        owner.email, email_data
                    ),
                    name="order-email",
                )
        except Exception as e:
            logger.warning("Order notification email failed: %s", e)

        logger.info("Order created: %s (total=%.2f)", order.order_number, order.total)

        return OrderDetailResponse(
            id=order.id,
            workspace_id=order.workspace_id,
            customer_id=order.customer_id,
            customer_name=order.customer_name,
            customer_email=order.customer_email,
            order_number=order.order_number,
            status=order.status.value,
            subtotal=order.subtotal,
            tax=order.tax,
            shipping=order.shipping,
            discount=order.discount,
            total=order.total,
            shipping_address=order.shipping_address,
            shipped_at=order.shipped_at,
            delivered_at=order.delivered_at,
            tracking_number=order.tracking_number,
            carrier=order.carrier,
            notes=order.notes,
            payment_status=order.payment_status.value,
            platform=order.platform,
            created_at=order.created_at,
            updated_at=order.updated_at,
            items=[OrderItemResponse.model_validate(i) for i in items],
        )

    @staticmethod
    async def get_order(
        db: AsyncSession,
        workspace: Workspace,
        order_id: str,
    ) -> OrderDetailResponse:
        """Get an order by ID with its line items."""
        result = await db.execute(
            select(Order).where(
                Order.id == order_id,
                Order.workspace_id == workspace.id,
            )
        )
        order = result.scalar_one_or_none()

        if order is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Order not found.",
            )

        return OrderDetailResponse(
            id=order.id,
            workspace_id=order.workspace_id,
            customer_id=order.customer_id,
            customer_name=order.customer_name,
            customer_email=order.customer_email,
            order_number=order.order_number,
            status=order.status.value,
            subtotal=order.subtotal,
            tax=order.tax,
            shipping=order.shipping,
            discount=order.discount,
            total=order.total,
            shipping_address=order.shipping_address,
            shipped_at=order.shipped_at,
            delivered_at=order.delivered_at,
            tracking_number=order.tracking_number,
            carrier=order.carrier,
            notes=order.notes,
            payment_status=order.payment_status.value,
            platform=order.platform,
            created_at=order.created_at,
            updated_at=order.updated_at,
            items=[OrderItemResponse.model_validate(i) for i in (order.items or [])],
        )

    @staticmethod
    async def list_orders(
        db: AsyncSession,
        workspace: Workspace,
        *,
        status_filter: Optional[str] = None,
        search: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        customer_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[OrderResponse], int]:
        """List orders with optional filtering and pagination.

        Args:
            status_filter: Filter by order status value.
            search: Search by order_number (partial match).
            date_from: ISO date string (YYYY-MM-DD) — orders created on or after.
            date_to: ISO date string (YYYY-MM-DD) — orders created on or before.
            customer_id: Filter by customer ID.

        Returns:
            Tuple of (list of OrderResponse, total count).
        """
        conditions = [Order.workspace_id == workspace.id]

        if status_filter:
            conditions.append(Order.status == OrderStatus(status_filter))

        if search:
            conditions.append(Order.order_number.ilike(f"%{search}%"))

        if date_from:
            try:
                dt_from = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                conditions.append(Order.created_at >= dt_from)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Invalid date_from format. Use YYYY-MM-DD.",
                )

        if date_to:
            try:
                dt_to = datetime.strptime(date_to, "%Y-%m-%d").replace(
                    hour=23, minute=59, second=59, tzinfo=timezone.utc
                )
                conditions.append(Order.created_at <= dt_to)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Invalid date_to format. Use YYYY-MM-DD.",
                )

        if customer_id:
            conditions.append(Order.customer_id == customer_id)

        # Count
        count_result = await db.execute(
            select(func.count(Order.id)).where(*conditions)
        )
        total = count_result.scalar_one()

        # Data
        data_result = await db.execute(
            select(Order)
            .where(*conditions)
            .order_by(Order.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        orders = data_result.scalars().all()

        return [OrderResponse.model_validate(o) for o in orders], total

    @staticmethod
    async def update_order(
        db: AsyncSession,
        workspace: Workspace,
        order_id: str,
        update_data: OrderUpdate,
        *,
        user_id: str,
    ) -> OrderResponse:
        """Update an order.  Handles status transitions and timestamping."""
        result = await db.execute(
            select(Order).where(
                Order.id == order_id,
                Order.workspace_id == workspace.id,
            )
        )
        order = result.scalar_one_or_none()

        if order is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Order not found.",
            )

        update_dict = update_data.model_dump(exclude_unset=True)

        if "status" in update_dict:
            new_status = OrderStatus(update_dict["status"])
            order.status = new_status
            update_dict["status"] = new_status
            if new_status == OrderStatus.SHIPPED:
                order.shipped_at = datetime.now(timezone.utc)
            if new_status == OrderStatus.DELIVERED:
                order.delivered_at = datetime.now(timezone.utc)

        if "payment_status" in update_dict:
            update_dict["payment_status"] = PaymentStatus(update_dict["payment_status"])

        for field, value in update_dict.items():
            setattr(order, field, value)

        order.updated_at = datetime.now(timezone.utc)
        await db.flush()
        await db.refresh(order)

        await create_audit_log(
            db=db,
            workspace_id=workspace.id,
            user_id=user_id,
            action="order.updated",
            resource_type="order",
            resource_id=order.id,
            details={"order_number": order.order_number},
        )

        # Publish order.updated event (handled fire-and-forget by the
        # event-bus subscribers registered in app.services.webhook).
        try:
            _publish_order_event(
                "order.updated",
                order.workspace_id,
                {
                    "order_id": order.id,
                    "order_number": order.order_number,
                    "total": float(order.total),
                    "status": order.status.value,
                },
            )
        except Exception as e:
            logger.warning("Failed to publish order.updated event: %s", e)

        logger.info("Order updated: %s", order.order_number)
        return OrderResponse.model_validate(order)

    @staticmethod
    async def update_order_status(
        db: AsyncSession,
        workspace: Workspace,
        order_id: str,
        update_data: OrderUpdate,
        *,
        user_id: str,
    ) -> OrderResponse:
        """Update the status of an order (dedicated endpoint for status workflows).

        Sets ``shipped_at`` when transitioning to SHIPPED, and
        ``delivered_at`` when transitioning to DELIVERED.
        """
        result = await db.execute(
            select(Order).where(
                Order.id == order_id,
                Order.workspace_id == workspace.id,
            )
        )
        order = result.scalar_one_or_none()

        if order is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Order not found.",
            )

        previous_status = order.status.value
        update_dict = update_data.model_dump(exclude_unset=True)

        if "status" in update_dict:
            new_status = OrderStatus(update_dict["status"])
            order.status = new_status
            if new_status == OrderStatus.SHIPPED:
                order.shipped_at = datetime.now(timezone.utc)
            if new_status == OrderStatus.DELIVERED:
                order.delivered_at = datetime.now(timezone.utc)

        if "payment_status" in update_dict:
            order.payment_status = PaymentStatus(update_dict["payment_status"])

        if "notes" in update_dict:
            order.notes = update_dict["notes"]

        order.updated_at = datetime.now(timezone.utc)
        await db.flush()
        await db.refresh(order)

        await create_audit_log(
            db=db,
            workspace_id=workspace.id,
            user_id=user_id,
            action="order.status_updated",
            resource_type="order",
            resource_id=order.id,
            details={
                "order_number": order.order_number,
                "previous_status": previous_status,
                "new_status": order.status.value,
            },
        )

        # Publish order.status_updated event (handled fire-and-forget by
        # the event-bus subscribers registered in app.services.webhook).
        try:
            _publish_order_event(
                "order.status_updated",
                order.workspace_id,
                {
                    "order_id": order.id,
                    "order_number": order.order_number,
                    "previous_status": previous_status,
                    "new_status": order.status.value,
                },
            )
        except Exception as e:
            logger.warning("Failed to publish order.status_updated event: %s", e)

        logger.info(
            "Order status updated: %s: %s -> %s",
            order.order_number,
            previous_status,
            order.status.value,
        )
        return OrderResponse.model_validate(order)

    @staticmethod
    async def delete_order(
        db: AsyncSession,
        workspace: Workspace,
        order_id: str,
        *,
        user_id: str,
    ) -> None:
        """Delete an order and its line items (cascade)."""
        result = await db.execute(
            select(Order).where(
                Order.id == order_id,
                Order.workspace_id == workspace.id,
            )
        )
        order = result.scalar_one_or_none()

        if order is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Order not found.",
            )

        await create_audit_log(
            db=db,
            workspace_id=workspace.id,
            user_id=user_id,
            action="order.deleted",
            resource_type="order",
            resource_id=order.id,
            details={"order_number": order.order_number},
        )

        await db.delete(order)
        await db.flush()

        logger.info("Order deleted: %s", order.order_number)

    # ── Order Statistics ────────────────────────────────────────────────────

    @staticmethod
    async def get_order_stats(
        db: AsyncSession,
        workspace: Workspace,
    ) -> dict:
        """Return comprehensive order statistics for the workspace.

        Includes today/week/month revenue and order counts, 7-day trend,
        total aggregates, and a status breakdown.
        """
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=now.weekday())
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        async def _count_revenue(from_date: datetime) -> Tuple[int, float]:
            result = await db.execute(
                select(
                    func.count(Order.id),
                    func.coalesce(func.sum(Order.total), 0.0),
                ).where(
                    Order.workspace_id == workspace.id,
                    Order.created_at >= from_date,
                    Order.status.notin_(EXCLUDED_STATUSES),
                )
            )
            count, revenue = result.one()
            return count or 0, float(revenue or 0.0)

        today_orders, today_revenue = await _count_revenue(today_start)
        week_orders, week_revenue = await _count_revenue(week_start)
        month_orders, month_revenue = await _count_revenue(month_start)

        # Totals (all time, excluding cancelled/refunded)
        total_result = await db.execute(
            select(
                func.count(Order.id),
                func.coalesce(func.sum(Order.total), 0.0),
            ).where(
                Order.workspace_id == workspace.id,
                Order.status.notin_(EXCLUDED_STATUSES),
            )
        )
        total_orders, total_revenue = total_result.one()
        total_orders = total_orders or 0
        total_revenue = float(total_revenue or 0.0)

        # 7-day trend
        trend: List[Dict] = []
        for i in range(6, -1, -1):
            day_start = today_start - timedelta(days=i)
            day_end = day_start + timedelta(days=1)
            day_result = await db.execute(
                select(
                    func.count(Order.id),
                    func.coalesce(func.sum(Order.total), 0.0),
                ).where(
                    Order.workspace_id == workspace.id,
                    Order.created_at >= day_start,
                    Order.created_at < day_end,
                    Order.status.notin_(EXCLUDED_STATUSES),
                )
            )
            day_count, day_revenue = day_result.one()
            trend.append(
                {
                    "date": day_start.strftime("%Y-%m-%d"),
                    "orders": day_count or 0,
                    "revenue": float(day_revenue or 0.0),
                }
            )

        # Status breakdown
        status_result = await db.execute(
            select(Order.status, func.count(Order.id))
            .where(Order.workspace_id == workspace.id)
            .group_by(Order.status)
        )
        status_breakdown = {
            row[0].value if hasattr(row[0], "value") else row[0]: row[1]
            for row in status_result.all()
        }

        return {
            "today_orders": today_orders,
            "today_revenue": today_revenue,
            "week_orders": week_orders,
            "week_revenue": week_revenue,
            "month_orders": month_orders,
            "month_revenue": month_revenue,
            "total_orders": total_orders,
            "total_revenue": total_revenue,
            "trend": trend,
            "status_breakdown": status_breakdown,
        }

    # ── Internal Helpers ────────────────────────────────────────────────────

    @staticmethod
    async def _update_customer_stats_on_create(
        db: AsyncSession,
        workspace: Workspace,
        customer_id: str,
        order_total: float,
    ) -> None:
        """Increment customer aggregate counters when a new order is created."""
        result = await db.execute(
            select(Customer).where(
                Customer.id == customer_id,
                Customer.workspace_id == workspace.id,
            )
        )
        customer = result.scalar_one_or_none()

        if customer is None:
            return

        customer.total_orders += 1
        customer.total_spent = float(customer.total_spent) + order_total
        customer.last_order_at = datetime.now(timezone.utc)
        customer.updated_at = datetime.now(timezone.utc)

        # Auto-update membership level and points
        from app.services.membership import update_customer_membership
        # total_spent is already updated above, so just recalculate level and points
        customer.membership_points = int(customer.membership_points or 0) + int(order_total)
        from app.services.membership import calculate_level
        customer.membership_level = calculate_level(float(customer.total_spent))

        await db.flush()
