"""Nexora - Membership Service.

Handles customer membership tier calculation, automatic upgrades, and
level-based discount logic.
"""

from typing import Dict, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.workspace import Workspace
from app.utils.logging import get_logger

logger = get_logger(__name__)

LEVELS: Dict[str, dict] = {
    "bronze": {"min_spent": 0, "discount": 0, "label": "铜牌会员"},
    "silver": {"min_spent": 1000, "discount": 2, "label": "银牌会员"},
    "gold": {"min_spent": 5000, "discount": 5, "label": "金牌会员"},
    "diamond": {"min_spent": 20000, "discount": 10, "label": "钻石会员"},
}

LEVEL_ORDER = ["bronze", "silver", "gold", "diamond"]


def calculate_level(total_spent: float) -> str:
    """Determine the membership level based on total spent.

    Returns the highest tier for which the customer qualifies.
    """
    level = "bronze"
    for name, cfg in LEVELS.items():
        if total_spent >= cfg["min_spent"]:
            level = name
    return level


async def update_customer_membership(
    db: AsyncSession,
    customer: Customer,
    additional_spent: float,
) -> None:
    """Update a customer's membership stats after an order is created.

    Increments total_spent and membership_points, then recalculates
    the membership level.

    Args:
        db: Async database session.
        customer: The customer to update.
        additional_spent: The amount to add (order total).
    """
    customer.total_spent = float(customer.total_spent) + additional_spent
    customer.membership_points = int(customer.membership_points or 0) + int(additional_spent)
    customer.membership_level = calculate_level(float(customer.total_spent))
    await db.flush()
    logger.info(
        "Customer %s membership updated: level=%s, spent=%.2f, points=%d",
        customer.id,
        customer.membership_level,
        float(customer.total_spent),
        customer.membership_points,
    )


class MembershipService:
    """Service for membership-related queries and management."""

    @staticmethod
    async def get_membership_summary(
        db: AsyncSession,
        workspace: Workspace,
    ) -> dict:
        """Return membership level distribution summary for the workspace.

        Returns counts per level and total customers.
        """
        # Count customers per level
        from sqlalchemy import case

        level_counts = {
            "bronze": 0,
            "silver": 0,
            "gold": 0,
            "diamond": 0,
        }

        for level_name in level_counts:
            result = await db.execute(
                select(func.count(Customer.id)).where(
                    Customer.workspace_id == workspace.id,
                    Customer.membership_level == level_name,
                )
            )
            level_counts[level_name] = result.scalar_one() or 0

        total_result = await db.execute(
            select(func.count(Customer.id)).where(
                Customer.workspace_id == workspace.id,
            )
        )
        total_customers = total_result.scalar_one() or 0

        return {
            "levels": [
                {
                    "level": name,
                    "label": LEVELS[name]["label"],
                    "min_spent": LEVELS[name]["min_spent"],
                    "discount": LEVELS[name]["discount"],
                    "count": level_counts[name],
                }
                for name in LEVEL_ORDER
            ],
            "total_customers": total_customers,
        }

    @staticmethod
    async def get_customer_membership(
        db: AsyncSession,
        workspace: Workspace,
        customer_id: str,
    ) -> dict:
        """Return detailed membership info for a single customer."""
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

        current_level = customer.membership_level or "bronze"
        next_level = _get_next_level(current_level)

        return {
            "customer_id": customer.id,
            "customer_name": customer.name,
            "current_level": current_level,
            "current_label": LEVELS.get(current_level, {}).get("label", ""),
            "current_discount": LEVELS.get(current_level, {}).get("discount", 0),
            "total_spent": round(float(customer.total_spent), 2),
            "membership_points": int(customer.membership_points or 0),
            "next_level": next_level,
            "next_label": LEVELS.get(next_level, {}).get("label", "") if next_level else None,
            "spent_needed_for_next": _spent_needed_for_next(current_level, float(customer.total_spent)),
        }


# ── Helpers ─────────────────────────────────────────────────────────────────


def _get_next_level(current: str) -> Optional[str]:
    """Return the name of the next tier, or None if already at max."""
    try:
        idx = LEVEL_ORDER.index(current)
    except ValueError:
        return "silver"
    if idx < len(LEVEL_ORDER) - 1:
        return LEVEL_ORDER[idx + 1]
    return None


def _spent_needed_for_next(level: str, current_spent: float) -> Optional[float]:
    """Calculate how much more spending is needed to reach the next tier."""
    next_level = _get_next_level(level)
    if next_level is None:
        return None
    required = LEVELS[next_level]["min_spent"]
    return max(0.0, required - current_spent)
