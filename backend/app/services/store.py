"""Nexora - Store Service.

Handles external e-commerce platform store connection CRUD operations.
Credentials (api_secret, access_token) are encrypted at rest using Fernet
symmetric encryption.  They are decrypted on-demand via get_plain_credentials()
when needed by platform adapters.
"""

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.store import Store, StorePlatform, StoreStatus
from app.models.workspace import Workspace
from app.schemas.store import StoreCreate, StoreResponse, StoreUpdate
from app.utils.crypto import decrypt_value, encrypt_value, make_fernet

# Shared Fernet instance, lazily initialised
_fernet = None


def _get_fernet():
    global _fernet
    if _fernet is None:
        _fernet = make_fernet(settings.encryption_key)
    return _fernet


class StoreService:
    """Service for store connection management."""

    # ── helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _encrypt_credentials(
        store_data: StoreCreate | StoreUpdate, fernet
    ) -> tuple[str | None, str | None, str | None]:
        """Return (api_key, api_secret_encrypted, access_token_encrypted).

        Fields that are None remain None; otherwise they are encrypted.
        """
        f = fernet
        secret = (
            encrypt_value(store_data.api_secret, f)
            if store_data.api_secret
            else None
        )
        token = (
            encrypt_value(store_data.access_token, f)
            if getattr(store_data, "access_token", None)
            else None
        )
        return store_data.api_key, secret, token

    @staticmethod
    async def get_plain_credentials(
        store: Store,
    ) -> dict[str, str | None]:
        """Decrypt and return a store's sensitive credentials.

        Returns a dict suitable for passing to platform adapters:
            {"api_key": ..., "api_secret": ..., "access_token": ..., "store_url": ...}
        """
        fernet = _get_fernet()

        def _safe_decrypt(value: str | None) -> str | None:
            """解密；若值不是 Fernet 密文（历史明文/未加密数据）则原样返回"""
            if not value:
                return None
            try:
                return decrypt_value(value, fernet)
            except ValueError:
                # 明文历史数据（如早期版本未加密存储）→ 原样返回，保证可连接
                return value

        return {
            "api_key": store.api_key,
            "api_secret": _safe_decrypt(store.api_secret),
            "access_token": _safe_decrypt(store.access_token),
            "store_url": store.store_url,
        }

    # ── CRUD ─────────────────────────────────────────────────────────

    @staticmethod
    async def create_store(
        db: AsyncSession,
        workspace: Workspace,
        store_data: StoreCreate,
    ) -> StoreResponse:
        fernet = _get_fernet()
        api_key, secret_enc, token_enc = StoreService._encrypt_credentials(
            store_data, fernet
        )
        store = Store(
            workspace_id=workspace.id,
            name=store_data.name.strip(),
            platform=StorePlatform(store_data.platform),
            store_url=store_data.store_url,
            api_key=api_key,
            api_secret=secret_enc,
            access_token=token_enc,
            status=StoreStatus.DISCONNECTED,
        )
        db.add(store)
        await db.flush()
        await db.refresh(store)
        return StoreResponse.model_validate(store)

    @staticmethod
    async def get_store_by_id(
        db: AsyncSession,
        workspace: Workspace,
        store_id: str,
    ) -> StoreResponse:
        result = await db.execute(
            select(Store).where(
                Store.id == store_id,
                Store.workspace_id == workspace.id,
            )
        )
        store = result.scalar_one_or_none()
        if store is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Store '{store_id}' not found.",
            )
        return StoreResponse.model_validate(store)

    @staticmethod
    async def get_store_orm(
        db: AsyncSession,
        workspace: Workspace,
        store_id: str,
    ) -> Store:
        """Return the raw Store ORM object (with encrypted credentials).

        Use StoreService.get_plain_credentials() to obtain decrypted values.
        """
        result = await db.execute(
            select(Store).where(
                Store.id == store_id,
                Store.workspace_id == workspace.id,
            )
        )
        store = result.scalar_one_or_none()
        if store is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Store '{store_id}' not found.",
            )
        return store

    @staticmethod
    async def list_stores(
        db: AsyncSession,
        workspace: Workspace,
        *,
        platform: str | None = None,
        status_filter: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[StoreResponse], int]:
        conditions = [Store.workspace_id == workspace.id]
        if platform is not None:
            conditions.append(Store.platform == StorePlatform(platform))
        if status_filter is not None:
            conditions.append(Store.status == StoreStatus(status_filter))

        count_result = await db.execute(select(Store).where(*conditions))
        stores = count_result.scalars().all()
        total = len(stores)

        data_query = (
            select(Store)
            .where(*conditions)
            .order_by(Store.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(data_query)
        paginated_stores = result.scalars().all()
        return [StoreResponse.model_validate(s) for s in paginated_stores], total

    @staticmethod
    async def update_store(
        db: AsyncSession,
        workspace: Workspace,
        store_id: str,
        update_data: StoreUpdate,
    ) -> StoreResponse:
        result = await db.execute(
            select(Store).where(
                Store.id == store_id,
                Store.workspace_id == workspace.id,
            )
        )
        store = result.scalar_one_or_none()
        if store is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Store '{store_id}' not found.",
            )

        fernet = _get_fernet()
        update_dict = update_data.model_dump(exclude_unset=True)

        # Encrypt sensitive fields before persisting
        if "api_secret" in update_dict and update_dict["api_secret"] is not None:
            update_dict["api_secret"] = encrypt_value(
                update_dict["api_secret"], fernet
            )
        if "access_token" in update_dict and update_dict["access_token"] is not None:
            update_dict["access_token"] = encrypt_value(
                update_dict["access_token"], fernet
            )

        for field, value in update_dict.items():
            if field == "name" and value is not None:
                setattr(store, field, value.strip())
            elif field == "status" and value is not None:
                setattr(store, field, StoreStatus(value))
            else:
                setattr(store, field, value)

        await db.flush()
        await db.refresh(store)
        return StoreResponse.model_validate(store)

    @staticmethod
    async def delete_store(
        db: AsyncSession,
        workspace: Workspace,
        store_id: str,
    ) -> None:
        result = await db.execute(
            select(Store).where(
                Store.id == store_id,
                Store.workspace_id == workspace.id,
            )
        )
        store = result.scalar_one_or_none()
        if store is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Store '{store_id}' not found.",
            )
        await db.delete(store)
        await db.flush()

    @staticmethod
    async def update_store_status(
        db: AsyncSession,
        workspace: Workspace,
        store_id: str,
        new_status: str,
        error_message: str | None = None,
    ) -> StoreResponse:
        result = await db.execute(
            select(Store).where(
                Store.id == store_id,
                Store.workspace_id == workspace.id,
            )
        )
        store = result.scalar_one_or_none()
        if store is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Store '{store_id}' not found.",
            )
        store.status = StoreStatus(new_status)
        if new_status == "connected":
            store.last_sync_at = datetime.now(timezone.utc)
        await db.flush()
        await db.refresh(store)
        return StoreResponse.model_validate(store)
