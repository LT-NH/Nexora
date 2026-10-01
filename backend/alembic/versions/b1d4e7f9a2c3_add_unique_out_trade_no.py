"""add unique constraint on subscription_orders.out_trade_no

Revision ID: b1d4e7f9a2c3
Revises: eda0f99c71f8
Create Date: 2026-09-20 17:20:00.000000

背景：支付回调按 out_trade_no 反查订单后再 ``.limit(1)`` 取一条。旧的下单代码
``f"NEXAL{int(time.time())}{plan.slug[:2]}"`` 精度只到「秒」，同一秒内两个工作空间
购买同档套餐会生成完全相同的单号 —— 回调可能因此激活**错误租户**的订单。
本迁移为该列补上唯一约束（列宽同时放宽到 64，容纳新的「时间戳 + 随机」单号）。
"""
from alembic import op
import sqlalchemy as sa


revision = 'b1d4e7f9a2c3'
down_revision = 'eda0f99c71f8'
branch_labels = None
depends_on = None


def _dedupe_out_trade_no() -> None:
    """把历史重复的 out_trade_no 错开，否则加唯一约束会直接失败。

    保留每组最早的一条，其余改写为 ``DUP-<id 前缀>``。
    """
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT out_trade_no FROM subscription_orders "
            "WHERE out_trade_no IS NOT NULL "
            "GROUP BY out_trade_no HAVING COUNT(*) > 1"
        )
    ).fetchall()

    for (trade_no,) in rows:
        ids = [
            r[0]
            for r in bind.execute(
                sa.text(
                    "SELECT id FROM subscription_orders "
                    "WHERE out_trade_no = :t ORDER BY created_at"
                ),
                {"t": trade_no},
            ).fetchall()
        ]
        for row_id in ids[1:]:
            bind.execute(
                sa.text(
                    "UPDATE subscription_orders SET out_trade_no = :new WHERE id = :id"
                ),
                {"new": f"DUP-{row_id}"[:64], "id": row_id},
            )


def upgrade() -> None:
    _dedupe_out_trade_no()
    # batch_alter_table 让 SQLite 也能执行（内部按「建新表 → 拷数据 → 换名」实现）
    with op.batch_alter_table("subscription_orders") as batch:
        batch.alter_column(
            "out_trade_no", type_=sa.String(length=64), existing_nullable=True
        )
        batch.create_unique_constraint(
            "uq_subscription_orders_out_trade_no", ["out_trade_no"]
        )


def downgrade() -> None:
    with op.batch_alter_table("subscription_orders") as batch:
        batch.drop_constraint("uq_subscription_orders_out_trade_no", type_="unique")
        batch.alter_column(
            "out_trade_no", type_=sa.String(length=40), existing_nullable=True
        )
