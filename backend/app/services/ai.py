"""Nexora - AI-Powered E-Commerce Intelligence Service.

Primary: Qwen (通义千问) via OpenAI-compatible API (set QWEN_API_KEY in .env).
Fallback: Rule-based engines and templates when API key is not configured.
"""

import asyncio
import json
import math
import os
import random
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncGenerator, Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.logging import get_logger

logger = get_logger(__name__)


def _get_qwen_config():
    """Lazy-load Qwen config from pydantic settings (reads .env at runtime)."""
    from app.config import settings
    return settings.QWEN_API_KEY, settings.QWEN_MODEL, settings.QWEN_BASE_URL


def _extract_json(text: str) -> dict | list | None:
    """Robustly extract a JSON object or array from an LLM response.

    Tries, in order: a direct ``json.loads``, a markdown fenced code block,
    the substring from the first ``{`` to the last ``}``, and finally the
    substring from the first ``[`` to the last ``]`` (for JSON arrays).

    Returns the parsed structure, or ``None`` when no valid JSON is found.
    """
    # Try direct parse
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        pass
    # Try extracting from markdown code blocks
    match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    if match:
        try:
            return json.loads(match.group(1))
        except (json.JSONDecodeError, TypeError):
            pass
    # Try finding first { to last }
    first = text.find('{')
    last = text.rfind('}')
    if first != -1 and last != -1 and last > first:
        try:
            return json.loads(text[first:last + 1])
        except (json.JSONDecodeError, TypeError):
            pass
    # Try finding first [ to last ] (JSON arrays)
    first = text.find('[')
    last = text.rfind(']')
    if first != -1 and last != -1 and last > first:
        try:
            return json.loads(text[first:last + 1])
        except (json.JSONDecodeError, TypeError):
            pass
    return None


async def _qwen_chat(messages: list[dict], temperature: float = 0.7) -> str:
    """Call Qwen API. Returns response text or raises on error."""
    key, model, base_url = _get_qwen_config()
    if not key:
        raise RuntimeError("No QWEN_API_KEY configured")

    async with httpx.AsyncClient(timeout=6) as client:
        resp = await client.post(
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": 2000,
            },
        )
        data = resp.json()
        if resp.status_code != 200:
            raise RuntimeError(f"Qwen API error: {data}")
        return data["choices"][0]["message"]["content"]


