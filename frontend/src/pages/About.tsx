import React from 'react';
import { Sparkles, Briefcase, GraduationCap, Rocket, Code2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const translations = {
  zh: {
    back: '返回首页',
    title: '关于我',
    hero_line1: '一个人，一支队伍，',
    hero_line2: '从第一行代码到真实店铺运营。',
    hero_sub: 'Nexora 不是团队作业的产物——它由创始人独立完成全部后端、前端、AI 与数据工程。这一页，是我走过的路。',
    timeline_title: 'Nexora 发展历程',
    career_title: '履历',
    projects_title: '此前作品',
    projects_sub: '在 Nexora 之前，我做过这些——它们共同构成了今天的判断力。',
    metrics_title: 'Nexora 关键数字',
    tech_title: '技术栈',
    quote: '"不是报表，是建议。"——我相信中小卖家需要的不是又一个后台，而是一个替他们思考、并能真正动手执行的经营智能体。',
    role: '创始人 · 全栈工程师',
  },
  en: {
    back: 'Back',
    title: 'About Me',
    hero_line1: 'One person, one team,',
    hero_line2: 'from first line of code to a real store.',
    hero_sub: 'Nexora is not a team effort — every line of backend, frontend, AI and data engineering was built by its founder. This page is the road so far.',
    timeline_title: 'Nexora Timeline',
    career_title: 'Career',
    projects_title: 'Earlier Works',
    projects_sub: 'Before Nexora, I built these — together they shaped my judgment.',
    metrics_title: 'Key Numbers',
    tech_title: 'Tech Stack',
    quote: '"Not reports — advice." I believe sellers need an agent that thinks and acts for them, not another dashboard.',
    role: 'Founder · Full-stack Engineer',
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
    t: '2024 — 至今',
    title: 'Nexora · 创始人 & 独立开发者',
    desc: '独立完成 46,000+ 行全栈代码：多租户 SaaS 架构、AI 经营智能体（千问 function-call 工具编排）、真实 Shopify 双向同步、利润分析引擎。从架构到部署全部一人完成。',
  },
  {
    t: '2021 — 2024',
    title: '星澜科技 · 高级全栈工程师',
    desc: '主导电商 SaaS 中台从 0 到 1：设计多租户数据隔离与计费体系，服务 2,000+ 商家；将订单链路 P99 延迟从 1.8s 优化至 320ms；带队 4 人完成店铺插件市场。',
  },
  {
    t: '2019 — 2021',
    title: '云启网络 · 全栈工程师',
    desc: '负责跨境电商数据平台：日均处理 300 万条订单事件的消息管道（Kafka + ClickHouse）；搭建实时销量看板，被 3 个事业部采纳为标准报表工具。',
  },
  {
    t: '2015 — 2019',
    title: '计算机科学与技术 · 本科',
    desc: '校级创新创业项目一等奖；ACM 校队队员；毕业设计「基于协同过滤的电商推荐系统」获评优秀毕业论文。',
  },
];

const projects = [
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

const techs = ['FastAPI', 'React 18', 'TypeScript', 'SQLAlchemy', '通义千问', 'Shopify Admin API', 'ECharts', 'Tailwind CSS', 'Playwright', 'APScheduler', 'Kafka', 'ClickHouse'];

export const About: React.FC = () => {
  const [lang, setLang] = React.useState<'zh' | 'en'>('zh');
  React.useEffect(() => {
    try {
      if (localStorage.getItem('nexora_lang') === 'en') setLang('en');
    } catch { /* ignore */ }
  }, []);
  const t = translations[lang];

  return (
    <div className="min-h-screen text-white overflow-hidden" style={{ background: 'linear-gradient(160deg, #0b1023 0%, #151238 45%, #0b1023 100%)' }}>
      {/* 背景装饰 */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-violet-600/10 blur-[130px]" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] rounded-full bg-fuchsia-600/10 blur-[130px]" />
        <div className="absolute -bottom-40 left-1/3 w-[500px] h-[500px] rounded-full bg-indigo-600/10 blur-[130px]" />
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 relative z-10">
        {/* 返回 */}
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-[#8e8e93] hover:text-white transition-colors mb-10">
          <ArrowLeft size={15} />
          {t.back}
        </Link>

        {/* Hero */}
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-violet-300 text-sm font-medium">
            <Sparkles size={14} />
            {t.title}
          </span>
          <h1 className="mt-6 text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            {t.hero_line1}
            <br />
            <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
              {t.hero_line2}
            </span>
          </h1>
          <p className="mt-6 text-base text-[#8e8e93] max-w-2xl mx-auto leading-relaxed">{t.hero_sub}</p>
        </div>

        {/* 创始人名片 */}
        <div className="rounded-3xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 p-8 sm:p-10 backdrop-blur mb-16">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 flex items-center justify-center text-4xl font-extrabold text-white shadow-xl shadow-violet-500/30 select-none flex-shrink-0">
              浩
            </div>
            <div className="text-center sm:text-left">
              <p className="text-2xl font-extrabold text-white">李浩棋</p>
              <p className="text-sm text-violet-300 font-medium mt-0.5">{t.role}</p>
              <p className="text-sm text-[#a1a1aa] mt-3 leading-relaxed max-w-xl">{t.quote}</p>
            </div>
          </div>
          {/* 数字 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-8">
            {metrics.map((s) => (
              <div key={s.l} className="rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-5 text-center hover:border-violet-400/40 hover:bg-white/[0.07] transition-all duration-300">
                <p className="text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight bg-gradient-to-r from-white to-violet-200 bg-clip-text text-transparent">{s.n}</p>
                <p className="text-xs text-[#8e8e93] mt-1.5">{s.l}</p>
              </div>
            ))}
          </div>
          {/* 技术栈 */}
          <div className="mt-8">
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">{t.tech_title}</p>
            <div className="flex flex-wrap gap-2">
              {techs.map((tech) => (
                <span key={tech} className="px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-xs text-[#c4c4cc] font-medium hover:border-violet-400/50 hover:text-white transition-all duration-200">
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 履历 */}
        <div className="mb-16">
          <h2 className="text-lg font-bold text-white/90 mb-8 flex items-center gap-2">
            <Briefcase size={16} className="text-amber-400" />
            {t.career_title}
          </h2>
          <div className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-amber-400/50 via-amber-400/25 to-transparent hidden sm:block" />
            <div className="space-y-6">
              {career.map((c) => (
                <div key={c.t} className="relative sm:pl-12">
                  <div className="hidden sm:block absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full bg-gradient-to-br from-amber-400 to-orange-500 ring-4 ring-[#0b1023]" />
                  <div className="rounded-2xl bg-white/[0.03] border border-white/10 px-6 py-5 hover:border-amber-400/40 hover:bg-white/[0.05] transition-all duration-300">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mb-2">
                      <p className="text-sm font-bold text-white">{c.title}</p>
                      <span className="text-xs text-amber-300/80 font-mono">{c.t}</span>
                    </div>
                    <p className="text-sm text-[#a1a1aa] leading-relaxed">{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 此前作品 */}
        <div className="mb-16">
          <h2 className="text-lg font-bold text-white/90 mb-2 flex items-center gap-2">
            <Rocket size={16} className="text-[#EB9D2A]" />
            {t.projects_title}
          </h2>
          <p className="text-sm text-[#8e8e93] mb-8">{t.projects_sub}</p>
          <div className="grid md:grid-cols-3 gap-5">
            {projects.map((pr) => (
              <div key={pr.name} className="rounded-2xl bg-white/[0.03] border border-white/10 p-6 hover:border-[#EB9D2A]/50 hover:bg-white/[0.06] hover:-translate-y-1 transition-all duration-300 group">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#EB9D2A] to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300">
                    <pr.icon size={18} className="text-white" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white/5 border border-white/10 text-[#8e8e93]">{pr.tag}</span>
                </div>
                <p className="text-sm font-bold text-white">{pr.name}</p>
                <p className="text-xs text-[#a1a1aa] mt-2 leading-relaxed">{pr.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Nexora 时间线 */}
        <div>
          <h2 className="text-lg font-bold text-white/90 mb-8 flex items-center gap-2">
            <Sparkles size={16} className="text-violet-400" />
            {t.timeline_title}
          </h2>
          <div className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-violet-500/60 via-fuchsia-500/40 to-transparent hidden sm:block" />
            <div className="space-y-6">
              {timeline.map((m) => (
                <div key={m.v} className="relative sm:pl-12">
                  <div className="hidden sm:block absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 ring-4 ring-[#0b1023]" />
                  <div className="rounded-2xl bg-white/[0.03] border border-white/10 px-6 py-5 hover:border-violet-500/40 hover:bg-white/[0.05] transition-all duration-300">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mb-2">
                      <p className="text-sm font-bold text-white">{m.title}</p>
                      <span className="text-xs text-violet-300 font-bold">{m.v}</span>
                      <span className="text-xs text-[#8e8e93] font-mono">{m.t}</span>
                    </div>
                    <p className="text-sm text-[#a1a1aa] leading-relaxed">{m.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 页脚 */}
        <div className="mt-20 pt-8 border-t border-white/10 text-center">
          <p className="text-sm text-[#8e8e93]">
            {new Date().getFullYear()} Nexora · 一个人，一支队伍。
          </p>
        </div>
      </div>
    </div>
  );
};
