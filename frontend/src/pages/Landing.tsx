import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  CreditCard,
  Key,
  Users,
  FileText,
  Check,
  ArrowRight,
  Zap,
  Layers,
  BarChart3,
  Globe,
  Github,
  Twitter,
  Linkedin,
  ChevronDown,
  ChevronUp,
  Package,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AnimatedCounter } from '@/components/AnimatedCounter';

/* ─── Reveal wrapper ─── */
const Reveal: React.FC<{ children: React.ReactNode; className?: string; delay?: number }> = ({
  children,
  className = '',
  delay = 0,
}) => {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setVisible(true);
      },
      { threshold: 0.15 },
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
      style={{
        transitionDelay: `${delay}ms`,
        transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      {children}
    </div>
  );
};

/* ─── Wavy divider ─── */
const WavyDivider: React.FC<{ flip?: boolean }> = ({ flip = false }) => (
  <div className="w-full overflow-hidden leading-none" aria-hidden>
    <svg
      viewBox="0 0 1440 120"
      className="w-full h-16 sm:h-20"
      preserveAspectRatio="none"
    >
      <path
        d={
          flip
            ? 'M0,120 C360,0 720,60 1080,30 C1260,15 1380,0 1440,0 L1440,120 Z'
            : 'M0,0 C360,60 720,30 1080,60 C1260,75 1380,90 1440,90 L1440,120 L0,120 Z'
        }
        fill="currentColor"
      />
    </svg>
  </div>
);

/* ─── Data ─── */
const bentoFeatures = [
  {
    icon: Layers,
    title: '多租户工作空间',
    desc: '隔离的数据环境，每个租户拥有独立安全沙箱、自定义设置和完整审计追踪。',
    colSpan: 'md:col-span-2 md:row-span-2',
    gradient: 'from-violet-500/10 to-indigo-500/10',
    iconBg: 'bg-violet-100 text-violet-600',
  },
  {
    icon: Package,
    title: '商品管理 + AI',
    desc: '智能商品上架、批量导入、AI 驱动的定价优化与库存预测。',
    gradient: 'from-emerald-500/10 to-teal-500/10',
    iconBg: 'bg-emerald-100 text-emerald-600',
  },
  {
    icon: TrendingUp,
    title: '订单 + 数据洞察',
    desc: '实时订单追踪、退款管理、ECharts 驱动可视化仪表盘与趋势分析。',
    gradient: 'from-amber-500/10 to-orange-500/10',
    iconBg: 'bg-amber-100 text-amber-600',
  },
  {
    icon: Users,
    title: '客户 RFM 分析',
    desc: '基于消费频率、金额、近期的智能分层，精准营销触达高价值客户。',
    gradient: 'from-rose-500/10 to-pink-500/10',
    iconBg: 'bg-rose-100 text-rose-600',
    colSpan: 'md:col-span-2',
  },
  {
    icon: Globe,
    title: '多平台接入',
    desc: '支持 Shopify、抖音、沙盒环境。框架已备，新平台仅需实现 4 个接口。',
    gradient: 'from-cyan-500/10 to-blue-500/10',
    iconBg: 'bg-cyan-100 text-cyan-600',
  },
  {
    icon: Shield,
    title: '安全加密体系',
    desc: 'bcrypt + JWT 双 Token + Fernet AES-128 + IP 频控，5 层纵深防御。',
    gradient: 'from-slate-500/10 to-gray-500/10',
    iconBg: 'bg-slate-100 text-slate-600',
    colSpan: 'md:col-span-2',
  },
];

