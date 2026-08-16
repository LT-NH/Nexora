import React from 'react';
import { ArrowLeft, GitCommit } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';

interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

const changelogData: ChangelogEntry[] = [
  {
    version: 'v4.0',
    date: '2026年8月16日',
    changes: [
      '重大升级：真实 Shopify 店铺接入——移除全部模拟/种子数据，系统数据 100% 来自真实平台（nexora-store 开发商店）',
      '新增真实数据同步：商品 43 / 订单 53 / 客户 23 全部来自 Shopify Admin API，后台「店铺管理 → 同步」自动拾取落库',
      '新增优惠券真实同步：读取 Shopify price rules + discount codes，优惠券页展示真实折扣（买一送一 SUMMERBOGO、免运费 FREESHIPPING、黑五 8 折 BLACKFRIDAY）',
      '新增退款售后真实同步：订单退款事件自动进入退款售后页（14 条真实退款，含金额/原因/订单号关联）',
      'Bug 修复：商品管理翻页失效（GET 请求缓存 key 未含查询参数，?page=2 命中第一页缓存 → 缓存 key 改为完整 URL 含 params）',
      'Bug 修复：店铺同步误报失败（全局请求超时 15s < 全量同步 20-40s → 同步请求单独放宽至 120s）',
      'Bug 修复：店铺「上次同步」时间差 8 小时（后端存 UTC 前端按本地解析 → 按 UTC 解析后转本地显示）',
      'Bug 修复：Shopify 适配器请求走系统代理超时（httpx trust_env=False 直连，1.3s 响应）',
      'UI 升级：经营健康卡重排版——140px 大分数环 + 4 级字体梯度 + 5 维度网格化 + 行动清单卡片化（主题色图标/执行按钮右对齐）',
      '工程：新增开发一键同步脚本（nexora-optimized → GitHub 自动提交推送），后续所有改动实时进仓库',
    ],
  },
  {
    version: 'v3.1',
    date: '2026年8月',
    changes: [
      '新增演示数据一键重置：设置页「重置演示数据」（超管可见），现场被改动后一键恢复 90 天种子数据；demo 账号升级为平台管理员',
      '性能优化：进入工作台从 5s+ 降到约 1s（回访 0.7s 秒开）——GET 请求 10s 内存缓存去重（/workspaces/:slug 由 11 次重复请求降为 1 次）、千问网络调用 6s 超时 + 4s 事件循环保护（不再阻塞其他接口排队）、AI 销售分析异步后置加载不挡首屏',
      '可视化升级：全部 9 个 ECharts 图表跟随品牌主色（useChartPalette 同系色板，改白标色图表同步变色）',
      '可视化升级：Dashboard KPI 数字滚动动画（CountUp）+ 每卡 30 天迷你趋势线',
      '可视化升级：Dashboard「实时动态」实时事件流面板（订单/退款/库存事件脉冲渐入），新订单到达时营收图尾部实时追加数据点',
      '可视化升级：AI 智能助手回答与图表联动——回答文本命中的实体自动高亮对应表格行/条形（脉冲强调）',
      '可视化升级：销售趋势图叠加未来 7 天 AI 预测（虚线 + 半透明置信带），tooltip 金额千分位 ¥ 格式化',
      'AI 多轮对话记忆：/ai/chat 与流式接口接收最近 6 条历史消息，「那它卖了多少件？」可正确指代上轮商品',
      '首屏提速：开场品牌动画 7s → 1.9s；?demo=1 参数直达内容跳过动画',
      '移动端性能降级：小屏（<768px）自动关闭极光/粒子/点阵/光泽背景层，保留静态光斑；全站移动实测零溢出零 JS 错误',
      '部署就绪：Docker 启动自动 Alembic 迁移 + 空库播种、render.yaml 蓝图（API+Postgres+Redis 全免费）、vercel.json、免费部署指南',
      'Bug 修复：首页卡片意外变深色（防闪烁脚本默认 system→light + Landing 强制浅色）',
      'Bug 修复：Hero「千问 AI 已就绪」浮动卡错位（.glass-card 的 position:relative 覆盖 absolute → inline style 强制定位，左缘像素级对齐）',
      'Bug 修复：一键重置偶发失败（前端 15s 超时被后端 17s 重置超过 → 请求单独放宽 120s）',
      '新增 Cohort 留存分析：客户洞察页热力图（首购月份 × 月份留存率），商业深度从“卖了多少”升级到“客户留多久”',
      '新增 AI 流失预警：30 天未复购客户名单真实查库（流失/沉睡/未复购触发），多轮追问“他们买得最多的是什么”可继续深挖',
      '种子数据新增 3 位流失客户（45-60 天未下单），让流失预警演示有真实名单',
      '新增「经营健康引擎」：工作台顶部健康评分（0-100 环形 + 红黄绿），现金流/库存/客户/渠道/增长 5 维度自动评分与归因',
      '新增「今日行动清单」：引擎基于真实数据生成明确处方（补货/清仓/唤醒/退款排查），每条附预估影响，按严重度排序',
      '新增「异常雷达」：自动扫描订单突降/退款率异常/断货风险/渠道下滑，按严重度主动推送',
      '新增「一键执行」：清仓自动降价 15%（真实改价）、唤醒自动创建满 99 减 20 券，执行后健康分实时重算',
      '演示数据优化：种子订单覆盖到今天（昨日数据实时新鲜），异常检测不再出现假告警',
      '新增「经营周会」：每周一页经营结论——本周 3 个关键变化 + 下周 3 件事 + 下周营收预测（含置信度），一键导出文本周报分享给合伙人',
    ],
  },
  {
    version: 'v3.0',
    date: '2026年8月',
    changes: [
      'AI 全面接入通义千问（Qwen）：商品描述 / SEO 关键词 / 营销文案 / 销售分析 / 客户洞察 / AI 周报 / BI 问答全部真实大模型生成，失败自动回退规则引擎',
      '新增 AI 智能助手页：自然语言 BI 问答（营收 / 热销 / 退款率 / 库存预警 4 类意图），真实查库 + 千问润色回答 + 图表展示',
      '新增 AI 定价建议：基于近 30 天均销与库存覆盖天数，输出促销 / 涨价 / 保持建议',
      '首页重写为交互叙事版：Hero 动画控制台（SVG 渐变 Sparkline 描边 + 平台增长条 + 千问脉冲点）、Apple 字体层次、02/03 编号叙事、信任大数字',
      '首页背景动效升级：旋转极光 + 动态点阵网格 + 24 粒子上升场 + 三层光斑鼠标视差，全 GPU 合成 60fps',
      '全页液态玻璃质感：Hero / 功能 / 定价 / FAQ 等 6 大区块半透明化 + 背景模糊，动态背景透出 + 流动光泽条纹',
      '新增收款管理：支付宝 / 微信模拟扫码收款（二维码生成 + 模拟支付成功回调 + 订单状态联动）',
      '新增品牌定制（白标）：品牌名 / Logo / 主色实时生效，全站一键换肤',
      '全站国际化（中/EN）：18 个功能页面 + 顶栏 / 侧边栏 / 搜索 / 通知 / 引导弹窗全部双语，点击即时切换零刷新',
      '默认浅色调：修复品牌设置强制深色覆盖主题系统的冲突，品牌深色模式仅在用户未选择时生效',
      '底部 CTA 配色修复：蓝渐变与紫色背景冲突 → 纯白胶囊按钮（白底紫字）',
      '基础设施：Redis 限流 + 缓存（不可用自动回退内存）、异步任务队列（邮件不阻塞请求）、事件总线（订单事件驱动 Webhook + 通知）',
      '工程治理：Docker Compose 一键部署（PostgreSQL + Redis + 后端 + 前端）、90 天种子数据脚本、压测脚本 + 性能报告模板、GitHub Actions CI',
      '质量修复：服务性能卡片 404（/metrics/process 端点）、Alembic 初始迁移（23 表）、退款 Schema 与枚举对齐、/ready 探针 Redis 降级可选、/metrics 可选 Token 鉴权、健康检查 1.2s → 0.3s',
      '测试增强：新增退款 / 会员等级 / 权限 / 反馈 4 组测试模块，全量 39 项通过',
    ],
  },
  {
    version: 'v2.2',
    date: '2026年8月',
    changes: [
      '仪表盘重构：三标签分区（概览 / 数据洞察 / 运营管理），降低信息密度与认知负荷',
      '表格增强：商品页与订单页支持全选 / 多选批量操作（批量删除 + 批量改状态）',
      '交互优化：商品页筛选条件（搜索 / 状态 / 分类）实时同步 URL，支持分享与书签',
      '安全删除：单个删除与批量删除均支持 5 秒撤销 Toast，误删可一键恢复',
      'Toast 增强：新增 action 按钮插槽，支持撤销 / 重试等内联操作',
      'Table 组件：新增 selectable / selectedIds / onSelectionChange 三属性，支持行级选择',
      '暗色模式：Dashboard 快速操作 / 最近动态、Products 表格列、Orders 表格列及错误状态全面适配',
      '暗色模式：Table 骨架屏、Dropdown、Toast、Skeleton 组件补齐 dark 变体',
      'Bug 修复：Dashboard 标签页 JSX 结构错误（标签嵌套错乱导致编译失败）',
      'Bug 修复：Products 描述列 max-w-none 与 max-w-[200px] CSS 冲突',
    ],
  },
  {
    version: 'v2.1',
    date: '2026年8月',
    changes: [
      '安全加固：订单金额服务端重算 + 库存原子扣减，杜绝客户端篡改',
      '安全加固：Admin 端点（周报触发 / 备份 / 备份状态）统一增加超管鉴权',
      '安全加固：Webhook 密钥不再明文返回，改为 secret_set 布尔值',
      '安全加固：加密解密失败抛出异常而非静默返回密文',
      '数据精度：金额字段 Float → Numeric 迁移，消除浮点精度丢失',
      '数据精度：异步上下文中 time.sleep 替换为 asyncio.sleep，杜绝事件循环阻塞',
      '平台适配：抖音适配器修复 timedelta 导入缺失导致的运行时错误',
      '前端重构：统一 ECharts Hook（useEChart），消除 9 个图表组件的重复初始化逻辑',
      '前端重构：ECharts 全面适配暗色主题，图表随主题切换自动重渲染',
      '功能增强：AI 助手支持 SSE 流式输出，逐字呈现对话体验',
      '功能增强：WebSocket 实时通知（订单创建等事件即时推送）',
      '工程治理：引入 Alembic 数据库迁移框架，Schema 变更可追踪可回滚',
      '工程治理：接入 Prometheus 指标中间件，请求耗时 / 状态码可视化监控',
      'Bug 修复：404 异常处理器保留业务层自定义错误消息（不再统一吞为 "path not found"）',
      'Bug 修复：首次订阅切换（switch-plan）无订阅时自动创建，不再返回 404',
      'Bug 修复：Billing 页面所有付费方案升级均正确弹出支付确认弹窗',
    ],
  },
  {
    version: 'v2.0',
    date: '2026年7月',
    changes: [
      '新增 AI 数据洞察（5 个 AI 端点：销售分析、客户画像、营销文案、SEO 关键词、商品描述）',
      '新增暗色模式（亮色/暗色/跟随系统三态切换）+ WCAG 2.1 AA 无障碍',
      '新增 Glass 毛玻璃特效 + 科技点阵背景 + 渐变光球装饰',
      '新增开场品牌动画（Logo 弹性弹入 + NEXORA 逐字展开 + 主页交叉淡入）',
      '代码重构：Product 路由 796→317 行（瘦身 60%），Order 路由 611→162 行（瘦身 73%）',
    ],
  },
  {
    version: 'v1.1',
    date: '2026年6月',
    changes: [
      '新增 28 项 pytest-asyncio 集成测试，全量 10.2s 通过',
      '新增 Fernet AES-128 字段级加密（api_secret / access_token）',
      '新增 JWT 双 Token 认证 + API Key SHA-256 双认证体系',
      '新增多平台店铺接入（Shopify / 抖音 / 淘宝 / 京东 / Amazon / 沙盒）',
      '新增 Subscriptions 订阅管理 + Stripe 预备集成',
    ],
  },
  {
    version: 'v1.0',
    date: '2026年6月',
    changes: [
      '初始版本发布',
      '多租户工作空间 + OWNER/ADMIN/MEMBER/VIEWER 角色权限',
      '商品 CRUD（多规格变体 + 分类树 + AI 描述生成）',
      '订单管理（状态流 + 日期筛选 + 统计 + 7 天趋势）',
      '客户管理（标签 + RFM 五层分析）',
      'API 密钥管理（生成/撤销/过期检测）',
    ],
  },
];

