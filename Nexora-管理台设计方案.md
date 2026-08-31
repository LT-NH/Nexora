# Nexora 超级管理台（Admin Console）设计方案

**版本**：v1.0 ｜ **定位**：平台级运营管理后台（Superadmin 专用）
**原则**：贴着现有代码生长——复用 `require_superadmin` 鉴权、`AdminDashboard` 路由壳、审计日志服务与分页组件，不做额外框架引入。

---

## 一、目标与边界

### 目标
把现有的"只读统计页"升级为**覆盖平台运营全生命周期的管理台**：用户、租户（工作空间）、订阅与支付、店铺连接、定时任务、审计日志、用户反馈、系统运维八大模块，做到"**运营问题不出管理台**"。

### 明确不做（避免过度设计）
- ❌ 多管理员角色分级（现阶段只有 superadmin 一级，引入角色矩阵是过度设计）
- ❌ 多管理员操作审批流
- ❌ SQL 控制台 / 直接改库界面（危险且不可审计）
- ❌ 独立部署（与主应用同进程同前端，路由隔离即可）

---

## 二、信息架构

```
/admin                      平台总览（Dashboard）
├── /admin/users            用户管理
├── /admin/workspaces       工作空间（租户）管理
├── /admin/subscriptions    订阅与支付管理
├── /admin/stores           全局店铺健康视图
├── /admin/jobs             定时任务中心
├── /admin/audit            全局审计日志
├── /admin/feedback         用户反馈与公告
└── /admin/system           系统运维
```

- 前端新增 **AdminLayout**（深色侧边栏 + 面包屑，与业务端 AppLayout 视觉区分，明确"你正在管理模式"）
- 入口：顶栏头像下拉菜单中，仅 `is_superadmin === true` 的用户可见"平台管理"入口
- 后端路由统一挂载在 `/api/v1/admin/*`，**全部端点强制 `require_superadmin`**

---

## 三、八大模块详细设计

### 模块 A · 平台总览（改造现有 AdminDashboard）

| 区块 | 内容 |
| --- | --- |
| 核心指标卡 | 用户总数/今日新增、7 日活跃、工作空间数、店铺连接数、活跃订阅、MRR 估算（按套餐价折算） |
| 趋势图 | 近 30 天注册趋势（line）、全平台订单量趋势（line）、套餐分布（pie） |
| 系统健康 | 数据库/Redis 状态、最近备份时间、最近一次巡检/同步任务结果 |
| 快捷入口 | 触发周报、手动备份、重置演示数据（保留现有三个端点） |

### 模块 B · 用户管理

- **列表**：分页 + 搜索（邮箱/姓名）+ 筛选（状态/是否超管/注册时间区间）；展示注册时间、最近登录（`last_login_at` 已有字段）、TOTP 是否开启、所属工作空间数
- **操作**：
  - 禁用/启用（`is_active` 字段已有——需确认登录链路校验该字段，未校验则补一行判断）
  - 重置密码（生成 12 位临时密码，返回一次，强制审计）
  - 授予/收回 superadmin（**保护规则**：不允许收回自己的权限；系统至少保留一名超管）
  - 强制下线（吊销该用户全部 refresh token）
  - 删除（二次确认：要求输入用户邮箱；级联策略与现有外键一致）
- **详情抽屉**：基本信息 + 所属工作空间及角色 + 最近 20 条审计记录

### 模块 C · 工作空间（租户）管理

- **列表**：分页 + 搜索 + 筛选（套餐/状态）；展示成员数、店铺数、订单量、套餐、创建时间
- **详情**：成员列表（角色/移除）、店铺连接概况、订阅状态、最近审计
- **操作**：停用/恢复（停用 = 全体成员登录后不可进入该空间，需在成员校验链路加判断）、转移所有权（更换 OWNER）、删除（输入空间 slug 二次确认，级联删除全部业务数据）
- **配额**：手动调整成员数/空间数上限（覆盖套餐默认值）

### 模块 D · 订阅与支付管理

- **订阅列表**：按套餐/状态（试用/活跃/过期/取消）筛选，展示周期截止日
- **操作**：
  - 手动变更套餐（跳过支付通道——线下收款/大客户场景，强制填写备注并审计）
  - 延长周期 / 手动激活 / 立即取消
- **支付记录**：全平台支付流水列表（金额/方式/状态/所属工作空间），支持**手动标记已支付**
- 数据源：现有 `Subscription` / `Payment` / `SubscriptionPlan` 模型，无需新增表

