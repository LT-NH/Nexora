"""Nexora - Runtime AI Model Registry.

阿里百炼的免费额度**按模型分别计算**：一个模型的免费 token 用完就得换下一个。
本模块提供「运行时一键切换全局调用模型」的能力。

## 为什么需要进程内缓存

`app.services.ai._get_qwen_config()` 是**所有** AI 调用的唯一收口
（业务服务 11 个面板 + Agent 编排 + API 层），它是同步函数且不持有 DB session。
因此当前模型必须能被**无 session、O(1)** 地读到 —— 走数据库查询会给每次
AI 调用增加一次往返。这里的取舍是：

  - **DB = 唯一事实来源**：持久化、跨重启、跨实例一致
  - **进程内缓存 = 热路径读**：`get_active_model()` 纯内存，零开销
  - 切换时**写透**：先写库再刷缓存，切换后全进程立即生效

## 额度状态自动标记

调用失败时按上游错误文本粗分类写入 `quota_status`（exhausted / throttled /
unauthorized / error），并**原样保留错误信息**。分类只是给管理台一个醒目的
提示，用户看到的始终是真实报错，不做臆测。

"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select, update

from app.utils.logging import get_logger

logger = get_logger(__name__)

# ----------------------------------------------------------------------
# 内置模型目录
#
# 说明：只描述模型定位与适用场景（稳定事实），**不写死免费额度数字** ——
# 额度会随官方活动变化，管理台统一提示「以百炼控制台为准」。
# 用户可自行在管理台补充目录里没有的模型（is_custom=True）。
# ----------------------------------------------------------------------
MODEL_CATALOG: list[dict[str, str | bool]] = [
    # ── 主力档：本项目 11 个 AI 面板 + 巡店 Agent 的默认选择 ──────────────
    {
        "model_id": "qwen-plus",
        "label": "Qwen Plus",
        "family": "core",
        "supports_tools": True,
        "note": "本项目默认档。能力与成本均衡，实测 446ms，单轮约 14 tokens。支持 Agent 工具调用。",
    },
    {
        "model_id": "qwen-plus-latest",
        "label": "Qwen Plus (latest)",
        "family": "core",
        "supports_tools": True,
        "note": "qwen-plus 的最新快照，行为接近（实测 406ms）。plus 出现异常时可切它对比。",
    },
    {
        "model_id": "qwen-flash",
        "label": "Qwen Flash",
        "family": "core",
        "supports_tools": True,
        "note": "速度最快、单价最低（实测 348ms / 14 tokens）。适合高频轻量调用：分类、摘要、短文案。",
    },
    {
        "model_id": "qwen-max",
        "label": "Qwen Max",
        "family": "core",
        "supports_tools": True,
        "note": "千问旗舰，推理与长文写作最强，单价最高（实测 536ms）。适合关键结论生成。",
    },
    {
        "model_id": "qwen-long",
        "label": "Qwen Long",
        "family": "core",
        "supports_tools": True,
        "note": "⭐ 最省额度：同样问题只花 6~32 tokens（普通模型 14~188）。超长上下文，适合整批数据分析，支持工具调用。",
    },
    {
        "model_id": "qwen-long-latest",
        "label": "Qwen Long (latest)",
        "family": "core",
        "supports_tools": True,
        "note": "qwen-long 最新快照，同样极省额度（实测 850ms / 32 tokens）。",
    },
    # ── 强推理档：复杂分析／多步推演，⚠️ 默认开思维链，非常费额度 ──────────
    {
        "model_id": "qwen3-max",
        "label": "Qwen3 Max",
        "family": "reasoning",
        "supports_tools": True,
        "note": "Qwen3 旗舰（实测 763ms）。⚠️ 默认开思维链，同样问题约 297 tokens，接近 plus 的 20 倍，省额度慎用。",
    },
    {
        "model_id": "qwen3-235b-a22b",
        "label": "Qwen3 235B-A22B",
        "family": "reasoning",
        "supports_tools": True,
        "note": "Qwen3 开源旗舰（实测 8.6s / 约 330~429 tokens）。⚠️ 最慢也最费额度，仅留给最硬的推理任务。",
    },
    {
        "model_id": "qwen3-32b",
        "label": "Qwen3 32B",
        "family": "reasoning",
        "supports_tools": True,
        "note": "Qwen3 32B（实测 4.3s / 约 226~342 tokens）。⚠️ 开思维链，费额度。",
    },
    {
        "model_id": "qwen3-30b-a3b",
        "label": "Qwen3 30B-A3B",
        "family": "reasoning",
        "supports_tools": True,
        "note": "Qwen3 MoE 30B（实测 1.9s / 约 255~359 tokens）。速度与能力折中。",
    },
    {
        "model_id": "qwen3-8b",
        "label": "Qwen3 8B",
        "family": "reasoning",
        "supports_tools": True,
        "note": "Qwen3 开源里最省的一档（实测 1.9s / 约 142~309 tokens）。",
    },
    {
        "model_id": "deepseek-v3",
        "label": "DeepSeek V3",
        "family": "reasoning",
        "supports_tools": True,
        "note": "百炼托管的 DeepSeek V3（实测 967ms），支持工具调用，可作为千问之外的备选。",
    },
    {
        "model_id": "deepseek-r1",
        "label": "DeepSeek R1",
        "family": "reasoning",
        "supports_tools": False,
        "note": "DeepSeek R1 推理模型（实测 7.6s）。❌ 不支持 function calling —— 切到它巡店 Agent 会不可用。",
    },
    # ── 视觉档：商品图/详情图理解（本项目可按需扩展） ──────────────────────
    {
        "model_id": "qwen3-vl-plus",
        "label": "Qwen3 VL Plus",
        "family": "vision",
        "supports_tools": True,
        "note": "视觉理解（Qwen3 VL，实测 765ms），支持工具调用，可用于商品图分析。",
    },
    {
        "model_id": "qwen3-vl-235b-a22b-instruct",
        "label": "Qwen3 VL 235B",
        "family": "vision",
        "supports_tools": True,
        "note": "视觉理解旗舰（实测 418ms），支持工具调用，图片细节识别更强。",
    },
    {
        "model_id": "qwen-vl-plus",
        "label": "Qwen VL Plus",
        "family": "vision",
        "supports_tools": False,
        "note": "视觉理解（实测 474ms）。❌ 不支持 function calling，仅适合纯图文问答。",
    },
    {
        "model_id": "qwen-vl-max",
        "label": "Qwen VL Max",
        "family": "vision",
        "supports_tools": False,
        "note": "视觉理解旗舰（实测 494ms）。❌ 不支持 function calling。",
    },
    # ── 全模态 / 代码 / 数学：按特殊场景取用 ───────────────────────────────
    {
        "model_id": "qwen-omni-turbo",
        "label": "Qwen Omni Turbo",
        "family": "omni",
        "supports_tools": True,
        "note": "全模态（文本/音频/图像输入，实测 415ms），支持工具调用。",
    },
    {
        "model_id": "qwen3-omni-flash",
        "label": "Qwen3 Omni Flash",
        "family": "omni",
        "supports_tools": True,
        "note": "全模态快速档（实测 397ms），支持工具调用。",
    },
    {
        "model_id": "qwen3-coder-plus",
        "label": "Qwen3 Coder Plus",
        "family": "code",
        "supports_tools": True,
        "note": "代码专用（实测 663ms），支持工具调用。用于开发辅助，非产品功能。",
    },
    {
        "model_id": "qwen3-coder-flash",
        "label": "Qwen3 Coder Flash",
        "family": "code",
        "supports_tools": True,
        "note": "代码专用快速档（实测 417ms），支持工具调用。",
    },
    {
        "model_id": "qwen3-coder-30b-a3b-instruct",
        "label": "Qwen3 Coder 30B",
        "family": "code",
        "supports_tools": True,
        "note": "代码专用 MoE（实测 486ms），支持工具调用。",
    },
    {
        "model_id": "qwen-math-plus",
        "label": "Qwen Math Plus",
        "family": "math",
        "supports_tools": True,
        "note": "数学/演算增强（实测 581ms），支持工具调用。可用于定价与销量预测的数值推演。",
    },
]

FAMILY_LABELS: dict[str, str] = {
    "core": "主力（本项目首选）",
    "reasoning": "强推理（费额度）",
    "vision": "视觉理解",
    "omni": "全模态",
    "code": "代码",
    "math": "数学",
    "custom": "自定义",
}

# ----------------------------------------------------------------------
# 进程内状态（热路径读，无 DB 依赖）
# ----------------------------------------------------------------------
_active_model: str | None = None

# model_id -> {"calls", "prompt_tokens", "completion_tokens", "total_tokens"}
_usage: dict[str, dict[str, int]] = {}

# model_id -> {"status", "message", "at"}
_quota: dict[str, dict[str, Any]] = {}


def _settings_model() -> str:
    from app.config import settings

    return settings.QWEN_MODEL


def get_active_model() -> str:
    """当前生效的模型名。同步、纯内存 —— 供 `_get_qwen_config()` 热路径调用。

    缓存未就绪（启动早期/测试）时回落到 .env 的 `QWEN_MODEL`。
    """
    return _active_model or _settings_model()


def get_active_model_cached() -> str | None:
    """仅返回缓存值（None 表示尚未 hydrate），用于诊断。"""
    return _active_model


def prime_cache(model_id: str | None) -> None:
    """设置进程内当前模型（不碰数据库）。供 hydrate / 切换后调用。"""
    global _active_model
    _active_model = model_id or None


# ----------------------------------------------------------------------
# 启动装载
# ----------------------------------------------------------------------
async def _seed_and_calibrate(db) -> Any:
    """幂等：补齐内置目录 + 保证有且仅有一个 active。返回 active 行（可能为 None）。

    被两处复用：`hydrate()`（启动装载）与 `ensure_seeded()`（管理台读取前兜底）。
    """
    from app.models.ai_model import AIModel

    catalog_by_id = {item["model_id"]: item for item in MODEL_CATALOG}
    rows0 = (await db.execute(select(AIModel))).scalars().all()

    # 0) 清理「曾经内置、现已从目录移除」的行。
    #    只删 is_custom=False 且非 active 的 —— 自定义条目是用户自己加的，
    #    当前生效的模型更不能动（否则会把 AI 打断）。
    #    这样管理台展示的就严格等于策展目录，不会残留一堆点不动的死条目。
    pruned = []
    for r in rows0:
        if not r.is_custom and not r.is_active and r.model_id not in catalog_by_id:
            pruned.append(r.model_id)
            await db.delete(r)
    if pruned:
        await db.flush()
        logger.info("AI model registry pruned %d legacy built-ins: %s", len(pruned), pruned)

    # 1) 补齐新条目 + **校正已有内置条目的元数据**。
    #
    #    只补建是错的：目录改版后，老库里同名的行会保留旧 label/family/note，
    #    而新增的 supports_tools 列会被建为默认 False —— 于是管理台会显示
    #    错误的分组，甚至误报「当前模型不支持工具调用」。实测踩过这个坑。
    #    内置行的 label/note/family/supports_tools 属于「目录说了算」；
    #    is_active / is_custom / quota_status / 用量等用户态字段一律不动。
    synced, added = 0, 0
    rows_now = (await db.execute(select(AIModel))).scalars().all()
    present: set[str] = set()
    for r in rows_now:
        present.add(r.model_id)
        if r.is_custom:
            continue
        item = catalog_by_id.get(r.model_id)
        if item is None:
            continue
        for field in ("label", "note", "family", "supports_tools"):
            if getattr(r, field) != item[field]:
                setattr(r, field, item[field])
                synced += 1
    for item in MODEL_CATALOG:
        if item["model_id"] not in present:
            db.add(AIModel(**item, is_custom=False))
            added += 1
    await db.flush()
    if synced or added:
        logger.info("AI model registry: %d new, %d fields synced", added, synced)

    rows = (await db.execute(select(AIModel))).scalars().all()
    actives = [r for r in rows if r.is_active]

    # 2) 最多一个 active
    if len(actives) > 1:
        for r in actives[1:]:
            r.is_active = False
        actives = actives[:1]

    # 3) 一个都没有 → 优先用 .env 指定的模型；否则按**目录顺序**取第一个
    #    （MODEL_CATALOG 本身按优先级排序，主力档在最前）。
    #    注意不要用字母序兜底：那会选中 deepseek-r1 这种**不支持 function calling**
    #    的模型，等于新装就带着一个坏掉的巡店 Agent。
    if not actives and rows:
        want = _settings_model()
        pick = next((r for r in rows if r.model_id == want), None)
        if pick is None and MODEL_CATALOG:
            first = MODEL_CATALOG[0]["model_id"]
            pick = next((r for r in rows if r.model_id == first), None)
        if pick is None:
            pick = sorted(rows, key=lambda r: r.model_id)[0]
        pick.is_active = True
        actives = [pick]

    return actives[0] if actives else None


async def hydrate() -> str:
    """启动装载：补齐目录、校准 active、刷缓存、预热额度状态。

    任何异常都不阻塞应用启动 —— 注册表拿不到时 `get_active_model()`
    会回落到 .env 的 QWEN_MODEL，AI 功能不会因此挂掉。
    """
    from app.database import async_session_factory
    from app.models.ai_model import AIModel

    try:
        async with async_session_factory() as db:
            active = await _seed_and_calibrate(db)
            if active is not None:
                prime_cache(active.model_id)
            # 预热额度状态，避免重启后管理台的失败提示丢失
            for r in (await db.execute(select(AIModel))).scalars().all():
                if r.quota_status and r.quota_status != "unknown":
                    _quota[r.model_id] = {
                        "status": r.quota_status,
                        "message": r.quota_message,
                        "at": r.quota_checked_at.isoformat()
                        if r.quota_checked_at
                        else None,
                    }
            await db.commit()
            logger.info("AI model registry hydrated: active=%s", get_active_model())
    except Exception as exc:  # pragma: no cover - 启动健壮性优先
        logger.warning("AI model registry hydrate failed: %s", exc)

    return get_active_model()


async def ensure_seeded(db) -> None:
    """管理台读取前兜底：目录为空（启动装载失败 / 库被重置）时补齐并校准。

    真实故障模式：`hydrate()` 抛异常时只记日志不阻塞启动 —— 那样管理台会
    显示一个空列表且没有任何解释。这里保证「打开页面一定能用」。
    """
    active = await _seed_and_calibrate(db)
    if active is not None and get_active_model_cached() is None:
        prime_cache(active.model_id)


# ----------------------------------------------------------------------
# 切换
# ----------------------------------------------------------------------
async def set_active(db, model_id: str, operator_email: str | None) -> Any:
    """把 `model_id` 设为全局当前模型（写库 + 刷缓存）。

    Raises:
        LookupError: 模型不在注册表中。
    """
    from app.models.ai_model import AIModel

    target = (
        await db.execute(select(AIModel).where(AIModel.model_id == model_id))
    ).scalars().first()
    if target is None:
        raise LookupError(model_id)

    await db.execute(update(AIModel).values(is_active=False))
    target.is_active = True
    now = datetime.utcnow()
    target.activated_at = now
    target.activated_by = operator_email
    # 切走再切回来时，旧的失败提示往往是过期的 → 复位为未知，等真实调用再判
    if target.quota_status in ("exhausted", "throttled", "error"):
        target.quota_status = "unknown"
        target.quota_message = None
        target.quota_checked_at = None
        _quota.pop(model_id, None)
    await db.flush()

    prime_cache(model_id)  # 写透：全进程下一次调用即生效
    logger.info("AI model switched to %s by %s", model_id, operator_email)
    return target


async def upsert_custom(
    db, model_id: str, label: str, note: str | None, operator_email: str | None
) -> Any:
    """新增/更新一个自定义模型条目。"""
    from app.models.ai_model import AIModel

    row = (
        await db.execute(select(AIModel).where(AIModel.model_id == model_id))
    ).scalars().first()
    if row is None:
        row = AIModel(
            model_id=model_id,
            label=label or model_id,
            note=note,
            family="custom",
            is_custom=True,
            is_active=False,
        )
        db.add(row)
    else:
        row.label = label or row.label
        if note is not None:
            row.note = note
    await db.flush()
    return row


async def delete_model(db, model_id: str) -> bool:
    """删除一个自定义模型（内置模型与当前生效模型不允许删除）。"""
    from sqlalchemy import delete as sa_delete

    from app.models.ai_model import AIModel

    row = (
        await db.execute(select(AIModel).where(AIModel.model_id == model_id))
    ).scalars().first()
    if row is None or not row.is_custom or row.is_active:
        return False
    await db.execute(sa_delete(AIModel).where(AIModel.model_id == model_id))
    _usage.pop(model_id, None)
    _quota.pop(model_id, None)
    await db.flush()
    return True


# ----------------------------------------------------------------------
# 用量与额度状态
# ----------------------------------------------------------------------
def record_usage(model_id: str, usage: dict[str, Any] | None) -> None:
    """累计 token 用量（纯内存，重启清零）。

    DashScope 的 OpenAI 兼容接口在响应体里带 `usage`，取不到就只计次数。
    """
    slot = _usage.setdefault(
        model_id,
        {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    )
    slot["calls"] += 1
    if not isinstance(usage, dict):
        return
    for key, field in (
        ("prompt_tokens", "prompt_tokens"),
        ("completion_tokens", "completion_tokens"),
        ("total_tokens", "total_tokens"),
    ):
        val = usage.get(key)
        if isinstance(val, (int, float)):
            slot[field] += int(val)
    # total 缺失时用 prompt+completion 兜底
    if not slot["total_tokens"] and (slot["prompt_tokens"] or slot["completion_tokens"]):
        slot["total_tokens"] = slot["prompt_tokens"] + slot["completion_tokens"]


async def flush_usage(model_id: str) -> None:
    """把进程内累计的用量增量写回 DB（每次成功调用后 await）。

    热路径只累加内存，这里做一次轻量 UPDATE —— 这样免费额度记账不会因为
    重启而丢失。**落库成功后才清零内存增量**，避免写失败造成重复计数。
    任何异常都不应影响 AI 调用本身。
    """
    slot = _usage.get(model_id)
    if not slot:
        return
    delta_t = int(slot.get("total_tokens") or 0)
    delta_c = int(slot.get("calls") or 0)
    if not delta_t and not delta_c:
        return
    try:
        from app.database import async_session_factory
        from app.models.ai_model import AIModel

        async with async_session_factory() as db:
            row = (
                await db.execute(select(AIModel).where(AIModel.model_id == model_id))
            ).scalars().first()
            if row is None:
                return
            row.tokens_used = (row.tokens_used or 0) + delta_t
            row.calls_used = (row.calls_used or 0) + delta_c
            row.last_used_at = datetime.utcnow()
            await db.commit()
    except Exception as exc:  # pragma: no cover
        logger.warning("flush usage failed for %s: %s", model_id, exc)
        return

    for k in ("total_tokens", "calls", "prompt_tokens", "completion_tokens"):
        slot[k] = 0


async def set_quota_calibration(
    db,
    model_id: str,
    *,
    total: int | None = None,
    used: int | None = None,
    remaining: int | None = None,
) -> Any:
    """校准免费额度记账（用户从百炼控制台读一次真实数字）。

    官方没有查询剩余额度的 API，所以只能一次性对齐：用户把控制台显示的
    「已用」或「剩余」填进来，之后本工具按每次调用的 usage 精确累加。
    """
    from app.models.ai_model import AIModel

    row = (
        await db.execute(select(AIModel).where(AIModel.model_id == model_id))
    ).scalars().first()
    if row is None:
        raise LookupError(model_id)

    if total is not None:
        if int(total) <= 0:
            raise ValueError("quota_total 必须大于 0")
        row.quota_total = int(total)
    if remaining is not None:
        row.quota_used_base = max(0, int(row.quota_total) - int(remaining))
    elif used is not None:
        row.quota_used_base = max(0, int(used))

    # 校准即把「之前的历史」计入基数，本机累计从 0 重新开始
    row.tokens_used = 0
    row.calls_used = 0
    row.quota_calibrated_at = datetime.utcnow()
    await db.flush()
    return row


def quota_snapshot(quota_total: int, used_base: int, tokens_used: int) -> dict:
    """剩余额度核算（纯函数，便于测试）。

    剩余 = 总量 - 校准基数 - 本机累计，下限 0。
    """
    total = max(0, int(quota_total or 0))
    used = max(0, int(used_base or 0)) + max(0, int(tokens_used or 0))
    remaining = max(0, total - used)
    pct = (used / total * 100.0) if total else 0.0
    return {
        "quota_total": total,
        "quota_used": used,
        "quota_remaining": remaining,
        "quota_used_pct": round(min(100.0, pct), 2),
    }


def classify_error(status_code: int | None, message: str) -> str:
    """把上游报错粗分类，仅用于管理台醒目提示（不改变真实报错内容）。

    **判断顺序：先看报错文本语义，最后才退回状态码。**

    原因（两次实测踩坑）：
      1. 专属网关未部署某模型时返回 `Access denied`，若按 403 判成 unauthorized，
         用户会以为 API Key 坏了 —— 那是「没开通」，两件事完全不同。
      2. 百炼额度耗尽时返回 **403 + "Free quota exhausted"**。若 403 先被判成
         unauthorized，就把「这个模型不能用了、该换一个」这个**本功能最核心的信号**
         误导成「Key 无效」。语义关键词必须优先于裸状态码。
    """
    low = (message or "").lower()

    # ---- 第一层：报错文本里有明确语义 ----
    # 额度 / 欠费
    if (
        "quota" in low
        or "arrearage" in low
        or "欠费" in low
        or "额度" in low
        or "insufficient" in low
        or "balance" in low
    ):
        return "exhausted"

    # 模型未开通 / 未购买 / 未部署在该网关（≠ Key 无效）
    #
    # 实测过的几种真实措辞（都返回 403，但都不是 Key 的问题）：
    #   "Access denied"                              → 专属网关未部署
    #   "Access to model denied. Please make sure you
    #    are eligible for using the model."          → type: AccessDenied.Unpurchased
    # 「Access to model denied」不含 "access denied"，所以必须补以下模式，
    # 否则会落到 403 兜底被判成 unauthorized，让人误以为要换 API Key。
    if (
        "access denied" in low
        or "accessdenied" in low  # 错误体的 type 字段无空格
        or "access to model denied" in low
        or "unpurchased" in low
        or "not eligible" in low
        or "permission denied" in low
        or "forbidden" in low
        or "not authorized" in low
        or "no permission" in low
        or "denied" in low  # 兜底：各种 "... denied" 措辞
    ):
        return "denied"

    # 该模型只支持流式调用
    if "only support stream" in low or "only supports stream" in low or "stream mode" in low:
        return "stream_only"

    # 模型名不存在
    if "model not found" in low or "does not exist" in low or "unknown model" in low:
        return "not_found"

    # 凭证本身无效
    if (
        "invalidapikey" in low
        or "invalid api key" in low
        or "invalid_api_key" in low
        or "incorrect api key" in low
    ):
        return "unauthorized"

    # 限流（一时打太快，与「额度耗尽」处置方式不同）
    if (
        "throttl" in low
        or "rate limit" in low
        or "ratelimit" in low
        or "too many requests" in low
        or "限流" in low
    ):
        return "throttled"

    # ---- 第二层：文本没给信息，退回状态码 ----
    if status_code == 429:
        return "throttled"
    if status_code == 404:
        return "not_found"
    if status_code in (401, 403):
        return "unauthorized"
    return "error"


# 状态 → 管理台展示文案（前端直接消费，避免两边各写一套）
QUOTA_LABELS: dict[str, str] = {
    "unknown": "未检测",
    "ok": "可用",
    "exhausted": "额度耗尽",
    "throttled": "被限流",
    "denied": "未开通 / 未部署",
    "stream_only": "仅支持流式",
    "unauthorized": "Key 无效",
    "not_found": "模型不存在",
    "error": "调用报错",
}


async def record_quota_state(
    model_id: str, status: str, message: str | None
) -> None:
    """记录额度/错误状态：内存立即更新，并持久化（失败不影响主流程）。

    只在出错路径调用，因此这里开一个短会话是可接受的；用 try/except 包住，
    保证任何 DB 抖动都不会把一次 AI 调用彻底打断。
    """
    now = datetime.utcnow()
    _quota[model_id] = {
        "status": status,
        "message": message,
        "at": now.isoformat(),
    }
    try:
        from app.database import async_session_factory
        from app.models.ai_model import AIModel

        async with async_session_factory() as db:
            row = (
                await db.execute(select(AIModel).where(AIModel.model_id == model_id))
            ).scalars().first()
            if row is not None:
                row.quota_status = status
                row.quota_message = (message or "")[:1000] or None
                row.quota_checked_at = now
                # 官方明确「额度耗尽」（403 AllocationQuota.FreeTierOnly）时，
                # 直接把记账归零 —— 这是**真实校准**，不是估算。
                if status == "exhausted":
                    row.quota_used_base = int(row.quota_total or 0)
                    row.tokens_used = 0
                    row.quota_calibrated_at = now
            await db.commit()
    except Exception as exc:  # pragma: no cover
        logger.warning("persist quota state failed for %s: %s", model_id, exc)


async def mark_ok(model_id: str) -> None:
    """成功调用后把久留的失败标记清掉（仅当之前是失败态才写库）。"""
    prev = _quota.get(model_id, {}).get("status")
    _quota[model_id] = {"status": "ok", "message": None, "at": datetime.utcnow().isoformat()}
    if prev in (None, "ok"):
        return
    try:
        from app.database import async_session_factory
        from app.models.ai_model import AIModel

        async with async_session_factory() as db:
            row = (
                await db.execute(select(AIModel).where(AIModel.model_id == model_id))
            ).scalars().first()
            if row is not None:
                row.quota_status = "ok"
                row.quota_message = None
                row.quota_checked_at = datetime.utcnow()
                row.last_used_at = datetime.utcnow()
            await db.commit()
    except Exception as exc:  # pragma: no cover
        logger.warning("persist ok state failed for %s: %s", model_id, exc)


def usage_for(model_id: str) -> dict[str, int]:
    return _usage.get(
        model_id,
        {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    )


def quota_for(model_id: str) -> dict[str, Any]:
    return _quota.get(model_id, {"status": "unknown", "message": None, "at": None})


def usage_snapshot() -> dict[str, dict[str, int]]:
    return {k: dict(v) for k, v in _usage.items()}


def reset_runtime_state() -> None:
    """测试用：清空进程内状态。"""
    global _active_model
    _active_model = None
    _usage.clear()
    _quota.clear()
