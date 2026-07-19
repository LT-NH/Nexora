"""Nexora - Subscription Schemas (Pydantic v2)."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class PlanResponse(BaseModel):
    """Schema for subscription plan data."""

    id: str
    name: str
    slug: str
    price_monthly: float
    price_yearly: float
    max_members: int
    max_workspaces: int
    features: dict[str, Any]
    is_active: bool

    model_config = {"from_attributes": True}


class SubscriptionResponse(BaseModel):
    """Schema for subscription data."""

    id: str
    workspace_id: str
    plan_id: str
    plan: Optional[PlanResponse] = None
    status: str
    trial_ends_at: Optional[datetime] = None
    current_period_start: datetime
    current_period_end: Optional[datetime] = None
    stripe_subscription_id: Optional[str] = None
    payment_status: str = "not_required"
    created_at: datetime

    model_config = {"from_attributes": True}


class SubscriptionCreate(BaseModel):
    """Schema for creating a subscription."""

    plan_slug: str = Field(
        ...,
        description="Slug of the plan to subscribe to",
    )
    billing_cycle: str = Field(
        default="monthly",
        pattern=r"^(monthly|yearly)$",
        description="Billing cycle: monthly or yearly",
    )