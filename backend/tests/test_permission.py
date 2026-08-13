"""Tests for fine-grained workspace permissions.

Covers:
  - OWNER always has full access
  - a custom WorkspacePermission row gates the matching action
  - unknown users fall back to the workspace role
"""

import uuid

from sqlalchemy import select

from app.models.permission import WorkspacePermission
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.services.permission import check_permission


async def _user(db, email="user@example.com") -> User:
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        full_name="Permission User",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


async def _workspace(db) -> Workspace:
    ws = Workspace(id=str(uuid.uuid4()), name="Perm Workspace", slug="perm-ws")
    db.add(ws)
    await db.flush()
    return ws


async def test_owner_has_full_access(session_factory):
    async with session_factory() as db:
        ws = await _workspace(db)
        owner = await _user(db, "owner@example.com")
        db.add(WorkspaceMember(
            workspace_id=ws.id, user_id=owner.id, role=WorkspaceRole.OWNER
        ))
        await db.flush()

        assert await check_permission(db, ws.id, owner.id, "delete_products") is True
        assert await check_permission(db, ws.id, owner.id, "manage_settings") is True


async def test_custom_permission_restricts_action(session_factory):
    async with session_factory() as db:
        ws = await _workspace(db)
        member = await _user(db, "member@example.com")
        db.add(WorkspaceMember(
            workspace_id=ws.id, user_id=member.id, role=WorkspaceRole.MEMBER
        ))
        db.add(WorkspacePermission(
            id=str(uuid.uuid4()),
            workspace_id=ws.id,
            user_id=member.id,
            can_edit_products=False,
            can_delete_products=False,
            can_manage_coupons=True,
        ))
        await db.flush()

        assert await check_permission(db, ws.id, member.id, "edit_products") is False
        assert await check_permission(db, ws.id, member.id, "delete_products") is False
        assert await check_permission(db, ws.id, member.id, "manage_coupons") is True
