"""Pytest fixtures for Nexora integration tests.

Spins up an in-memory SQLite database shared across all sessions
(StaticPool) and points every platform adapter / webhook service at the
test session factory. This lets the full sync pipeline run offline with
no real API credentials.
"""

import sys
from pathlib import Path

import httpx
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# Make the backend package importable when pytest runs from the repo root.
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Importing app.models registers every table on the shared Base.metadata.
import app.models  # noqa: F401
from app.database import Base, get_db  # noqa: E402

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def engine():
    """In-memory SQLite engine with all tables created.

    与生产共用同一份 PRAGMA 配方（`apply_sqlite_pragmas`）—— 关键是让测试也跑在
    **外键强制**下，否则「删父行留下子行」这类问题在测试里永远不会暴露
    （本项目真实踩过：生产库积累了 10 处孤儿数据）。
    """
    from app.database import apply_sqlite_pragmas

    eng = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    apply_sqlite_pragmas(eng.sync_engine)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session_factory(engine):
    """Async session factory bound to the test engine."""
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture
async def patch_session(session_factory, monkeypatch):
    """Redirect every adapter's DB session to the test factory.

    Adapters do ``from app.database import async_session_factory`` at import
    time, so we must patch the attribute on each importing module, not just
    on ``app.database``.
    """
    import app.database as db_mod
    import app.services.platforms.shopify as shopify_mod
    import app.services.platforms.douyin as douyin_mod
    import app.services.platforms.sandbox as sandbox_mod
    import app.services.platforms.taobao as taobao_mod
    import app.services.platforms.jd as jd_mod
    import app.services.platforms.pdd as pdd_mod
    import app.services.webhooks as webhooks_mod

    for mod in (
        shopify_mod,
        douyin_mod,
        sandbox_mod,
        taobao_mod,
        jd_mod,
        pdd_mod,
        webhooks_mod,
        db_mod,
    ):
        monkeypatch.setattr(mod, "async_session_factory", session_factory)
    monkeypatch.setattr(db_mod, "engine", engine)
    yield session_factory


@pytest_asyncio.fixture
async def workspace_id(patch_session, session_factory):
    """Create a workspace and return its id."""
    import uuid

    from app.models.workspace import Workspace

    ws_id = str(uuid.uuid4())
    async with session_factory() as db:
        db.add(Workspace(id=ws_id, name="Test Workspace", slug="test-workspace"))
        await db.commit()
    yield ws_id


@pytest_asyncio.fixture
async def user_id(patch_session, session_factory):
    """Create a **real** user row and return its id.

    为什么需要它：外键强制开启后（2026-09-19），用 `str(uuid.uuid4())` 凭空造一个
    user_id 去插入子表会被数据库直接拒绝。生产环境里 user_id 来自鉴权主体
    （`get_principal`），永远是真实存在的用户 —— 测试也必须构造真实行，
    否则测的是「生产不可能出现的状态」。
    """
    import uuid

    from app.models.user import User

    uid = str(uuid.uuid4())
    async with session_factory() as db:
        db.add(
            User(
                id=uid,
                email=f"test-{uid[:8]}@example.com",
                password_hash="not-a-real-hash",
                full_name="Test User",
            )
        )
        await db.commit()
    yield uid


# ---------------------------------------------------------------------------
# ASGI test client fixture
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def async_client(patch_session, session_factory, monkeypatch):
    """httpx.AsyncClient wrapping the FastAPI app via ASGITransport.

    Overrides ``get_db`` on the app so every route uses the in-memory
    SQLite test database rather than the configured DATABASE_URL.
    """
    from httpx import ASGITransport
    from app.main import app

    async def override_get_db():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()

    app.dependency_overrides[get_db] = override_get_db

    # Disable rate limiting in tests
    monkeypatch.setattr("app.config.settings.RATE_LIMIT_REQUESTS", 99999)

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test"
    ) as client:
        yield client

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Auth helper fixtures for workspace-scoped tests
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def auth_headers(async_client, session_factory, workspace_id):
    """Register + login a user, add them as workspace OWNER, return Bearer headers.

    Returns a dict with ``Authorization`` and ``Content-Type`` headers
    ready for workspace-scoped API calls.
    """
    # 1. Register
    reg_resp = await async_client.post("/api/v1/auth/register", json={
        "email": "autotest@example.com",
        "password": "Test1234!",
        "full_name": "Auto Test User",
    })
    assert reg_resp.status_code == 201, reg_resp.text

    # 2. Login
    login_resp = await async_client.post("/api/v1/auth/login", json={
        "email": "autotest@example.com",
        "password": "Test1234!",
    })
    assert login_resp.status_code == 200, login_resp.text
    tokens = login_resp.json()

    # 3. Add user as workspace owner (direct DB)
    import uuid
    from app.models.workspace import WorkspaceMember, WorkspaceRole

    user_data = reg_resp.json()
    async with session_factory() as db:
        db.add(WorkspaceMember(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            user_id=user_data["id"],
            role=WorkspaceRole.OWNER,
            joined_at=None,
        ))
        await db.commit()

    return {
        "Authorization": f"Bearer {tokens['access_token']}",
        "Content-Type": "application/json",
    }