### 模块 E · 全局店铺健康视图

- **列表**：所有租户的店铺（平台/名称/所属工作空间/连接状态/自动同步开关/最近同步时间/最近同步状态/错误摘要），支持按平台、状态、同步结果筛选
- **用途**：一眼发现"谁的自动同步一直在失败"，主动客服介入
- **操作**：手动触发单店同步（复用现有 `/stores/{id}/sync` 逻辑，超管可跨租户触发）
- 数据源：`Store` 模型（`last_sync_status` / `last_sync_errors` 等 v5.0 新字段）

### 模块 F · 定时任务中心

- **任务列表**：每日备份（03:00）、AI 巡检（09:00）、经营周报（周一 08:00）、店铺自动同步（每 5 分钟）——展示调度配置、上次运行时间/结果、下次计划时间
- **手动触发**：全部四个任务补齐手动触发端点（周报/备份已有；**巡检与自动同步为新增**）
- **运行历史**：新增轻量 `JobRun` 表（任务名/开始/结束/状态/摘要），每次调度执行落一条——让"任务是不是在正常跑"可回答
- 数据源：APScheduler 已注册的任务 + 新增 JobRun 记录

### 模块 G · 全局审计日志

- **查询**：按用户/工作空间/动作类型（`store.created`、`subscription.updated`…）/时间区间筛选，分页
- **展示**：动作、操作者、资源、详情 JSON、时间；删除/权限/订阅类操作高亮标记
- 数据源：现有 `Audit` 模型与 `create_audit_log` 服务——**只加查询端点，零写入改动**

### 模块 H · 用户反馈与系统公告

- **反馈处理**：FeedbackWidget 收集的反馈/NPS 列表，标记已处理/忽略，按评分排序（低分优先）
- **系统公告**：向全体用户或指定工作空间发布公告（复用 `Notification` 模型，新增 `type: announcement`），支持设定过期时间——新功能上线/维护通知的官方通道

### 模块 I · 系统运维

- 健康可视化：`/health`、`/ready`、`/metrics` 关键指标卡片化（内存/CPU/连接数/请求速率）
- 备份管理：备份文件列表（`data/` 目录）、手动备份、下载
- 演示数据重置（保留现有端点，挪入本模块）

---

## 四、后端设计

### 路由组织（现有 `app/api/admin.py` 拆分为子模块）

```
app/api/admin/
├── __init__.py        # 汇总挂载到 /api/v1/admin
├── overview.py        # 平台统计（改造现有 get_stats，增加 MRR/趋势）
├── users.py           # 用户列表/禁用/重置密码/角色/下线/删除
├── workspaces.py      # 租户列表/详情/停用/转移/删除/配额
├── subscriptions.py   # 订阅列表/手动改套餐/延期/取消 + 支付流水
├── stores.py          # 全局店铺视图 + 跨租户触发同步
├── jobs.py            # 任务列表/手动触发 + JobRun 历史
├── audit.py           # 审计查询
├── feedback.py        # 反馈列表/处理 + 公告发布
└── system.py          # 健康可视化/备份管理/演示重置
```

### 主要新增端点（约 28 个）

```
# 用户
GET    /admin/users                          # 分页+搜索+筛选（改造现有）
POST   /admin/users/{id}/disable             # 禁用
POST   /admin/users/{id}/enable
POST   /admin/users/{id}/reset-password      # 返回一次性临时密码
POST   /admin/users/{id}/toggle-superadmin   # 授予/收回（含自锁保护）
POST   /admin/users/{id}/force-logout        # 吊销 refresh token
DELETE /admin/users/{id}                     # 删除（邮箱确认）
# 工作空间
GET    /admin/workspaces                     # 分页+筛选（改造现有）
GET    /admin/workspaces/{id}                # 详情（成员/店铺/订阅聚合）
POST   /admin/workspaces/{id}/suspend        # 停用/恢复
POST   /admin/workspaces/{id}/transfer       # 转移所有权
DELETE /admin/workspaces/{id}                # 删除（slug 确认）
PUT    /admin/workspaces/{id}/quota          # 配额调整
# 订阅与支付
GET    /admin/subscriptions                  # 列表
POST   /admin/subscriptions/{id}/change-plan # 手动改套餐（备注必填）
POST   /admin/subscriptions/{id}/extend      # 延期 N 天
POST   /admin/subscriptions/{id}/cancel
GET    /admin/payments                       # 全平台支付流水
POST   /admin/payments/{id}/mark-paid        # 手动标记已支付
# 店铺
GET    /admin/stores                         # 全局店铺视图（含同步状态）
POST   /admin/stores/{id}/force-sync         # 跨租户触发同步
# 任务
GET    /admin/jobs                           # 任务列表 + JobRun 历史
POST   /admin/jobs/{name}/run                # 手动触发（含新增的巡检/同步）
# 审计 / 反馈 / 公告 / 系统
GET    /admin/audit                          # 全局审计查询
GET    /admin/feedback                       # 反馈列表
PATCH  /admin/feedback/{id}                  # 标记处理状态
POST   /admin/announcements                  # 发布系统公告
GET    /admin/system/health                  # 健康聚合
GET    /admin/system/backups                 # 备份列表
POST   /admin/system/backups                 # 手动备份
POST   /admin/system/reset-demo              # 演示重置（已有，挪入）
```