class AIService:
    """AI-driven e-commerce intelligence service.

    All methods are static and async. Uses Qwen (通义千问) API when
    QWEN_API_KEY is configured in environment, falls back to rule-based
    engines and templates otherwise.
    """

    # =========================================================================
    # Product Description Generation
    # =========================================================================

    _TONE_TEMPLATES: dict[str, dict[str, str]] = {
        "professional": {
            "prefix": "【专业品质】",
            "style": "professional and authoritative",
            "cta": "立即选购，体验专业品质",
        },
        "casual": {
            "prefix": "",
            "style": "friendly and approachable",
            "cta": "快来试试吧，超棒的~",
        },
        "luxury": {
            "prefix": "【臻选奢品】",
            "style": "elegant and exclusive",
            "cta": "臻享非凡，即刻拥有",
        },
        "conversational": {
            "prefix": "",
            "style": "warm and conversational",
            "cta": "赶紧入手，不会后悔的！",
        },
    }

    _PLATFORM_TIPS: dict[str, str] = {
        "taobao": "建议在描述中加入优惠券信息和限时促销话术，提升转化率。",
        "jd": "京东用户注重品质和物流，建议强调正品保障和快速配送。",
        "pdd": "拼多多用户对价格敏感，建议突出性价比和拼团优惠。",
        "douyin": "抖音商品描述需短小精悍，前3秒抓住注意力，强调视觉冲击。",
        "xiaohongshu": "小红书用户注重种草和真实体验，建议用第一人称和场景化描述。",
        "shopify": "Focus on SEO keywords and clear benefit statements for international buyers.",
        "general": "适用于多平台通用描述，建议根据具体渠道进一步优化。",
    }

    @staticmethod
    async def _legacy_generate_product_description(
        name: str,
        category: str,
        features: list[str],
        target_platform: str = "general",
        tone: str = "professional",
    ) -> dict:
        tone_config = AIService._TONE_TEMPLATES.get(tone, AIService._TONE_TEMPLATES["professional"])
        platform_tip = AIService._PLATFORM_TIPS.get(target_platform, AIService._PLATFORM_TIPS["general"])

        title = f"{tone_config['prefix']}{name}"

        feature_summary = "、".join(features[:3]) if features else "精选好物"
        short_desc = f"{name}，{feature_summary}，品质之选。"

        paragraphs = [
            f"{name}，专为追求品质的您打造。",
            f"产品类目：{category}",
            "",
            "【产品亮点】",
        ]
        for i, feature in enumerate(features, 1):
            paragraphs.append(f"{i}. {feature}")
        paragraphs.extend([
            "",
            "【适用场景】",
            f"无论是日常使用还是馈赠亲友，{name}都是您的理想之选。",
            "",
            "【购买建议】",
            tone_config["cta"],
        ])
        description = "\n".join(paragraphs)

        bullet_points = [
            f"【{category}】{name} - {feature_summary}",
        ]
        for feature in features:
            bullet_points.append(f"- {feature}")
        bullet_points.append(f"- {tone_config['cta']}")

        return {
            "title": title,
            "short_desc": short_desc,
            "description": description,
            "bullet_points": bullet_points,
            "platform_tips": platform_tip,
        }

    @staticmethod
    async def generate_product_description(
        name: str,
        category: str,
        features: list[str],
        target_platform: str = "general",
        tone: str = "professional",
    ) -> dict:
        """Generate multi-platform product descriptions based on name, category, and features.

        Args:
            name: Product name.
            category: Product category (e.g., 'electronics', 'clothing').
            features: List of product features and selling points.
            target_platform: Target e-commerce platform.
            tone: Writing tone (professional, casual, luxury, conversational).

        Returns:
            A dict with title, short_desc, description, bullet_points, and platform_tips.
        """
        if _get_qwen_config()[0]:
            try:
                features_str = "、".join(features) if features else "优质产品"
                platform_tip = AIService._PLATFORM_TIPS.get(target_platform, AIService._PLATFORM_TIPS["general"])
                prompt = f"""你是一位专业的电商文案写手。请为以下产品生成描述文案，严格返回JSON格式。

产品名称：{name}
产品类目：{category}
产品特点：{features_str}
目标平台：{target_platform}
文案风格：{tone}

请返回严格JSON（不要markdown代码块）：
{{
  "title": "产品标题（包含前缀修饰，不超过30字）",
  "short_desc": "简短描述，1-2句话，100-200字",
  "description": "完整产品描述，包含产品亮点和购买建议，200-400字",
  "bullet_points": ["卖点1", "卖点2", "卖点3", "卖点4"],
  "platform_tips": "针对该平台的具体建议，不超过50字"
}}"""
                result = await _qwen_chat(
                    [
                        {"role": "system", "content": "你是电商文案专家，只返回严格JSON。"},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.7,
                )
                ai_result = _extract_json(result)
                if ai_result and isinstance(ai_result, dict):
                    return {
                        "title": ai_result.get("title", name),
                        "short_desc": ai_result.get("short_desc", f"{name}，优质之选。"),
                        "description": ai_result.get("description", ""),
                        "bullet_points": ai_result.get("bullet_points", features),
                        "platform_tips": ai_result.get("platform_tips", platform_tip),
                    }
            except Exception as e:
                logger.warning(
                    "Qwen product description failed, using rule-based fallback: %s", e
                )

        return await AIService._legacy_generate_product_description(
            name, category, features, target_platform, tone
        )

    # =========================================================================
    # SEO Keywords Generation
    # =========================================================================

    _SEO_MODIFIERS: dict[str, list[str]] = {
        "electronics": ["正品", "品质", "智能", "高性能", "新款", "热销", "官方", "旗舰"],
        "clothing": ["新款", "时尚", "百搭", "显瘦", "透气", "舒适", "韩版", "ins风"],
        "food": ["新鲜", "健康", "有机", "特产", "美味", "零食", "好吃", "营养"],
        "home": ["北欧风", "简约", "实用", "收纳", "家居", "ins风", "轻奢", "高颜值"],
        "beauty": ["护肤", "保湿", "美白", "防晒", "温和", "敏感肌", "正品", "平价"],
        "sports": ["运动", "健身", "户外", "透气", "减震", "跑步", "专业", "轻便"],
        "baby": ["安全", "婴儿", "宝宝", "母婴", "温和", "无刺激", "新生", "柔软"],
        "general": ["热销", "推荐", "新品", "性价比", "品质", "爆款", "好评", "人气"],
    }

    @staticmethod
    async def _legacy_generate_seo_keywords(
        name: str,
        category: str,
        description: str,
    ) -> list[str]:
        keywords: set[str] = set()

        for token in re.split(r"[\s\-/]+", name):
            if len(token) >= 2:
                keywords.add(token)

        modifiers = AIService._SEO_MODIFIERS.get(category.lower(), AIService._SEO_MODIFIERS["general"])
        for mod in modifiers:
            if len(name) + len(mod) <= 30:
                keywords.add(f"{name} {mod}")
            keywords.add(f"{mod} {category}")

        desc_words = re.findall(r"[\u4e00-\u9fff\w]{2,}", description)
        word_freq = Counter(desc_words)
        for word, _ in word_freq.most_common(10):
            if len(word) >= 2 and word not in keywords:
                keywords.add(word)

        top_modifiers = modifiers[:3]
        for mod in top_modifiers:
            keywords.add(f"{mod}{category}{name}")

        keywords.add(f"{category} {name}")
        keywords.add(f"{name} {category}")

        return sorted(list(keywords))[:30]

    @staticmethod
    async def generate_seo_keywords(
        name: str,
        category: str,
        description: str,
    ) -> list[str]:
        """Generate SEO keyword suggestions for a product.

        Args:
            name: Product name.
            category: Product category.
            description: Product description text.

        Returns:
            A list of recommended SEO keywords.
        """
        if _get_qwen_config()[0]:
            try:
                desc_short = description[:500] if description else ""
                prompt = f"""你是一位电商SEO专家。请为以下产品生成5-8个高价值SEO搜索关键词。

产品名称：{name}
产品类目：{category}
产品描述：{desc_short}

要求：
1. 优先长尾关键词（3-5个词组合）
2. 包含高搜索量的修饰词（如"2024新款"、"性价比"、"推荐"等）
3. 考虑用户的搜索意图（购买型、信息型）

请返回严格JSON数组格式（不要markdown代码块）：
["关键词1", "关键词2", "关键词3", "关键词4", "关键词5"]"""
                result = await _qwen_chat(
                    [
                        {"role": "system", "content": "你是电商SEO专家，只返回JSON数组。"},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.5,
                )
                ai_keywords = _extract_json(result)
                if isinstance(ai_keywords, list):
                    # Merge with rule-based for comprehensive coverage
                    legacy_keywords = await AIService._legacy_generate_seo_keywords(name, category, description)
                    merged = list(dict.fromkeys(ai_keywords + legacy_keywords))
                    return merged[:30]
            except Exception as e:
                logger.warning(
                    "Qwen SEO keywords failed, using rule-based fallback: %s", e
                )

        return await AIService._legacy_generate_seo_keywords(name, category, description)

    # =========================================================================
    # Sales Trend Analysis
    # =========================================================================

    @staticmethod
    async def _legacy_analyze_sales_trend(orders: list[dict]) -> dict:
        if not orders:
            return {
                "trend": "insufficient_data",
                "forecast": {"next_7_days": 0.0, "confidence": "low"},
                "peak_days": [],
                "recommendations": ["数据不足，建议积累至少30天销售数据后再进行分析。"],
            }

        daily_sales: dict[str, float] = {}
        daily_counts: dict[str, int] = {}
        for order in orders:
            created = order.get("created_at")
            if isinstance(created, str):
                date_str = created[:10]
            elif isinstance(created, datetime):
                date_str = created.strftime("%Y-%m-%d")
            else:
                continue

            daily_sales[date_str] = daily_sales.get(date_str, 0.0) + order.get("total", order.get("total_amount", 0.0))
            daily_counts[date_str] = daily_counts.get(date_str, 0) + 1

        sorted_dates = sorted(daily_sales.keys())
        if len(sorted_dates) < 2:
            return {
                "trend": "stable",
                "forecast": {"next_7_days": sum(daily_sales.values()), "confidence": "low"},
                "peak_days": sorted_dates,
                "recommendations": ["数据点较少，建议持续观察销售趋势。"],
            }

        recent_dates = sorted_dates[-7:] if len(sorted_dates) >= 7 else sorted_dates
        recent_sales = [daily_sales[d] for d in recent_dates]
        mid = len(recent_sales) // 2
        first_half_avg = sum(recent_sales[:mid]) / mid if mid > 0 else 0
        second_half_avg = sum(recent_sales[mid:]) / (len(recent_sales) - mid) if len(recent_sales) > mid else 0

        if second_half_avg > first_half_avg * 1.1:
            trend = "upward"
        elif second_half_avg < first_half_avg * 0.9:
            trend = "downward"
        else:
            trend = "stable"

        total_sales = sum(daily_sales.values())
        avg_daily = total_sales / len(sorted_dates) if sorted_dates else 0
        if trend == "upward":
            forecast_multiplier = 1.15
        elif trend == "downward":
            forecast_multiplier = 0.85
        else:
            forecast_multiplier = 1.0
        forecast_next_7 = round(avg_daily * 7 * forecast_multiplier, 2)

        avg_sales = sum(recent_sales) / len(recent_sales) if recent_sales else 0
        peak_days = [
            d for d in recent_dates
            if daily_sales.get(d, 0) > avg_sales * 1.3
        ]

        recommendations = []
        if trend == "upward":
            recommendations.append("销售呈上升趋势，建议适当增加库存以满足增长需求。")
            recommendations.append("可考虑加大营销投入，抓住增长窗口期。")
        elif trend == "downward":
            recommendations.append("销售呈下降趋势，建议排查原因：检查竞品动态、评估定价策略。")
            recommendations.append("考虑推出限时促销活动以刺激销量。")
        else:
            recommendations.append("销售趋势平稳，建议优化产品详情页和营销策略以寻求增长。")

        if peak_days:
            days_str = "、".join(peak_days)
            recommendations.append(f"销售高峰日：{days_str}，建议在这些日期前后加大推广力度。")

        return {
            "trend": trend,
            "forecast": {
                "next_7_days": forecast_next_7,
                "confidence": "medium" if len(sorted_dates) >= 14 else "low",
            },
            "peak_days": peak_days,
            "recommendations": recommendations,
        }

    @staticmethod
    async def analyze_sales_trend(orders: list[dict]) -> dict:
        """Analyze sales trends and generate forecast reports.

        Args:
            orders: A list of order dicts with keys: total_amount, created_at, status.

        Returns:
            A dict with trend, forecast, peak_days, and recommendations.
        """
        if not orders:
            return {
                "trend": "stable",
                "forecast": {"next_7_days": 0, "confidence": "low"},
                "peak_days": [],
                "recommendations": ["暂无足够订单数据进行分析"],
            }

        if _get_qwen_config()[0]:
            try:
                summary = json.dumps(orders[-30:], ensure_ascii=False, default=str)[:8000]
                prompt = f"""你是一位电商数据分析专家。请分析以下订单数据并给出JSON格式的建议。

订单数据：{summary}

请返回严格JSON（不要markdown代码块）：
{{
  "trend": "upward/downward/stable",
  "forecast_next_7_days": 预估金额数字,
  "confidence": "low/medium/high",
  "peak_days": ["日期1","日期2"],
  "recommendations": ["建议1,不超过30字", "建议2"]
}}"""
                result = await _qwen_chat(
                    [
                        {"role": "system", "content": "你是电商数据分析师，只返回JSON。"},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.3,
                )
                ai_result = _extract_json(result)
                if ai_result and isinstance(ai_result, dict):
                    return {
                        "trend": ai_result.get("trend", "stable"),
                        "forecast": {
                            "next_7_days": ai_result.get("forecast_next_7_days", 0),
                            "confidence": ai_result.get("confidence", "low"),
                        },
                        "peak_days": ai_result.get("peak_days", []),
                        "recommendations": ai_result.get("recommendations", [])[:3],
                    }
            except Exception as e:
                logger.warning(
                    "Qwen analysis failed, using rule-based fallback: %s", e
                )

        return await AIService._legacy_analyze_sales_trend(orders)

    # =========================================================================
    # Customer Insights
    # =========================================================================

    @staticmethod
    async def _legacy_customer_insights(customers: list[dict]) -> dict:
        if not customers:
            return {
                "segments": [],
                "total_customers": 0,
            }

        segments_count: dict[str, int] = {
            "vip": 0,
            "active": 0,
            "occasional": 0,
            "dormant": 0,
            "new": 0,
        }

        now = datetime.now(timezone.utc)
        total_customers = len(customers)

        for customer in customers:
            total_orders = customer.get("total_orders", 0)
            total_spent = customer.get("total_spent", 0.0)
            last_order_str = customer.get("last_order_at")

            recency_days = 999
            if last_order_str:
                if isinstance(last_order_str, str):
                    try:
                        last_order = datetime.fromisoformat(last_order_str.replace("Z", "+00:00"))
                    except (ValueError, TypeError):
                        last_order = now
                elif isinstance(last_order_str, datetime):
                    last_order = last_order_str
                else:
                    last_order = now
                recency_days = (now - last_order.replace(tzinfo=timezone.utc)).days

            if total_spent >= 5000 and total_orders >= 5:
                segments_count["vip"] += 1
            elif recency_days <= 30 and total_orders >= 2:
                segments_count["active"] += 1
            elif recency_days <= 90:
                segments_count["occasional"] += 1
            elif recency_days > 90 and total_orders > 0:
                segments_count["dormant"] += 1
            else:
                segments_count["new"] += 1

        segment_recommendations = {
            "vip": "建立专属社群维护关系，提供生日特权等增值服务，提升客户终身价值",
            "active": "继续通过个性化推荐和会员权益保持活跃度",
            "occasional": "通过限时优惠和精准推荐提升购买频率，引导成为活跃客户",
            "dormant": "发送唤醒优惠券或限时促销活动，重新激活购买意愿",
            "new": "优化首次购买体验和复购引导，加速新客户向活跃客户转化",
        }

        segments_list = []
        segment_names = {
            "vip": "VIP客户",
            "active": "活跃客户",
            "occasional": "偶尔购买",
            "dormant": "沉睡客户",
            "new": "新客户",
        }

        for key, count in segments_count.items():
            if count > 0:
                segments_list.append({
                    "name": segment_names.get(key, key),
                    "count": count,
                    "percentage": round(count / total_customers * 100, 1),
                    "recommendation": segment_recommendations.get(key, ""),
                })

        return {
            "segments": segments_list,
            "total_customers": total_customers,
        }

    @staticmethod
    async def customer_insights(customers: list[dict]) -> dict:
        """Analyze customer data and generate AI-driven insights.

        Args:
            customers: A list of customer dicts with keys:
                total_orders, total_spent, last_order_at, tags, name.

        Returns:
            A dict with segments (list of {name, count, percentage, recommendation})
            and total_customers.
        """
        if not customers:
            return {
                "segments": [],
                "total_customers": 0,
            }

        if _get_qwen_config()[0]:
            try:
                summary = json.dumps(customers[:50], ensure_ascii=False, default=str)[:8000]
                total = len(customers)
                prompt = f"""你是一位客户运营专家。请分析客户数据并进行客户分层，给出运营建议。

客户总数：{total}
客户数据样本：{summary}

请返回严格JSON（不要markdown代码块）：
{{
  "segments": [
    {{
      "name": "分层名称（如VIP客户、活跃客户、沉睡客户等）",
      "count": 该分层人数,
      "percentage": 该分层占比（数字，如25.5）,
      "recommendation": "针对该分层的具体运营建议，不超过30字"
    }}
  ],
  "total_customers": {total}
}}"""
                result = await _qwen_chat(
                    [
                        {"role": "system", "content": "你是客户运营专家，只返回严格JSON。"},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.4,
                )
                ai_result = _extract_json(result)
                if ai_result and isinstance(ai_result, dict):
                    return {
                        "segments": ai_result.get("segments", []),
                        "total_customers": ai_result.get("total_customers", total),
                    }
            except Exception as e:
                logger.warning(
                    "Qwen customer insights failed, using rule-based fallback: %s", e
                )

        return await AIService._legacy_customer_insights(customers)

    # =========================================================================
    # Marketing Copy Generation
    # =========================================================================

    _CHANNEL_TEMPLATES: dict[str, dict] = {
        "wechat": {
            "name": "朋友圈",
            "style": "亲切自然，带有个人推荐感",
            "template": (
                "【今日推荐】{name}\n\n"
                "最近入手了这款{category}，真心不错！\n"
                "{features}\n\n"
                "我已经用了{time_desc}，{personal_touch}\n\n"
                "价格也很合适，{price_desc}\n"
                "有兴趣的朋友可以私信我了解更多～\n\n"
                "{hashtags}"
            ),
            "hashtags": ["#好物推荐", "#{category}", "#品质生活"],
        },
        "xiaohongshu": {
            "name": "小红书",
            "style": "种草分享，真实体验感",
            "template": (
                "{name} | 真的好用到哭！\n\n"
                "姐妹们，{opening_hook}\n\n"
                "【产品信息】\n"
                "品类：{category}\n"
                "亮点：{features}\n\n"
                "【使用感受】\n"
                "{experience}\n\n"
                "【适合人群】\n"
                "强烈推荐给{target_audience}的姐妹！\n\n"
                "{hashtags}"
            ),
            "hashtags": ["#{category}推荐", "#{name}", "#好物分享", "#种草"],
        },
        "douyin": {
            "name": "抖音",
            "style": "短小精悍，视觉冲击",
            "template": (
                "{name}真的太绝了！\n\n"
                "{features}\n\n"
                "现在下单还有优惠！\n"
                "点击下方链接get同款～\n\n"
                "{hashtags}"
            ),
            "hashtags": ["#{category}", "#{name}", "#好物推荐", "#抖音好物"],
        },
    }

    _OPENING_HOOKS = [
        "我又发现了一个宝藏单品，必须分享给你们！",
        "最近入手的最满意的一件，没有之一！",
        "被闺蜜安利了无数次，终于入手了！",
        "看到第一眼就被种草了，果然没让我失望！",
    ]

    _EXPERIENCES = [
        "用了几天下来，效果真的超出了预期。质感很好，细节处理也很到位，完全对得起这个价格。",
        "第一次使用就被惊艳到了，不管是外观还是功能都很出色，已经推荐给身边的朋友了。",
        "性价比真的很高，用了一段时间也没有出现任何问题，品质可靠。",
    ]

    @staticmethod
    async def _legacy_generate_marketing_copy(product: dict, channel: str) -> str:
        channel_config = AIService._CHANNEL_TEMPLATES.get(
            channel, AIService._CHANNEL_TEMPLATES["wechat"]
        )

        name = product.get("name", "精选好物")
        category = product.get("category", "好物")
        features = product.get("features", [])
        price = product.get("price", 0)

        features_text = "、".join(features[:3]) if features else "品质卓越，细节满分"
        price_desc = f"只需 {price} 元" if price > 0 else "性价比超高"

        opening_hook = random.choice(AIService._OPENING_HOOKS)
        experience = random.choice(AIService._EXPERIENCES)

        hashtags = " ".join(
            h.format(name=name, category=category)
            for h in channel_config.get("hashtags", [])
        )

        if channel == "wechat":
            copy_text = channel_config["template"].format(
                name=name,
                category=category,
                features=features_text,
                time_desc="一周了",
                personal_touch="感觉生活品质都提升了",
                price_desc=price_desc,
                hashtags=hashtags,
            )
        elif channel == "xiaohongshu":
            copy_text = channel_config["template"].format(
                name=name,
                opening_hook=opening_hook,
                category=category,
                features=features_text,
                experience=experience,
                target_audience="追求品质生活",
                hashtags=hashtags,
            )
        elif channel == "douyin":
            copy_text = channel_config["template"].format(
                name=name,
                features=features_text,
                category=category,
                hashtags=hashtags,
            )
        else:
            copy_text = channel_config["template"].format(
                name=name,
                category=category,
                features=features_text,
                time_desc="一段时间",
                personal_touch="感觉非常好用",
                price_desc=price_desc,
                hashtags=hashtags,
            )

        return copy_text.strip()

    @staticmethod
    async def generate_marketing_copy(product: dict, channel: str) -> str:
        """Generate marketing copy for different social media channels.

        Args:
            product: Product dict with keys: name, category, features, price, description.
            channel: Target channel (wechat, xiaohongshu, douyin).

        Returns:
            A formatted marketing copy string.
        """
        if _get_qwen_config()[0]:
            try:
                name = product.get("name", "精选好物")
                category = product.get("category", "好物")
                features = product.get("features", [])
                price = product.get("price", 0)
                features_str = "、".join(features[:5]) if features else "品质卓越"
                price_str = f"{price}元" if price > 0 else "性价比超高"

                channel_info = AIService._CHANNEL_TEMPLATES.get(channel, AIService._CHANNEL_TEMPLATES["wechat"])
                channel_name = channel_info["name"]
                channel_style = channel_info["style"]

                prompt = f"""你是一位专业的社交媒体营销文案写手。请为以下产品撰写{channel_name}营销文案。

产品名称：{name}
产品类目：{category}
产品特点：{features_str}
产品价格：{price_str}
发布渠道：{channel_name}
文案风格：{channel_style}

要求：
1. 文案长度控制在200-400字
2. 符合{channel_name}平台的调性和用户习惯
3. 有吸引力的开头，清晰的卖点展示，有力的行动号召
4. 包含相关话题标签（hashtags）

请直接返回文案内容（纯文本），不要加任何前缀说明。"""

                result = await _qwen_chat(
                    [
                        {"role": "system", "content": f"你是{channel_name}营销文案专家，直接输出文案内容。"},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.8,
                )
                return result.strip()
            except Exception as e:
                logger.warning(
                    "Qwen marketing copy failed, using rule-based fallback: %s", e
                )

        return await AIService._legacy_generate_marketing_copy(product, channel)

    # =========================================================================
    # Streaming Chat (SSE)
    # =========================================================================

    @staticmethod
    def _generate_fallback(prompt: str, context: dict = None) -> str:
        """Generate a simple rule-based response when the AI API is unavailable.

        Used as a streaming fallback when no QWEN_API_KEY is configured.
        """
        context = context or {}
        return (
            "您好！我是 Nexora 智能助手。\n\n"
            f"关于您的问题「{prompt}」，由于当前未配置 AI 服务（Qwen API），"
            "暂时无法提供深度分析。\n\n"
            "建议您：\n"
            "1. 在系统设置中配置 QWEN_API_KEY 以启用完整的 AI 能力；\n"
            "2. 我可以为您提供基础的电商运营建议和数据分析。\n\n"
            "如果您有其他问题，欢迎随时提问！"
        )

    @staticmethod
    async def stream_chat(
        prompt: str,
        context: dict = None,
        db: AsyncSession = None,
        history: list[dict] | None = None,
    ) -> AsyncGenerator[str, None]:
        """Stream AI response via SSE, grounded in the workspace's REAL data.

        The assistant first detects the intent of the question, queries the
        workspace's actual database (orders / products / refunds / customers),
        and feeds the real numbers into the LLM system prompt — so the chat
        can answer "哪个商品卖得最好" with the true top-seller instead of
        generic advice.

        When the Qwen API key is configured, streams the response
        token-by-token from the OpenAI-compatible chat completions
        endpoint. Otherwise falls back to a rule-based response (also built
        from the real data), yielding it in small chunks to simulate
        streaming.

        Args:
            prompt: The user's chat prompt.
            context: Optional context dict (e.g. workspace_id).
            db: Optional async DB session; when provided the assistant is
                grounded in real workspace data.

        Yields:
            str: Chunks of the AI response text.
        """
        api_key, model, base_url = _get_qwen_config()

        # Build the real-data context when a DB session is available
        business_context = ""
        workspace_id = (context or {}).get("workspace_id")
        if db is not None and workspace_id:
            try:
                from app.services.ai_agent import BIAgent
                result = await BIAgent.intent_data(db, workspace_id, prompt)
                data = result.get("data") or {}
                snapshot = result.get("snapshot") or {}
                if data:
                    business_context = (
                        f"以下是该工作空间的真实经营数据（来自数据库查询）：\n"
                        f"{json.dumps(data, ensure_ascii=False)[:2500]}\n"
                        f"工作空间整体快照：{json.dumps(snapshot, ensure_ascii=False)[:1200]}"
                    )
                else:
                    # 查询结果为空时附上商品库存快照，让 AI 仍有真实数据可引用
                    from app.models.product import Product
                    from sqlalchemy import select
                    rows = (
                        await db.execute(
                            select(Product.name, Product.stock)
                            .where(Product.workspace_id == workspace_id)
                            .order_by(Product.stock.asc())
                        )
                    ).all()
                    snapshot2 = [
                        {"name": r[0], "stock": r[1]} for r in rows
                    ]
                    business_context = (
                        "针对该问题的数据库查询结果为空（当前没有符合条件的数据）。"
                        "若用户询问具体商品情况，可引用以下工作空间商品库存快照：\n"
                        f"{json.dumps(snapshot2, ensure_ascii=False)[:2500]}"
                    )
            except Exception:
                # Never let context building break the chat
                pass

        # Fallback: no API key configured — yield rule-based response in chunks
        if not api_key:
            fallback = AIService._generate_fallback(prompt, context)
            if business_context:
                fallback = (
                    "根据您工作空间的真实数据：\n"
                    f"{business_context}\n\n"
                    f"{fallback}"
                )
            for i in range(0, len(fallback), 10):
                yield fallback[i:i + 10]
                await asyncio.sleep(0.05)
            return

        # Stream from the Qwen OpenAI-compatible endpoint, grounded in data
        system_msg = (
            "你是一位嵌入电商管理平台 Nexora 的数据分析助手。"
            "回答要用简洁专业的中文，优先引用用户工作空间的真实数据，"
            "不要编造数字。"
        )
        if business_context:
            system_msg += f"\n\n{business_context}"

        # 多轮记忆：把最近对话作为额外的 system 内容（避免破坏真实数据上下文）
        if history:
            lines = []
            for msg in history[-6:]:
                role = "用户" if msg.get("role") == "user" else "助手"
                lines.append(f"{role}：{str(msg.get('content', ''))[:300]}")
            system_msg += "\n\n以下是本次会话历史（供理解上下文，如“那退款呢”“刚才说的”）:\n" + "\n".join(lines)

        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream(
                "POST",
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_msg},
                        {"role": "user", "content": prompt},
                    ],
                    "stream": True,
                    "max_tokens": 2000,
                },
            ) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                            content = (
                                chunk.get("choices", [{}])[0]
                                .get("delta", {})
                                .get("content", "")
                            )
                            if content:
                                yield content
                        except json.JSONDecodeError:
                            continue
