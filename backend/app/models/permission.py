"""Nexora - RBAC Permission Models."""

import uuid

from sqlalchemy import Boolean, Column, ForeignKey, String, Text

from app.database import Base


class PermissionGroup(Base):
    """Named permission group within a workspace (e.g., '客服组', '仓库管理')."""

    __tablename__ = "permission_groups"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)


class PermissionGroupMember(Base):
    """Maps a user to a permission group."""

    __tablename__ = "permission_group_members"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    group_id = Column(String(36), ForeignKey("permission_groups.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)


class WorkspacePermission(Base):
    """Fine-grained, per-user permission overrides within a workspace."""

    __tablename__ = "workspace_permissions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    group_id = Column(String(36), ForeignKey("permission_groups.id", ondelete="CASCADE"), nullable=True)

    can_view_revenue = Column(Boolean, default=True)
    can_edit_products = Column(Boolean, default=False)
    can_delete_products = Column(Boolean, default=False)
    can_manage_orders = Column(Boolean, default=True)
    can_view_customers = Column(Boolean, default=True)
    can_manage_coupons = Column(Boolean, default=False)
    can_manage_members = Column(Boolean, default=False)
    can_manage_settings = Column(Boolean, default=False)
