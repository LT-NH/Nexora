"""fix orders.data_source to use enum names (uppercase)

Revision ID: d4f7b2c91e30
Revises: c2e8f1a45d67
Create Date: 2026-09-23 17:15:00.000000

## 修复什么

上一个迁移 `c2e8f1a45d67` 用**小写 value**（real / sandbox / simulated）写入了
`orders.data_source`，但 SQLAlchemy 的 `Enum()` 默认用**枚举成员的 name**
（REAL / SANDBOX / SIMULATED）作为数据库值 —— 这也是本项目所有枚举列的既有约定
（`orders.status` = 'PAID'、`stores.platform` = 'SHOPIFY'）。

两者不一致的后果：**任何读取 orders 表的查询都会抛**
`LookupError: 'simulated' is not among the defined enum values`。
健康引擎（`api/health.py`）直接 500，前端表现为「体检失败」反复弹出。

## 为什么改成大写、而不是让 ORM 改用 value

1. 与项目其他枚举列保持一致（`orders.status` / `payment_status` / `stores.*` 全是大写）
2. ORM 层不必为单个列引入 `values_callable` 特例
3. API 入参侧不受影响 —— `OrderCreate.data_source` 仍是小写 value，
   经 `OrderDataSource(...)` 转换后由 SQLAlchemy 落库为大写 name

UPPER() 对这三个值恰好等价于「value → name」，一行即可修正。
"""
from alembic import op
import sqlalchemy as sa


revision = 'd4f7b2c91e30'
down_revision = 'c2e8f1a45d67'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # value → name（real → REAL / sandbox → SANDBOX / simulated → SIMULATED）
    bind.execute(sa.text("UPDATE orders SET data_source = UPPER(data_source)"))

    # 列默认值也要跟着改，否则新建行（未经 ORM 显式赋值时）会写回小写
    with op.batch_alter_table("orders") as batch:
        batch.alter_column(
            "data_source",
            existing_type=sa.String(length=16),
            server_default="REAL",
            existing_nullable=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("UPDATE orders SET data_source = LOWER(data_source)"))
    with op.batch_alter_table("orders") as batch:
        batch.alter_column(
            "data_source",
            existing_type=sa.String(length=16),
            server_default="real",
            existing_nullable=False,
        )
