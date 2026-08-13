"""Nexora - Payment Schemas (Pydantic v2)."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class PaymentCreate(BaseModel):
    """Schema for creating a new sandbox payment."""

    order_id: str
    method: Literal["alipay", "wechat"]


class PaymentResponse(BaseModel):
    """Schema for payment data returned in API responses."""

    id: str
    workspace_id: str
    order_id: str
    method: str
    amount: float
    status: str
    provider_trade_no: str
    paid_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PaymentCreateResponse(PaymentResponse):
    """Schema for the create-payment response, including mock QR payload."""

    qr: str
    trade_no: str


class PaymentConfirm(BaseModel):
    """Schema for the confirm-payment response."""

    payment: PaymentResponse
    message: str = "Payment confirmed successfully."
