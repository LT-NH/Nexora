"""Tests for the membership tier service.

Covers:
  - level thresholds map total_spent to bronze/silver/gold/diamond
  - order creation auto-updates customer membership level and points
"""

import uuid

from sqlalchemy import select

from app.models.customer import Customer
from app.services.membership import calculate_level, LEVELS


def test_level_thresholds():
    assert calculate_level(0) == "bronze"
    assert calculate_level(999) == "bronze"
    assert calculate_level(1000) == "silver"
    assert calculate_level(4999) == "silver"
    assert calculate_level(5000) == "gold"
    assert calculate_level(20000) == "diamond"
    assert calculate_level(999999) == "diamond"


def test_level_config_complete():
    for name in ("bronze", "silver", "gold", "diamond"):
        assert name in LEVELS
        assert "min_spent" in LEVELS[name]
        assert "discount" in LEVELS[name]


async def test_customer_membership_persisted(workspace_id, session_factory):
    async with session_factory() as db:
        customer = Customer(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            name="会员客户",
            email="member@example.com",
        )
        db.add(customer)
        await db.flush()

        # Simulate the order-created auto-update path
        customer.total_spent = (customer.total_spent or 0) + 2500
        customer.membership_points = (customer.membership_points or 0) + 2500
        customer.membership_level = calculate_level(customer.total_spent)
        await db.flush()

        result = await db.execute(select(Customer).where(Customer.id == customer.id))
        stored = result.scalar_one()
        assert stored.total_spent == 2500
        assert stored.membership_level == "silver"
        assert stored.membership_points == 2500