const pricingPlans = [
  {
    name: 'Free',
    price: '¥0',
    period: '永久免费',
    description: '适合个人和小团队',
    tier: 'free' as const,
    features: [
      '1 个工作空间', '50 个商品', '基础订单管理',
      '基础客户管理', '手动订单录入', '社区支持',
    ],
    cta: '立即开始',
    popular: false,
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '¥29',
    period: '每月',
    description: '适合成长型团队',
    tier: 'pro' as const,
    features: [
      '5 个工作空间', '200 个商品', '高级订单分析',
      '客户 RFM 分析', 'AI 商品描述生成', '多平台店铺接入',
      'API 密钥管理', '优先邮件支持',
    ],
    cta: '开始免费试用',
    popular: true,
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: '¥99',
    period: '每月',
    description: '适合大型组织',
    tier: 'enterprise' as const,
    features: [
      '无限工作空间', '无限商品', '专属数据分析面板',
      '高级 AI 洞察 + 预测', '自定义报表导出', '全平台接入',
      '专属客户经理', 'SLA 99.9% 保障',
      '私有化部署支持',
    ],
    cta: '联系销售',
    popular: false,
    highlighted: false,
  },
];

const faqs = [
  {
    q: 'Nexora 支持哪些电商平台？',
    a: '目前完整支持 Shopify、抖音和沙盒离线测试环境。淘宝、京东、Amazon 平台适配器框架已就绪，新增平台只需实现 4 个接口方法。',
  },
  {
    q: '我的数据安全如何保证？',
    a: 'Nexora 采用 5 层安全体系：bcrypt 密码哈希、JWT 双 Token 认证、API Key SHA-256 哈希存储、Fernet AES-128 字段级加密、IP 级别频率限制。所有平台凭证均为加密存储。',
  },
  {
    q: '免费试用有功能限制吗？',
    a: '14 天免费试用期间可完整使用所有功能，包括多平台接入、AI 数据洞察、客户 RFM 分析等。试用结束后可选择升级到 Pro 方案（¥29/月）或 Free 方案。',
  },
  {
    q: '可以自己部署吗？',
    a: '可以。Nexora 提供 deploy.sh 一键部署脚本和 Docker Compose 配置，支持在任何 Linux 服务器上私有化部署。后端使用 SQLite（可切换 PostgreSQL），前端使用 Nginx 反向代理。',
  },
  {
    q: '如何处理多租户数据隔离？',
    a: '每个工作空间拥有独立的数据库 schema 和 API 密钥。OWNER/ADMIN/MEMBER/VIEWER 四级角色权限体系确保数据访问的精细控制。所有操作均有审计日志记录。',
  },
  {
    q: '支持暗色模式吗？如何切换？',
    a: '支持浅色/暗色/跟随系统三种模式。点击页面右上角的 ☀️/🌙 按钮即可切换，设置会持久化到本地存储。同时全站通过 WCAG 2.1 AA 无障碍标准。',
  },
];

