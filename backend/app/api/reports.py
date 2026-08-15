import asyncio

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from app.api.deps import get_current_workspace, _require_member
from app.middleware.auth import AuthContext, get_principal
from app.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Annotated
from app.models.workspace import WorkspaceRole
from app.utils.logging import get_logger

router = APIRouter(prefix="/workspaces/{workspace_slug}/reports", tags=["reports"])
logger = get_logger(__name__)

async def generate_report(workspace_id: str, report_type: str):
    """Simulate async report generation."""
    await asyncio.sleep(3)  # simulated heavy work
    # In production: write to DB, send email, etc.
    logger.info("Report %s generated for workspace %s", report_type, workspace_id)

@router.post("/generate/{report_type}")
async def request_report(
    workspace_slug: str,
    report_type: str,
    background_tasks: BackgroundTasks,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, membership = await _require_member(workspace_slug, principal, db, WorkspaceRole.VIEWER)
    from app.services.permission import check_permission
    can_view = await check_permission(db, workspace.id, principal.user_id, "view_revenue", member=membership)
    if not can_view:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "无权限查看营收数据")
    background_tasks.add_task(generate_report, str(workspace.id), report_type)
    return {"message": f"Report {report_type} generation started", "workspace": workspace_slug}
