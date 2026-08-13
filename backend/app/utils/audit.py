"""Nexora - Audit logging utility.

Provides create_audit_log() for recording workspace-level audit events.
Extracted from app.api.deps to avoid circular imports when used from
service-layer modules.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


def _sanitize_details(obj: Any) -> Any:
    """Recursively convert Decimal and other non-JSON types to serializable values."""
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, dict):
        return {k: _sanitize_details(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_details(v) for v in obj]
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj


async def create_audit_log(
    db: AsyncSession,
    workspace_id: str | None,
    user_id: str,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    """Create an audit log entry.

    Args:
        db: Async database session.
        workspace_id: The workspace ID where the action occurred.
        user_id: The user ID who performed the action.
        action: A short description of the action (e.g. 'product.created').
        resource_type: The type of resource affected (e.g. 'product').
        resource_id: The ID of the affected resource, if applicable.
        details: Additional contextual data as a dict.
        ip_address: The IP address of the user.

    Returns:
        The created AuditLog instance.
    """
    audit_log = AuditLog(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=_sanitize_details(details or {}),
        ip_address=ip_address,
        created_at=datetime.now(timezone.utc),
    )
    db.add(audit_log)
    await db.flush()
    return audit_log