const Changelog: React.FC = () => {
  usePageTitle('更新日志');
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 transition-colors duration-300">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 dark:bg-gray-950/80 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                <ArrowLeft size={18} />
                <span className="text-sm font-medium">返回首页</span>
              </Link>
            </div>
            <div className="flex items-center gap-2.5">
              <img
                src="/nexora-logo.png"
                alt="Nexora"
                className="h-8 w-8 object-contain"
              />
              <span className="text-lg font-bold text-slate-900 dark:text-white">
                Nexora
              </span>
            </div>
            <div className="w-[100px]" />
          </div>
        </div>
      </nav>

      {/* Content */}
      <section className="pt-28 pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-12">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              更新日志
            </h1>
            <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">
              Nexora 产品的版本更新记录与变更详情
            </p>
          </div>

          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-gray-700" />

            <div className="space-y-10">
              {changelogData.map((entry, idx) => (
                <div key={entry.version} className="relative pl-12">
                  {/* Timeline dot */}
                  <div className="absolute left-0 top-1 w-10 h-10 rounded-full bg-white dark:bg-gray-900 border-2 border-primary-500 flex items-center justify-center z-10">
                    <GitCommit size={16} className="text-primary-600" />
                  </div>

                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
                    <div className="flex items-baseline gap-3 mb-4">
                      <span className="text-lg font-bold text-slate-900 dark:text-white">
                        {entry.version}
                      </span>
                      <span className="text-sm text-gray-400 dark:text-gray-500">
                        {entry.date}
                      </span>
                    </div>
                    <ul className="space-y-2.5">
                      {entry.changes.map((change, ci) => (
                        <li
                          key={ci}
                          className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed"
                        >
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
                          {change}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-500 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-sm">
            {new Date().getFullYear()} Nexora. 保留所有权利。
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Changelog;
