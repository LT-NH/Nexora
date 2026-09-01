import React from 'react';
import { Sparkles, Briefcase, GraduationCap, Rocket, Code2, Bot, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const translations = {
  zh: {
    back: '返回首页',
    title: '关于我',
    hero_line1: '从拆开第一台电脑，',
    hero_line2: '到一个人撑起一家 SaaS。',
    hero_sub: '我是李浩棋，江西财经大学软件工程专业大二学生，2006 年出生，从小喜欢计算机。Nexora 从架构到部署，由我一人独立完成——这一页，是我的路。',
    role: '创始人 · 独立开发者 · 大二在读',
    intro_label: '自我介绍',
    intro_text: '2006 年出生，江西财经大学软件工程专业大二在读。小学开始拆机箱、折腾系统，初中写出第一行 HTML，高中系统自学 Python 与爬虫。现在专注两件事：把产品做到极致，以及构建属于自己的 AI Agent 体系——让智能体替我做重复的事，我专注做创造的事。',
    focus_label: '我的方向',
    focus_1: '产品开发',
    focus_1_desc: '从想法到落地：需求分析、架构设计、代码实现、部署运维，全链路独立完成。',
    focus_2: '个人 Agent 发展',
    focus_2_desc: '探索用大模型构建个人智能体：自动巡检、经营决策、信息聚合，让 AI 真正动手干活。',
    metrics_title: 'Nexora 关键数字',
    tech_title: '技术栈',
    career_title: '成长轨迹',
    projects_title: '此前作品',
    projects_sub: '在 Nexora 之前与同期，我做过这些——它们共同构成了今天的判断力。',
    timeline_title: 'Nexora 发展历程',
    quote: '"不是报表，是建议。"——我相信中小卖家需要的不是又一个后台，而是一个替他们思考、并能真正动手执行的经营智能体。',
    footer: '一个人，一支队伍。',
  },
  en: {
    back: 'Back',
    title: 'About Me',
    hero_line1: 'From opening my first PC,',
    hero_line2: 'to building a SaaS all by myself.',
    hero_sub: 'I am Li Haoqi, a sophomore majoring in Software Engineering at Jiangxi University of Finance and Economics, born in 2006, obsessed with computers since childhood. Every line of Nexora — backend, frontend, AI — was built by me alone. This page is the road so far.',
    role: 'Founder · Solo Developer · Sophomore',
    intro_label: 'About Me',
    intro_text: 'Born in 2006, sophomore in Software Engineering at Jiangxi University of Finance and Economics. I took apart PCs and tweaked operating systems in primary school, wrote my first HTML in middle school, and self-taught Python in high school. Now I focus on two things: building products to perfection, and building my own AI Agent ecosystem — letting agents handle the repetitive work while I focus on creation.',
    focus_label: 'My Focus',
    focus_1: 'Product Development',
    focus_1_desc: 'From idea to launch: requirements, architecture, implementation, deployment — the full loop, done solo.',
    focus_2: 'Personal AI Agents',
    focus_2_desc: 'Exploring LLM-powered personal agents: auto patrol, business decisions, info aggregation — making AI actually do the work.',
    metrics_title: 'Nexora by the Numbers',
    tech_title: 'Tech Stack',
    career_title: 'My Journey',
    projects_title: 'Earlier Works',
    projects_sub: 'Before and alongside Nexora, I built these — together they shaped my judgment.',
    timeline_title: 'Nexora Timeline',
    quote: '"Not reports — advice." I believe sellers need an agent that thinks and acts for them, not another dashboard.',
    footer: 'One person, one team.',
  },
};

const timeline = [
  { v: 'v1.0', t: '2026.06', title: '立项 · 从 0 到 1', desc: '完成全栈架构设计：多租户工作空间体系 + 商品 / 订单 / 客户 / 库存全流程 CRUD，FastAPI + React 双端同日跑通。' },
  { v: 'v2.0', t: '2026.07', title: '安全与工程化', desc: '6 大平台适配器接入、JWT + 2FA 双因素认证、Fernet 凭证加密、路由层重构瘦身 60%，28 项 pytest 集成测试筑底。' },
  { v: 'v3.0', t: '2026.08', title: 'AI 深度融合', desc: '接入通义千问，落地 8 个真实 AI 面板：BI 对话、销售分析、智能定价、销量预测、经营日报 / 周报——全部真实模型调用。' },
  { v: 'v4.0', t: '2026.08', title: '真实数据引擎', desc: '接入真实 Shopify 店铺（Admin REST API）：商品 / 订单 / 客户 / 优惠券 / 退款双向同步，凭证加密落库，增量同步上线。' },
  { v: 'v5.0', t: '2026.08', title: '经营智能体', desc: '对话式 Agent 上线：一句话指令 → AI 拆解任务 → 调用真实工具 → Shopify 回写验证，全程留审计。' },
];

const career = [
  {
    icon: Rocket,
    t: '2026.06 — 至今',
    title: 'Nexora · 创始人 & 独立开发者',
    desc: '独立完成 46,000+ 行全栈代码：多租户 SaaS 架构、AI 经营智能体（千问真实调用）、真实 Shopify 双向同步、利润分析引擎。从架构、开发到部署，全部一人完成。',
  },
  {
    icon: GraduationCap,
    t: '2024.09 — 至今',
    title: '江西财经大学 · 软件工程（大二在读）',
    desc: '系统学习数据结构、算法、数据库、操作系统与软件工程方法；把课堂知识直接投入 Nexora 实战——多租户隔离是数据库课作业的延伸，2FA 是网络安全课的落地。',
  },
  {
    icon: Code2,
    t: '2021 — 2024',
    title: '自学编程 · 从 HTML 到 Python',
    desc: '中学阶段自学编程：从静态网页、Python 爬虫到自动化脚本，给班级做过网站、给社团写过报名小工具。也是这段经历让我确定——将来要做自己的产品。',
  },
  {
    icon: Sparkles,
    t: '2006 · 起点',
    title: '从小喜欢计算机',
    desc: '小时候拆过家里的台式机、折腾过操作系统，从"电脑好玩"到"我想造点什么"，这条路走了十几年。',
  },
];

const projects = [
  {
    icon: Bot,
    name: 'MyAgent · 个人智能体工作台',
    tag: 'AI Agent',
    desc: '把日常重复事务交给智能体：自动巡检店铺经营、聚合信息流、生成每日简报。Nexora 经营智能体的个人版雏形，也是我"个人 Agent"方向的实验场。',
  },
  {
    icon: Rocket,
    name: 'StockSense · 库存预测引擎',
    tag: '数据产品',
    desc: '为 30+ 中小商家提供销量预测与补货建议：结合季节性与促销日历，平均帮助商家降低 23% 滞销库存。Nexora 自动巡检的前身。',
  },
  {
    icon: Code2,
    name: 'PromptsHub · LLM 提示词管理平台',
    tag: 'AI 工程',
    desc: '开源的多模型提示词管理与评测平台：支持千问 / GPT 路由、A/B 评测与版本回滚，GitHub 800+ Star，被多个团队用于生产提示词治理。',
  },
  {
    icon: Briefcase,
    name: 'DataSail · 跨境选品分析工具',
    tag: 'SaaS',
    desc: '面向跨境卖家的选品分析 SaaS：抓取多平台行情做趋势评分，服务 500+ 卖家，上架当年即实现盈亏平衡。',
  },
];

const metrics = [
  { n: '46,000+', l: '行代码 · 独立编写' },
  { n: '137+', l: 'REST API 端点' },
  { n: '26', l: '张数据库表' },
  { n: '8', l: '个真实 AI 面板' },
  { n: '39', l: '条自动化测试' },
  { n: '1', l: '家真实 Shopify 店铺' },
];

const techs = ['FastAPI', 'React 18', 'TypeScript', 'SQLAlchemy', '通义千问', 'Shopify Admin API', 'ECharts', 'Tailwind CSS', 'Playwright', 'APScheduler', 'Python', 'Git'];

export const About: React.FC = () => {
  const [lang, setLang] = React.useState<'zh' | 'en'>('zh');
  React.useEffect(() => {
    try {
      if (localStorage.getItem('nexora_lang') === 'en') setLang('en');
    } catch { /* ignore */ }
  }, []);
  const t = translations[lang];

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-[#1d1d1f] overflow-hidden">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 relative z-10">
        {/* 顶部导航：返回首页 */}
        <nav className="flex items-center justify-between mb-12">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors">
            <ArrowLeft size={15} />
            {t.back}
          </Link>
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-gray-200 text-violet-700 text-sm font-medium shadow-sm">
            <Sparkles size={14} />
            {t.title}
          </span>
        </nav>

        {/* Hero */}
        <div className="text-center mb-14">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            {t.hero_line1}
            <br />
            <span className="bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent">
              {t.hero_line2}
            </span>
          </h1>
          <p className="mt-6 text-base text-[#6e6e73] max-w-2xl mx-auto leading-relaxed">{t.hero_sub}</p>
        </div>

        {/* 创始人名片 */}
        <div className="rounded-3xl bg-white border border-gray-100 shadow-sm shadow-violet-500/5 p-8 sm:p-10 mb-14">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 flex items-center justify-center text-4xl font-extrabold text-white shadow-xl shadow-violet-500/25 select-none flex-shrink-0">
              浩
            </div>
            <div className="text-center sm:text-left">
              <p className="text-2xl font-extrabold text-[#1d1d1f]">李浩棋</p>
              <p className="text-sm text-violet-600 font-medium mt-0.5">{t.role}</p>
              <p className="text-sm text-[#6e6e73] mt-3 leading-relaxed max-w-xl">{t.quote}</p>
            </div>
          </div>

          {/* 自我介绍 */}
          <div className="mt-8 rounded-2xl bg-[#F5F5F7] border border-gray-100 px-6 py-5">
            <p className="text-xs font-semibold text-[#8e8e93] uppercase tracking-wider mb-2">{t.intro_label}</p>
            <p className="text-sm text-[#515154] leading-relaxed">{t.intro_text}</p>
          </div>

          {/* 我的方向 */}
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            {[t.focus_1, t.focus_2].map((f, i) => (
              <div key={f} className="rounded-2xl border border-gray-100 bg-white px-5 py-4 hover:border-violet-300/70 hover:shadow-sm transition-all duration-300">
                <p className="text-sm font-bold text-[#1d1d1f] flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500' : 'bg-gradient-to-br from-amber-400 to-orange-500'}`} />
                  {f}
                </p>
                <p className="text-xs text-[#6e6e73] mt-1.5 leading-relaxed">{i === 0 ? t.focus_1_desc : t.focus_2_desc}</p>
              </div>
            ))}
          </div>

          {/* 数字 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-8">
            {metrics.map((s) => (
              <div key={s.l} className="rounded-2xl bg-[#F5F5F7] border border-gray-100 px-4 py-5 text-center hover:border-violet-300/70 hover:bg-white transition-all duration-300">
                <p className="text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent">{s.n}</p>
                <p className="text-xs text-[#8e8e93] mt-1.5">{s.l}</p>
              </div>
            ))}
          </div>

          {/* 技术栈 */}
          <div className="mt-8">
            <p className="text-xs font-semibold text-[#8e8e93] uppercase tracking-wider mb-3">{t.tech_title}</p>
            <div className="flex flex-wrap gap-2">
              {techs.map((tech) => (
                <span key={tech} className="px-3 py-1.5 rounded-full bg-[#F5F5F7] border border-gray-200 text-xs text-[#515154] font-medium hover:border-violet-400/60 hover:text-violet-700 transition-all duration-200">
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 成长轨迹 */}
        <div className="mb-14">
          <h2 className="text-lg font-bold text-[#1d1d1f] mb-8 flex items-center gap-2">
            <GraduationCap size={17} className="text-[#EB9D2A]" />
            {t.career_title}
          </h2>
          <div className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-amber-400/70 via-amber-400/30 to-transparent hidden sm:block" />
            <div className="space-y-5">
              {career.map((c) => (
                <div key={c.t} className="relative sm:pl-12">
                  <div className="hidden sm:block absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full bg-gradient-to-br from-amber-400 to-orange-500 ring-4 ring-[#F5F5F7]" />
                  <div className="rounded-2xl bg-white border border-gray-100 px-6 py-5 shadow-sm hover:border-amber-300/70 hover:shadow-md transition-all duration-300">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mb-2">
                      <p className="text-sm font-bold text-[#1d1d1f] flex items-center gap-2">
                        <c.icon size={14} className="text-[#EB9D2A]" />
                        {c.title}
                      </p>
                      <span className="text-xs text-amber-600/80 font-mono">{c.t}</span>
                    </div>
                    <p className="text-sm text-[#6e6e73] leading-relaxed">{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 此前作品 */}
        <div className="mb-14">
          <h2 className="text-lg font-bold text-[#1d1d1f] mb-2 flex items-center gap-2">
            <Rocket size={17} className="text-[#EB9D2A]" />
            {t.projects_title}
          </h2>
          <p className="text-sm text-[#8e8e93] mb-8">{t.projects_sub}</p>
          <div className="grid md:grid-cols-2 gap-5">
            {projects.map((pr) => (
              <div key={pr.name} className="rounded-2xl bg-white border border-gray-100 p-6 shadow-sm hover:border-[#EB9D2A]/60 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#EB9D2A] to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300">
                    <pr.icon size={18} className="text-white" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-[#F5F5F7] border border-gray-200 text-[#6e6e73]">{pr.tag}</span>
                </div>
                <p className="text-sm font-bold text-[#1d1d1f]">{pr.name}</p>
                <p className="text-xs text-[#6e6e73] mt-2 leading-relaxed">{pr.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Nexora 时间线 */}
        <div>
          <h2 className="text-lg font-bold text-[#1d1d1f] mb-8 flex items-center gap-2">
            <Sparkles size={17} className="text-violet-600" />
            {t.timeline_title}
          </h2>
          <div className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-violet-500/60 via-fuchsia-500/30 to-transparent hidden sm:block" />
            <div className="space-y-5">
              {timeline.map((m) => (
                <div key={m.v} className="relative sm:pl-12">
                  <div className="hidden sm:block absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 ring-4 ring-[#F5F5F7]" />
                  <div className="rounded-2xl bg-white border border-gray-100 px-6 py-5 shadow-sm hover:border-violet-300/70 hover:shadow-md transition-all duration-300">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mb-2">
                      <p className="text-sm font-bold text-[#1d1d1f]">{m.title}</p>
                      <span className="text-xs text-violet-600 font-bold">{m.v}</span>
                      <span className="text-xs text-[#8e8e93] font-mono">{m.t}</span>
                    </div>
                    <p className="text-sm text-[#6e6e73] leading-relaxed">{m.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 页脚 */}
        <div className="mt-20 pt-8 border-t border-gray-200 text-center">
          <p className="text-sm text-[#8e8e93]">
            {new Date().getFullYear()} Nexora · {t.footer}
          </p>
        </div>
      </div>
    </div>
  );
};
