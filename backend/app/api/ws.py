"""WebSocket endpoint for real-time notifications."""
import asyncio
import json
from collections import defaultdict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.utils.logging import get_logger

logger = get_logger(__name__)
router = APIRouter()


# Connection manager: workspace_id -> set of WebSocket connections
class ConnectionManager:
    """Manages active WebSocket connections grouped by workspace."""

    def __init__(self):
        self.connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, websocket: WebSocket, workspace_id: str):
        """Accept a WebSocket connection and register it under a workspace."""
        await websocket.accept()
        self.connections[workspace_id].add(websocket)
        logger.info("WebSocket connected for workspace %s", workspace_id)

    def disconnect(self, websocket: WebSocket, workspace_id: str):
        """Remove a WebSocket connection from a workspace group."""
        self.connections[workspace_id].discard(websocket)
        if not self.connections[workspace_id]:
            del self.connections[workspace_id]

    async def broadcast_to_workspace(self, workspace_id: str, message: dict):
        """Send a message to all connections in a workspace.

        Silently drops and removes any dead connections encountered.
        """
        dead = []
        for ws in self.connections.get(workspace_id, set()):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.connections[workspace_id].discard(ws)


manager = ConnectionManager()


async def notify_workspace(workspace_id: str, event: str, data: dict):
    """Helper to push a notification to all clients in a workspace.

    This is the public API used by services (e.g. order creation) to emit
    real-time events to subscribed WebSocket clients.
    """
    await manager.broadcast_to_workspace(
        workspace_id, {"event": event, "data": data}
    )


@router.websocket("/ws/notifications/{token}")
async def websocket_notifications(websocket: WebSocket, token: str):
    """WebSocket endpoint for real-time notifications.

    The ``token`` path parameter is a JWT access token used to authenticate
    the connection. After validation the socket is bound to the user's
    primary workspace so it can receive workspace-scoped events.

    Close codes:
        4001 — invalid or missing authentication.
        4003 — user does not belong to any workspace.
    """
    from app.utils.security import decode_token
    from app.models.workspace import WorkspaceMember
    from sqlalchemy import select
    from app.database import async_session_factory

    # Validate token
    payload = decode_token(token)
    if payload is None:
        await websocket.close(code=4001)
        return

    user_id = payload.get("sub")
    if not user_id:
        await websocket.close(code=4001)
        return

    # Get user's workspaces
    async with async_session_factory() as db:
        result = await db.execute(
            select(WorkspaceMember.workspace_id).where(
                WorkspaceMember.user_id == user_id
            )
        )
        workspace_ids = [str(row[0]) for row in result.all()]

    if not workspace_ids:
        await websocket.close(code=4003)
        return

    await websocket.accept()
    primary_ws = workspace_ids[0]
    manager.connections[primary_ws].add(websocket)

    try:
        # Send initial connection confirmation
        await websocket.send_json(
            {"event": "connected", "data": {"message": "WebSocket connected"}}
        )

        # Keep connection alive, handle incoming messages
        while True:
            data = await websocket.receive_text()
            # Handle ping/pong keepalive
            if data == "ping":
                await websocket.send_json({"event": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket, primary_ws)
        logger.info("WebSocket disconnected for workspace %s", primary_ws)
