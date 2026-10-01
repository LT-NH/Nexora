"""add order data_source and platform_order_id

Revision ID: c2e8f1a45d67
Revises: b1d4e7f9a2c3
Create Date: 2026-09-23 14:20:00.000000

背景：全库此前不区分订单来源，simulator 造的假订单会贴上任意的 platform 标签
（库内 941 笔标着 douyin / taobao / wechat，而系统里根本没有这些平台的店铺），
导致利润分析、健康评分、AI 建议都可能建立在假数据上，且事后无法区分真假。

本迁移：
  1. 加 data_source（real / sandbox / simulated）+ 索引
  2. 加 platform_order_id（平台侧单号，跨次同步的幂等键）+ 唯一约束
  3. 按「保守基线 + 证据升级」回填历史数据

回填原则：宁可误标为 simulated，不可漏标为 real。
理由是代价不对称 —— 把假数据当真的代价是客户信任归零且不可逆；
把真数据当假的代价只是需要人工修正（可用 reclassify_orders.py 处理）。
"""
from alembic import op
import sqlalchemy as sa


revision = 'c2e8f1a45d67'
down_revision = 'b1d4e7f9a2c3'
branch_labels = None
depends_on = None


def _backfill_data_source(bind) -> None:
    """按可证据化的规则回填历史订单来源。

    注意：这里写入的是**枚举 name（大写）** —— SQLAlchemy 的 Enum() 默认以
    name 作为数据库值，本项目所有枚举列都遵循此约定（orders.status = 'PAID'、
    stores.platform = 'SHOPIFY'）。曾用小写 value 写入，导致读取时抛
    LookupError，已由迁移 d4f7b2c91e30 修正。
    """
    # ① 保守基线：先全部标为 SIMULATED
    bind.execute(sa.text("UPDATE orders SET data_source = 'SIMULATED'"))

    # ② 平台 = sandbox 的标 SANDBOX（沙箱适配器产物，可确定）
    bind.execute(
        sa.text("UPDATE orders SET data_source = 'SANDBOX' WHERE platform = 'sandbox'")
    )

    # ③ 唯一可以升级为 REAL 的证据：该工作空间存在**同平台的非沙箱店铺**。
    #    订单只可能通过店铺同步进来 —— 没有店铺就不可能有真实订单。
    #    这一步会把「workspace 里有 shopify 店铺」的 shopify 订单标回 REAL；
    #    而 douyin / taobao / wechat 因为没有对应店铺，保持 SIMULATED。
    bind.execute(
        sa.text(
            """
            UPDATE orders SET data_source = 'REAL'
            WHERE platform IS NOT NULL
              AND platform != 'manual'
              AND EXISTS (
                SELECT 1 FROM stores s
                WHERE s.workspace_id = orders.workspace_id
                  AND LOWER(s.platform) = LOWER(orders.platform)
                  AND (s.sandbox = 0 OR s.sandbox IS NULL)
              )
            """
        )
    )


def upgrade() -> None:
    with op.batch_alter_table("orders") as batch:
        batch.add_column(
            sa.Column(
                "data_source",
                sa.String(length=16),
                nullable=False,
                server_default="REAL",
                comment="REAL / SANDBOX / SIMULATED（枚举 name）",
            )
        )
        batch.add_column(
            sa.Column(
                "platform_order_id",
                sa.String(length=128),
                nullable=True,
                comment="平台侧订单 ID —— 跨次同步的幂等键",
            )
        )

    op.create_index("ix_orders_data_source", "orders", ["data_source"])
    op.create_index("ix_orders_platform_order_id", "orders", ["platform_order_id"])

    _backfill_data_source(op.get_bind())

    with op.batch_alter_table("orders") as batch:
        # 平台单号幂等键：同工作空间 + 同平台单号只允许一行。
        # SQLite / PostgreSQL 都允许多行 NULL，历史数据（该列为空）不受影响。
        batch.create_unique_constraint(
            "uq_order_workspace_platform_id", ["workspace_id", "platform_order_id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("orders") as batch:
        batch.drop_constraint("uq_order_workspace_platform_id", type_="unique")
    op.drop_index("ix_orders_platform_order_id", table_name="orders")
    op.drop_index("ix_orders_data_source", table_name="orders")
    with op.batch_alter_table("orders") as batch:
        batch.drop_column("platform_order_id")
        batch.drop_column("data_source")
