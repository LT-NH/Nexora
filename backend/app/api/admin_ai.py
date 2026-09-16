"""Nexora - Admin AI Model Console API (Superadmin only).

阿里百炼的免费额度按模型分别计算，用完了就得换一个。本模块提供管理台
「运行时可切换全局调用模型」的接口：

  GET    /admin/ai/models                 完整注册表（含当前模型 / 用量 / 额度状态）
  POST   /admin/ai/models/switch          一键切换当前模型（写库 + 热生效）
  POST   /admin/ai/models/custom          新增/更新自定义模型
  DELETE /admin/ai/models/custom/{id}     删除自定义模型（内置与当前模型不可删）
  POST   /admin/ai/models/test            真实连通性自检（切过去之前先确认能用）

全部端点要求 superadmin：QWEN_API_KEY 是**平台级**凭证，不能下放给租户。
"""

from datetime import datetime
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.auth import require_superadmin
from app.models.ai_model import AIModel
from app.models.user import User
from app.services import model_registry
from app.utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/admin/ai", tags=["Admin · AI Models"])

# 目录展示顺序：主力优先，其次按用途分组
_FAMILY_ORDER = ["core", "reasoning", "vision", "omni", "code", "math", "custom"]

# 探测用最小请求：只花极少 token，验证模型可用性与真实延迟
_PROBE_MESSAGES = [{"role": "user", "content": "回复两个字：可用"}]


class SwitchPayload(BaseModel):
    model_id: str = Field(..., min_length=1, max_length=80)


class CustomPayload(BaseModel):
    model_id: str = Field(..., min_length=1, max_length=80)
    label: str = Field("", max_length=80)
    note: str | None = Field(None, max_length=500)


class TestPayload(BaseModel):
    model_id: str | None = Field(None, max_length=80)


class QuotaPayload(BaseModel):
    """免费额度校准：填控制台看到的「已用」或「剩余」即可（二选一）。

    官方没有查询剩余额度的 API，所以只做一次性对齐；之后按每次调用的
    usage 精确累加，管理台就是实时的。
    """

    total: int | None = Field(None, ge=1, le=1_000_000_000, description="免费额度总量")
    used: int | None = Field(None, ge=0, le=1_000_000_000, description="控制台显示的已用量")
    remaining: int | None = Field(None, ge=0, le=1_000_000_000, description="控制台显示的剩余量")


def _iso(dt: datetime | None) -> str | None:
    """naive UTC datetime → 带 Z 的 ISO 串，前端才能正确转本地时间。"""
    if dt is None:
        return None
    return dt.isoformat() + ("Z" if dt.tzinfo is None else "")


def _key_hint() -> str | None:
    """只回显尾部 4 位，用于确认「用的是什么 key」，不泄漏完整凭证。"""
    key = settings.QWEN_API_KEY or ""
    if not key:
        return None
    return f"{key[:3]}***{key[-4:]}" if len(key) > 8 else "***"


def _serialize(row: AIModel) -> dict:
    usage = model_registry.usage_for(row.model_id)
    quota = model_registry.quota_for(row.model_id)
    status = quota.get("status") or row.quota_status or "unknown"
    # 免费额度核算：剩余 = 总量 - 校准基数 - 本机累计
    snap = model_registry.quota_snapshot(
        row.quota_total, row.quota_used_base, row.tokens_used
    )
    return {
        "id": row.id,
        "model_id": row.model_id,
        "label": row.label,
        "note": row.note,
        "family": row.family,
        "family_label": model_registry.FAMILY_LABELS.get(row.family, row.family),
        "is_custom": row.is_custom,
        "is_active": row.is_active,
        # 巡店 Agent 依赖 function calling —— 切换前必须能看到这个标志
        "supports_tools": row.supports_tools,
        # 额度状态：内存值优先（最新），否则用库里的持久化值
        "quota_status": status,
        "quota_label": model_registry.QUOTA_LABELS.get(status, status),
        "quota_message": quota.get("message") or row.quota_message,
        "quota_checked_at": quota.get("at") or _iso(row.quota_checked_at),
        # ---- 免费额度记账 ----
        **snap,
        "quota_used_base": row.quota_used_base,
        "tokens_used": row.tokens_used,
        "calls_used": row.calls_used,
        # 未校准 → 数字是上限估算（不含本工具上线前的历史消耗），前端要标注
        "is_calibrated": row.quota_calibrated_at is not None,
        "quota_calibrated_at": _iso(row.quota_calibrated_at),
        "last_used_at": _iso(row.last_used_at),
        "activated_at": _iso(row.activated_at),
        "activated_by": row.activated_by,
        "usage": usage,
    }