const FAQItem: React.FC<{
  q: string;
  a: string;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ q, a, isOpen, onToggle }) => (
  <div className="border border-gray-200 rounded-xl overflow-hidden transition-all duration-300 hover:border-gray-300 bg-white">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-gray-50/80 transition-colors duration-200"
    >
      <span className="text-base font-semibold text-slate-900 pr-4">{q}</span>
      <div
        className={`flex-shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
      >
        <ChevronDown size={20} className="text-gray-400" />
      </div>
    </button>
    <div
      className={`overflow-hidden transition-all duration-300 ease-in-out ${
        isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
      }`}
    >
      <div className="px-6 pb-5 text-sm text-gray-600 leading-relaxed">{a}</div>
    </div>
  </div>
);

/* ─── Floating Dashboard Card ─── */
const DashboardCard: React.FC = () => (
  <div
    className="relative w-full max-w-[420px] animate-float rounded-2xl bg-white/90 backdrop-blur-xl border border-white/40 shadow-2xl shadow-slate-900/10 p-5"
    style={{ animation: 'float 6s ease-in-out infinite' }}
  >
    {/* Browser chrome */}
    <div className="flex items-center gap-1.5 mb-4">
      <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
      <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
      <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
      <span className="ml-2 text-[10px] text-gray-300 font-mono">dashboard.nexora.io</span>
    </div>
    {/* Stats grid */}
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl bg-gradient-to-br from-violet-50 to-indigo-50 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Package size={14} className="text-violet-500" />
          <span className="text-[10px] font-medium text-gray-400">总订单</span>
        </div>
        <div className="text-xl font-bold text-slate-800">74</div>
        <div className="text-[10px] text-emerald-500 mt-0.5">↑ 12.5%</div>
      </div>
      <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <CreditCard size={14} className="text-emerald-500" />
          <span className="text-[10px] font-medium text-gray-400">营收</span>
        </div>
        <div className="text-xl font-bold text-slate-800">¥4,657</div>
        <div className="text-[10px] text-emerald-500 mt-0.5">↑ 8.3%</div>
      </div>
      <div className="rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Users size={14} className="text-amber-500" />
          <span className="text-[10px] font-medium text-gray-400">客户</span>
        </div>
        <div className="text-xl font-bold text-slate-800">100</div>
        <div className="text-[10px] text-emerald-500 mt-0.5">↑ 5.2%</div>
      </div>
      <div className="rounded-xl bg-gradient-to-br from-cyan-50 to-blue-50 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Key size={14} className="text-cyan-500" />
          <span className="text-[10px] font-medium text-gray-400">商品</span>
        </div>
        <div className="text-xl font-bold text-slate-800">50</div>
        <div className="text-[10px] text-emerald-500 mt-0.5">↑ 3.7%</div>
      </div>
    </div>
    {/* Mini chart bar */}
    <div className="mt-4 rounded-xl bg-gray-50 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-gray-400">
          本周趋势
        </span>
        <span className="text-[10px] font-medium text-emerald-500">+18%</span>
      </div>
      <div className="flex items-end gap-1 h-10">
        {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-gradient-to-t from-violet-400 to-indigo-400 opacity-80 hover:opacity-100 transition-opacity"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  </div>
);

/* ─── Main ─── */
export const Landing: React.FC = () => {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [isYearly, setIsYearly] = useState(false);

  const scrollToPricing = () => {
    const el = document.getElementById('pricing');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden">
      {/* ============ CSS animations ============ */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-14px); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.4); }
          50% { box-shadow: 0 0 0 12px rgba(99,102,241,0); }
        }
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }
        .animate-gradient-shift { animation: gradient-shift 4s ease infinite; background-size: 200% 200%; }
      `}</style>

      {/* ============ Navbar ============ */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-xl border-b border-gray-100/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
                <Sparkles size={18} className="text-white" />
              </div>
              <span className="text-xl font-bold text-slate-900">Nexora</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a
                href="#features"
                className="text-sm font-medium text-gray-500 hover:text-slate-900 transition-colors duration-200"
              >
                功能特性
              </a>
              <a
                href="#pricing"
                className="text-sm font-medium text-gray-500 hover:text-slate-900 transition-colors duration-200"
              >
                定价方案
              </a>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/login">
                <Button variant="outline" size="sm">
                  登录
                </Button>
              </Link>
              <Link to="/register">
                <Button variant="primary" size="sm">
                  免费注册
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ============ Hero — split screen ============ */}
      <section className="relative pt-28 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Abstract decorative shapes */}
        <div className="absolute top-10 right-[10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-violet-200/30 to-indigo-200/20 blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 right-[20%] w-72 h-72 rounded-full bg-gradient-to-tr from-cyan-300/20 to-blue-300/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 left-[5%] w-96 h-96 rounded-full bg-gradient-to-tr from-rose-200/20 to-pink-200/10 blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left */}
            <div>
              <Reveal>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-50 border border-violet-100 text-violet-700 text-sm font-medium mb-8">
                  <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse-glow" />
                  v2.0 现已发布
                </div>
              </Reveal>
              <Reveal delay={150}>
                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-slate-900 tracking-tight leading-[1.05]">
                  构建您的 SaaS
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 animate-gradient-shift">
                    前所未有的快
                  </span>
                </h1>
              </Reveal>
              <Reveal delay={300}>
                <p className="mt-6 text-lg text-gray-500 max-w-lg leading-relaxed">
                  Nexora 为您提供启动多租户 SaaS 平台所需的一切。工作空间管理、团队协作、订阅计费和 API 密钥 —— 一站搞定。
                </p>
              </Reveal>
              <Reveal delay={450}>
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <Link to="/register">
                    <Button
                      variant="primary"
                      size="lg"
                      rightIcon={<ArrowRight size={18} />}
                      className="shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 hover:scale-105"
                    >
                      免费开始使用
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={scrollToPricing}
                    className="hover:scale-105"
                  >
                    查看演示
                  </Button>
                </div>
              </Reveal>
              <Reveal delay={600}>
                <p className="mt-5 text-sm text-gray-400">
                  无需信用卡 · 14 天免费试用
                </p>
              </Reveal>
            </div>

            {/* Right — floating dashboard */}
            <div className="relative flex justify-center lg:justify-end">
              {/* Decorative circles behind */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] rounded-full bg-gradient-to-br from-violet-400/10 to-indigo-500/10 blur-2xl" />
              <div className="absolute top-1/3 right-0 w-48 h-48 rounded-full bg-gradient-to-tr from-cyan-300/15 to-blue-400/10 blur-2xl" />
              <DashboardCard />
            </div>
          </div>
        </div>
      </section>

      {/* ============ Stats strip ============ */}
      <section className="py-14 bg-gradient-to-r from-slate-50 via-violet-50/30 to-slate-50 border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: 74, suffix: '', label: '总订单' },
              { value: 4657, suffix: '', label: '营收 (¥)', prefix: '¥' },
              { value: 100, suffix: '', label: '客户数' },
              { value: 50, suffix: '', label: '商品数' },
            ].map((stat) => (
              <Reveal key={stat.label} delay={100}>
                <div className="text-center group cursor-default">
                  <div className="text-3xl sm:text-4xl font-bold text-slate-900 group-hover:text-violet-600 transition-colors duration-300">
                    {stat.prefix}
                    <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                  </div>
                  <div className="mt-1.5 text-sm text-gray-400 font-medium">
                    {stat.label}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ Wavy divider ============ */}
      <div className="text-violet-50">
        <WavyDivider />
      </div>

      {/* ============ Features — Bento Grid ============ */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 bg-violet-50/40">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
                扩展所需的一切功能
              </h2>
              <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
                强大的功能，旨在帮助您轻松构建和管理多租户 SaaS 平台。
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 auto-rows-[minmax(180px,auto)]">
            {bentoFeatures.map((feature, idx) => (
              <Reveal key={feature.title} delay={idx * 100}>
                <div
                  className={`group relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white p-6 hover:scale-[1.02] hover:shadow-xl hover:shadow-violet-500/5 hover:border-violet-200/50 transition-all duration-500 cursor-default ${feature.colSpan || ''}`}
                >
                  {/* Gradient bg on hover */}
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                  />
                  <div className="relative z-10">
                    <div
                      className={`w-11 h-11 rounded-xl ${feature.iconBg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
                    >
                      <feature.icon size={22} />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-gray-500 leading-relaxed">
                      {feature.desc}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ Wavy divider flip ============ */}
      <div className="text-violet-50/40">
        <WavyDivider flip />
      </div>

      {/* ============ Dashboard Preview ============ */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
                一目了然的数据面板
              </h2>
              <p className="mt-4 text-lg text-gray-500">
                实时数据仪表盘，关键指标尽在掌握
              </p>
            </div>
          </Reveal>

          <Reveal delay={200}>
            {/* Browser frame mockup */}
            <div className="relative rounded-2xl overflow-hidden border border-gray-200 shadow-2xl shadow-slate-900/5">
              {/* Title bar */}
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                </div>
                <div className="flex-1 mx-4">
                  <div className="max-w-xs h-6 rounded-md bg-gray-200/70 flex items-center justify-center text-[10px] text-gray-400 font-mono">
                    app.nexora.io/dashboard
                  </div>
                </div>
              </div>
              {/* Dashboard preview area */}
              <div className="aspect-[21/9] bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50 p-6 sm:p-10 flex flex-col items-center justify-center">
                <div className="text-center">
                  <BarChart3 size={48} className="text-violet-300 mx-auto mb-4" />
                  <p className="text-lg font-semibold text-slate-400 mb-2">
                    Dashboard Preview
                  </p>
                  <p className="text-sm text-gray-300 max-w-md">
                    注册后即可访问完整的分析面板，包含实时订单追踪、营收趋势和客户洞察。
                  </p>
                </div>
                {/* Mini cards grid for preview */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 w-full max-w-2xl">
                  {[
                    { label: '今日订单', value: '12', color: 'text-violet-600' },
                    { label: '活跃客户', value: '38', color: 'text-emerald-600' },
                    { label: '转化率', value: '4.2%', color: 'text-amber-600' },
                    { label: '处理中', value: '3', color: 'text-rose-600' },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className="rounded-xl bg-white/80 border border-gray-100 p-3 text-center hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
                    >
                      <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>

          {/* Partner / Tech strip */}
          <Reveal delay={400}>
            <div className="mt-16 text-center">
              <p className="text-xs text-gray-300 uppercase tracking-widest mb-5">
                技术生态
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
                {[
                  'FastAPI',
                  'React 18',
                  'TypeScript',
                  'SQLAlchemy',
                  'ECharts',
                  'Tailwind CSS',
                  'Vite',
                  'Docker',
                  'Stripe',
                  'Shopify',
                ].map((t) => (
                  <span
                    key={t}
                    className="text-sm font-medium text-gray-300 hover:text-violet-500 transition-colors cursor-default select-none"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ Wavy divider ============ */}
      <div className="text-gray-50">
        <WavyDivider />
      </div>

      {/* ============ AI Highlight ============ */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-primary-600 via-purple-600 to-primary-700 text-white">
        <div className="max-w-5xl mx-auto text-center">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-sm font-medium mb-6">
              <Sparkles size={16} className="text-amber-300" />
              千问 AI 驱动
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold">通义千问 · 真正的 AI 电商智能</h2>
            <p className="mt-4 text-lg text-white/80 max-w-3xl mx-auto">
              Nexora 集成了阿里云通义千问（Qwen）大模型，对您的订单数据、客户行为和商品表现进行深度分析 — 不是规则模板，是真正的 AI 推理。
            </p>
            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
              {[
                { icon: '🧠', title: '深度数据分析', desc: '千问读取全部订单、客户和商品数据，识别人工难以发现的趋势与异常。' },
                { icon: '📈', title: '智能营收预测', desc: '基于历史销售曲线 + 季节性因素，生成未来 7 天营收预测及置信区间。' },
                { icon: '💡', title: '可执行建议', desc: '不仅是"提升销量"，而是"优先处理 pending 订单、分析抖音取消原因"等具体行动项。' },
              ].map((item, i) => (
                <div key={i} className="bg-white/10 backdrop-blur rounded-xl p-6 border border-white/20 hover:bg-white/15 transition-colors">
                  <div className="text-3xl mb-3">{item.icon}</div>
                  <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                  <p className="text-sm text-white/70">{item.desc}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <div className="text-gray-50">
        <WavyDivider flip />
      </div>

      {/* ============ Pricing ============ */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
                简单透明的定价
              </h2>
              <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
                选择适合您需求的方案。随时升级或降级。
              </p>
            </div>
          </Reveal>

          {/* Toggle */}
          <Reveal delay={100}>
            <div className="flex items-center justify-center gap-1.5 mb-12">
              <button
                onClick={() => setIsYearly(false)}
                className={`px-5 py-2 rounded-l-xl text-sm font-medium transition-all duration-300 ${
                  !isYearly
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20'
                    : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                月付
              </button>
              <button
                onClick={() => setIsYearly(true)}
                className={`px-5 py-2 rounded-r-xl text-sm font-medium transition-all duration-300 flex items-center gap-1.5 ${
                  isYearly
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20'
                    : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                年付
                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">
                  省17%
                </span>
              </button>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto items-start">
            {pricingPlans.map((plan, idx) => (
              <Reveal key={plan.name} delay={idx * 150}>
                <div
                  className={`relative rounded-2xl p-8 transition-all duration-500 bg-white ${
                    plan.popular
                      ? 'border-2 border-violet-200 shadow-2xl shadow-violet-500/10 scale-[1.03] z-10 hover:scale-[1.06]'
                      : 'border border-gray-200 shadow-sm hover:shadow-xl hover:-translate-y-1'
                  }`}
                >
                  {plan.popular && (
                    <>
                      <div className="absolute -top-0.5 -left-0.5 -right-0.5 -bottom-0.5 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 -z-10 blur-sm" />
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="px-3.5 py-1 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-semibold shadow-lg shadow-violet-500/30">
                          推荐
                        </span>
                      </div>
                    </>
                  )}
                  {/* Tier badge */}
                  <div className="mb-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        plan.tier === 'free'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : plan.tier === 'pro'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {plan.tier === 'free' ? '基础版' : plan.tier === 'pro' ? '专业版' : '企业版'}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
                  <div className="mt-4 flex items-baseline">
                    <span className="text-4xl font-bold text-slate-900">
                      {plan.name === 'Free'
                        ? '¥0'
                        : isYearly
                          ? `¥${plan.name === 'Pro' ? '24' : '83'}`
                          : plan.price}
                    </span>
                    <span className="ml-1.5 text-sm text-gray-400">
                      /{plan.name === 'Free' ? plan.period : '月'}
                    </span>
                  </div>
                  {isYearly && plan.name !== 'Free' && (
                    <p className="text-xs text-gray-400 mt-1">
                      每年 ¥{plan.name === 'Pro' ? '289' : '986'}
                    </p>
                  )}
                  <p className="mt-2 text-sm text-gray-500">{plan.description}</p>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check size={16} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-600">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8">
                    <Link to="/register">
                      <Button
                        variant={plan.popular ? 'primary' : 'outline'}
                        className={`w-full transition-all duration-300 ${
                          plan.popular
                            ? 'shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 hover:scale-105'
                            : 'hover:scale-105'
                        }`}
                      >
                        {plan.cta}
                      </Button>
                    </Link>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ CTA with wavy divider ============ */}
      <div className="text-gray-50">
        <WavyDivider flip />
      </div>

      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-violet-600 via-indigo-700 to-cyan-700 relative overflow-hidden">
        {/* Decorative shapes */}
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-white/5 translate-y-1/2 -translate-x-1/4" />
        <div className="absolute top-1/3 left-1/4 w-64 h-64 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="max-w-6xl mx-auto relative">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <Reveal>
              <div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight">
                  准备好构建您的
                  <br />
                  SaaS 了吗？
                </h2>
                <p className="mt-4 text-lg text-violet-100 max-w-md">
                  今天就开始构建您的多租户平台。14 天免费试用，无需信用卡。
                </p>
              </div>
            </Reveal>
            <Reveal delay={200}>
              <div className="flex flex-col sm:flex-row items-start lg:justify-end gap-4">
                <Link to="/register">
                  <Button
                    variant="primary"
                    size="lg"
                    className="bg-white text-violet-600 hover:bg-violet-50 hover:scale-105 transition-all duration-300 shadow-xl shadow-black/10"
                    rightIcon={<ArrowRight size={18} />}
                  >
                    开始免费试用
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="lg"
                  className="border-white/30 text-white hover:bg-white/10 hover:scale-105 transition-all duration-300"
                  onClick={scrollToPricing}
                >
                  预约演示
                </Button>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section id="faq" className="py-24 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-3xl mx-auto">
          <Reveal>
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
                常见问题
              </h2>
              <p className="mt-4 text-lg text-gray-500">
                关于 Nexora 的常见疑问解答
              </p>
            </div>
          </Reveal>
          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <Reveal key={idx} delay={idx * 80}>
                <FAQItem
                  q={faq.q}
                  a={faq.a}
                  isOpen={openFaqIndex === idx}
                  onToggle={() => setOpenFaqIndex(openFaqIndex === idx ? null : idx)}
                />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ Footer ============ */}
      <footer className="bg-slate-900 text-gray-400 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-5 gap-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
                  <Sparkles size={18} className="text-white" />
                </div>
                <span className="text-xl font-bold text-white">Nexora</span>
              </div>
              <p className="text-sm max-w-sm">
                构建和扩展多租户 SaaS 应用的完整平台。工作空间管理、团队协作等等。
              </p>
              <div className="flex items-center gap-4 mt-6">
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                  aria-label="GitHub"
                >
                  <Github size={20} />
                </a>
                <a
                  href="https://twitter.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                  aria-label="Twitter"
                >
                  <Twitter size={20} />
                </a>
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                  aria-label="LinkedIn"
                >
                  <Linkedin size={20} />
                </a>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">产品</h4>
              <ul className="space-y-2.5">
                <li>
                  <a href="#features" className="text-sm hover:text-white transition-colors">
                    功能特性
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="text-sm hover:text-white transition-colors">
                    定价方案
                  </a>
                </li>
                <li>
                  <Link to="/changelog" className="text-sm hover:text-white transition-colors">
                    更新日志
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">资源</h4>
              <ul className="space-y-2.5">
                <li>
                  <Link to="/status" className="text-sm hover:text-white transition-colors">
                    系统状态
                  </Link>
                </li>
                <li>
                  <Link to="/changelog" className="text-sm hover:text-white transition-colors">
                    更新日志
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="text-sm hover:text-white transition-colors">
                    隐私政策
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">公司</h4>
              <ul className="space-y-2.5">
                <li>
                  <button
                    onClick={() =>
                      alert(
                        'Nexora 研发历程\n\n' +
                          '▸ 2026.06 — 项目立项，完成全栈架构设计\n' +
                          '▸ 2026.06 — 多租户 + 商品/订单/客户 CRUD 上线\n' +
                          '▸ 2026.07 — 6 平台接入 + JWT 双认证 + Fernet 加密\n' +
                          '▸ 2026.07 — 28 项集成测试 + 路由重构 (60% 瘦身)\n' +
                          '▸ 2026.07 — AI 洞察 + 暗色模式 + Glass UI + WCAG AA\n' +
                          '▸ 2026.07 — 参赛版本发布，一键 deploy.sh 部署\n' +
                          '\n技术栈: FastAPI + React 18 + TypeScript + ECharts + Tailwind\n' +
                          '测试: 28 项 pytest-asyncio | 147 源文件 | 15 数据模型',
                      )
                    }
                    className="text-sm hover:text-white transition-colors text-left cursor-pointer"
                  >
                    关于我们
                  </button>
                </li>
                <li>
                  <a href="#" className="text-sm hover:text-white transition-colors">
                    博客
                  </a>
                </li>
                <li>
                  <a href="#" className="text-sm hover:text-white transition-colors">
                    招聘
                  </a>
                </li>
                <li>
                  <button
                    onClick={() => alert('联系人：李浩棋\n手机号：13656117061')}
                    className="text-sm hover:text-white transition-colors text-left cursor-pointer"
                  >
                    联系我们
                  </button>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between">
            <p className="text-sm">
              {new Date().getFullYear()} Nexora. 保留所有权利。
            </p>
            <div className="flex items-center gap-6 mt-4 sm:mt-0">
              <Link to="/privacy" className="text-sm hover:text-white transition-colors">
                隐私政策
              </Link>
              <Link to="/terms" className="text-sm hover:text-white transition-colors">
                服务条款
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