### 数据模型变更（仅 2 处，均可轻量迁移）

1. `JobRun` 新表：`id / job_name / started_at / finished_at / status / summary`——任务运行历史
2. `Notification` 复用并新增 `type` 取值 `announcement` + `expires_at`（公告过期）
3. ⚠️ 登录链路确认校验 `user.is_active`（字段已存在，需核实登录与 token 刷新两处都拦截）

### 通用规范

- 全部端点 `require_superadmin`；**写操作 100% 落审计日志**（action 前缀 `admin.`）
- 分页统一 `PaginatedResponse`；危险操作（删除/停用）后端校验 + 前端二次确认
- 自锁保护：禁用/降权/删除操作的目标为 superadmin 时额外校验"平台剩余超管数 ≥ 1"

---

## 五、前端设计

- **AdminLayout**：独立壳层——深色侧边栏（8 个模块入口）+ 顶部条（面包屑 + 返回业务端按钮），与业务端明确区隔，杜绝误操作
- **路由**：`/admin/*` 嵌套路由 + `SuperadminRoute` 守卫（非超管访问返回 403 页）
- **组件复用**：Table / PageHeader / Badge / Modal / StatCard / EmptyState 全部复用；新增 2 个：
  - `ConfirmDialog`：危险操作确认（可选输入确认文本）
  - `JobStatusBadge`：任务运行状态徽章
- **列表页统一模式**：筛选栏 + Table（分页）+ 行操作下拉；详情一律抽屉，保持操作上下文

---

## 六、安全设计要点

1. 全部端点 superadmin 鉴权（复用 `require_superadmin`，含 JWT 校验）
2. 写操作 100% 审计（含操作前后快照摘要）
3. 自锁保护：平台至少保留 1 名 superadmin；不允许对自己的账号执行禁用/删除
4. 禁用用户立即生效：登录、token 刷新、API Key 调用三处校验 `is_active`
5. 管理端点单独限流（比业务端点更严格，防爆破）
6. 敏感返回脱敏（沿用现有 `_mask_value` 模式——不返回密码哈希/令牌原文）

---

## 七、实施计划（总计约 4 天）

| 阶段 | 内容 | 交付物 |
| --- | --- | --- |
| **阶段一（P0，1.5 天）** | AdminLayout + 路由守卫 + 模块 B 用户管理（列表/禁用/重置密码/角色）+ 模块 D 订阅调整 + 模块 G 审计查询 | 运营刚需闭环：客服问题不出管理台 |
| **阶段二（P1，1.5 天）** | 模块 C 工作空间管理 + 模块 E 店铺健康视图 + 模块 F 任务中心（含 JobRun 表与 2 个新触发端点） | 租户生命周期与系统可观测 |
| **阶段三（P2，1 天）** | 模块 A 总览改造（MRR/趋势图）+ 模块 H 反馈与公告 + 模块 I 系统面板 | 完整体 |

每阶段独立可用、独立验收；阶段一完成后即可删除"连数据库手工改数据"的工作方式。

---

## 八、验收标准

1. 非超管访问任何 `/admin` 页面与端点均返回 403
2. 全部写操作在审计日志可查（含操作者与前后状态）
3. 禁用用户后：该用户已登录会话失效、无法重新登录、API Key 调用被拒
4. 手动改套餐后：租户端配额与功能立即可见生效
5. 任务中心能看到 4 个定时任务的最近运行结果，手动触发真实执行
6. 全部列表页支持筛选/分页，深色模式完整适配