@router.get(
    "/models",
    summary="AI 模型注册表（superadmin only）",
)
async def list_models(
    _sa: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """返回完整模型注册表 + 当前生效模型 + 本进程 token 用量。"""
    # 兜底：启动装载失败 / 库被重置时，目录会是空的 → 这里现补，保证页面可用
    await model_registry.ensure_seeded(db)

    rows = (await db.execute(select(AIModel))).scalars().all()

    def sort_key(r: AIModel) -> tuple:
        idx = _FAMILY_ORDER.index(r.family) if r.family in _FAMILY_ORDER else 99
        return (0 if r.is_active else 1, idx, r.model_id)

    models = [_serialize(r) for r in sorted(rows, key=sort_key)]
    cached = model_registry.get_active_model_cached()
    active_row = next((r for r in rows if r.is_active), None)

    return {
        "active": model_registry.get_active_model(),
        # 缓存未装载说明当前值来自 .env 回落，便于排查「切换没生效」
        "active_source": "runtime" if cached else "env-fallback",
        # 当前模型是否支持 function calling：false 时巡店 Agent 不可用，
        # 管理台据此给出醒目提示（切到 qwen-vl-*/deepseek-r1 就会踩到）
        "agent_tools_ok": bool(active_row.supports_tools) if active_row else False,
        "tool_capable_count": sum(1 for r in rows if r.supports_tools),
        # 免费额度记账口径说明（前端原样展示，避免用户误以为是官方实时值）
        "quota_note": (
            "百炼没有查询剩余额度的 API（控制台为分钟级更新），因此这里用"
            "「配额总量 − 校准基数 − 本机累计消耗」推算：未校准的模型为上限估算"
            "（不含本工具上线前的历史消耗），校准一次后即为实时值。"
        ),
        "quota_calibrated_count": sum(1 for r in rows if r.quota_calibrated_at),
        "key_configured": bool(settings.QWEN_API_KEY),
        "key_hint": _key_hint(),
        "base_url": settings.QWEN_BASE_URL,
        "usage_scope": "本进程运行期间累计，后端重启后清零",
        "models": models,
    }


@router.post(
    "/models/switch",
    summary="切换当前调用的模型（superadmin only）",
)
async def switch_model(
    payload: SwitchPayload,
    sa: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """把指定模型设为全局当前模型。写库 + 刷进程内缓存 → 全进程立即生效。"""
    try:
        row = await model_registry.set_active(db, payload.model_id, sa.email)
    except LookupError:
        raise HTTPException(
            status_code=404,
            detail=f"模型 {payload.model_id} 不在注册表中，请先添加到目录。",
        )
    await db.commit()
    logger.info("admin %s switched AI model to %s", sa.email, payload.model_id)
    return {
        "ok": True,
        "active": row.model_id,
        "label": row.label,
        "message": f"已切换到 {row.label}（{row.model_id}），下一次 AI 调用即生效。",
    }


@router.post(
    "/models/custom",
    summary="新增/更新自定义模型（superadmin only）",
)
async def upsert_custom_model(
    payload: CustomPayload,
    sa: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """把目录里没有的模型加进来（百炼新上的模型可直接填 model_id）。"""
    model_id = payload.model_id.strip()
    if not model_id:
        raise HTTPException(status_code=400, detail="model_id 不能为空")
    row = await model_registry.upsert_custom(
        db, model_id, payload.label.strip(), payload.note, sa.email
    )
    await db.commit()
    return {"ok": True, "model": _serialize(row), "message": f"已保存模型 {model_id}"}


@router.delete(
    "/models/custom/{model_id}",
    summary="删除自定义模型（superadmin only）",
)
async def delete_custom_model(
    model_id: str,
    _sa: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """只能删除自定义条目；内置模型与当前生效模型受保护。"""
    ok = await model_registry.delete_model(db, model_id)
    if not ok:
        raise HTTPException(
            status_code=400,
            detail="只能删除自定义模型，且不能删除当前正在使用的模型。",
        )
    await db.commit()
    return {"ok": True, "message": f"已删除 {model_id}"}


@router.post(
    "/models/{model_id}/quota",
    summary="校准免费额度（superadmin only）",
)
async def calibrate_quota(
    model_id: str,
    payload: QuotaPayload,
    sa: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """把百炼控制台看到的真实数字填一次，之后本工具按调用用量精确累加。

    只传 `remaining` 或 `used` 之一即可；`total` 用于改配额总量（默认 100 万）。
    """
    if payload.used is None and payload.remaining is None and payload.total is None:
        raise HTTPException(
            status_code=400, detail="请至少提供 used / remaining / total 之一"
        )
    try:
        row = await model_registry.set_quota_calibration(
            db, model_id,
            total=payload.total, used=payload.used, remaining=payload.remaining,
        )
    except LookupError:
        raise HTTPException(status_code=404, detail=f"模型 {model_id} 不在注册表中")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    await db.commit()
    snap = model_registry.quota_snapshot(
        row.quota_total, row.quota_used_base, row.tokens_used
    )
    logger.info(
        "quota calibrated by %s: %s -> remaining=%s/%s",
        sa.email, model_id, snap["quota_remaining"], snap["quota_total"],
    )
    return {
        "ok": True,
        "model_id": row.model_id,
        **snap,
        "is_calibrated": True,
        "message": (
            f"已校准：剩余 {snap['quota_remaining']:,} / {snap['quota_total']:,} tokens"
        ),
    }


@router.post(
    "/models/test",
    summary="模型连通性自检（superadmin only）",
)
async def test_model(
    payload: TestPayload,
    _sa: Annotated[User, Depends(require_superadmin)],
) -> dict:
    """对指定模型（默认当前模型）发一次最小真实请求。

    切模型之前先点一下，能立刻知道：key 是否有效、模型名是否正确、
    额度是否还有 —— 返回真实延迟与真实报错，不做任何包装。
    """
    model_id = (payload.model_id or model_registry.get_active_model()).strip()
    if not model_id:
        raise HTTPException(status_code=400, detail="未指定模型，且当前没有激活模型")

    key = settings.QWEN_API_KEY
    if not key:
        return {
            "ok": False,
            "model_id": model_id,
            "error": "未配置 QWEN_API_KEY（请在 backend/.env 中设置后重启后端）",
            "quota_status": "unauthorized",
        }

    started = datetime.utcnow()
    try:
        async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
            resp = await client.post(
                f"{settings.QWEN_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model_id,
                    "messages": _PROBE_MESSAGES,
                    "temperature": 0,
                    "max_tokens": 16,
                },
            )
    except Exception as exc:
        elapsed = int((datetime.utcnow() - started).total_seconds() * 1000)
        await model_registry.record_quota_state(
            model_id, model_registry.classify_error(None, str(exc)), f"请求异常：{exc}"
        )
        return {
            "ok": False,
            "model_id": model_id,
            "latency_ms": elapsed,
            "error": f"请求异常（网络/代理）：{exc}",
            "quota_status": model_registry.classify_error(None, str(exc)),
        }

    latency = int((datetime.utcnow() - started).total_seconds() * 1000)

    if resp.status_code != 200:
        raw = (resp.text or "")[:500]
        status = model_registry.classify_error(resp.status_code, raw)
        await model_registry.record_quota_state(
            model_id, status, f"HTTP {resp.status_code} · {raw}"
        )
        return {
            "ok": False,
            "model_id": model_id,
            "latency_ms": latency,
            "http_status": resp.status_code,
            "error": raw or f"HTTP {resp.status_code}",
            "quota_status": status,
        }

    data = resp.json()
    reply = ""
    try:
        reply = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        pass
    # 探测本身也消耗真实额度（约 14~20 tokens），因此同样计入记账 ——
    # 免费额度核算要准，就不能漏掉自己花掉的量。
    model_registry.record_usage(model_id, data.get("usage"))
    await model_registry.flush_usage(model_id)
    await model_registry.mark_ok(model_id)
    return {
        "ok": True,
        "model_id": model_id,
        "latency_ms": latency,
        "reply": (reply or "")[:80],
        "usage": model_registry.usage_for(model_id),
        "quota_status": "ok",
    }
