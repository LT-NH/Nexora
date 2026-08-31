import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  CreditCard,
  Key,
  Users,
  Check,
  ArrowRight,
  ChevronDown,
  Zap,
  Package,
  TrendingUp,
  Sparkles,
  Menu,
  X,
  Eye,
  Lock,
  Brain,
  LineChart,
  Lightbulb,
  Rocket,
  Layers,
  RefreshCw,
  CheckCircle2,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TransitionLink } from '@/components/ui/TransitionLink';
import { CountUp } from '@/components/ui/CountUp';
import { useReveal, shouldSkipReveal } from '@/hooks/useReveal';
import { useTilt } from '@/hooks/useTilt';

/* ─── Reveal wrapper ─── */
const Reveal: React.FC<{ children: React.ReactNode; className?: string; delay?: number }> = ({
  children,
  className = '',
  delay = 0,
}) => {
  // reduced-motion / 无 IntersectionObserver 时直接可见，内容永不缺失
  const [visible, setVisible] = useState(shouldSkipReveal);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (visible) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setVisible(true);
      },
      { threshold: 0.15 },
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [visible]);
  if (shouldSkipReveal()) {
    return <div className={className}>{children}</div>;
  }
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
      style={{
        transitionDelay: `${delay}ms`,
        transitionTimingFunction: 'cubic-bezier(0.25,0.1,0.25,1)',
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

const bentoFeatures = [
  {
    icon: Zap,
    title: '多平台自动同步',
    desc: 'Shopify、抖音、淘宝——添加 API Key 即接入，订单实时同步入仓。',
    accent: 'from-violet-500 to-purple-500',
    shadow: 'shadow-violet-500/25',
  },
  {
    icon: TrendingUp,
    title: '千问 AI 深度分析',
    desc: '7天营收预测、库存风险预警、客户流失早期信号——交给 AI。',
    accent: 'from-purple-500 to-fuchsia-500',
    shadow: 'shadow-purple-500/25',
  },
  {
    icon: Users,
    title: '客户智能分层',
    desc: 'RFM 模型自动将客户分为高价值/一般/待激活，精准营销不浪费预算。',
    accent: 'from-fuchsia-500 to-pink-500',
    shadow: 'shadow-fuchsia-500/25',
  },
  {
    icon: Shield,
    title: '企业级安全',
    desc: 'JWT 双 Token + Fernet AES-128 加密 + 5 层纵深防御，API Key 零泄漏。',
    accent: 'from-slate-600 to-slate-700',
    shadow: 'shadow-slate-500/25',
  },
];

/* ─── Marketing stats ───
   NOTE: 这些是 Landing 页面展示用的示例数据，并非实时统计。如需接入真实指标，
   请替换为后端 /api/v1/stats 公开指标接口的返回值。 */
const marketingStats = [
  { value: 1200, decimals: 0, prefix: '', suffix: '+', label: '活跃商家', sub: '来自 15 个国家' },
  { value: 8.2, decimals: 1, prefix: '¥', suffix: 'M+', label: '月交易额', sub: '同比增长 34%' },
  { value: 5, decimals: 0, prefix: '', suffix: '+', label: '电商平台', sub: 'Shopify·抖音·淘宝·京东·Amazon' },
  { value: 99.7, decimals: 1, prefix: '', suffix: '%', label: '同步准确率', sub: '30 天滚动统计' },
];

/** 进入视口才开始滚动的数字（配合 Reveal 时间轴） */
const ViewCountUp: React.FC<{
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}> = ({ value, decimals = 0, prefix = '', suffix = '' }) => {
  const { ref, visible } = useReveal(0.4);
  return (
    <span ref={ref} className="tabular-nums">
      {visible ? (
        <CountUp value={value} decimals={decimals} prefix={prefix} suffix={suffix} duration={1500} />
      ) : (
        <>
          {prefix}0{suffix}
        </>
      )}
    </span>
  );
};

/* ─── 平台标识（品牌色首字徽章 + 字标，用于信任条 marquee） ─── */
const PLATFORMS = [
  { name: 'Shopify', mark: 'S', hue: 'from-emerald-400 to-emerald-500' },
  { name: '抖音', mark: '抖', hue: 'from-slate-700 to-gray-900' },
  { name: '淘宝', mark: '淘', hue: 'from-orange-400 to-orange-500' },
  { name: '拼多多', mark: '拼', hue: 'from-red-400 to-rose-500' },
  { name: '京东', mark: '京', hue: 'from-red-500 to-red-600' },
  { name: 'Amazon', mark: 'A', hue: 'from-amber-400 to-orange-500' },
];

/** 无缝滚动 logo 条：内容渲染两遍，CSS 平移 -50% 实现循环 */
const PlatformMarquee: React.FC = () => (
  <div className="marquee-mask relative overflow-hidden" aria-label="支持的平台">
    <div className="flex w-max animate-marquee items-center gap-x-14 gap-y-4 pr-14">
      {[...PLATFORMS, ...PLATFORMS].map((p, i) => (
        <span
          key={`${p.name}-${i}`}
          aria-hidden={i >= PLATFORMS.length}
          className="inline-flex items-center gap-2.5 select-none"
        >
          <span
            className={`w-6 h-6 rounded-md bg-gradient-to-br ${p.hue} text-white text-[11px] font-bold flex items-center justify-center shadow-sm`}
          >
            {p.mark}
          </span>
          <span className="text-sm font-semibold text-[#8e8e93] tracking-wide">{p.name}</span>
        </span>
      ))}
    </div>
  </div>
);

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
    a: '支持浅色/暗色/跟随系统三种模式。登录后点击页面右上角的主题切换按钮即可切换，设置会持久化到本地存储。同时全站通过 WCAG 2.1 AA 无障碍标准。',
  },
];

const FAQItem: React.FC<{
  q: string;
  a: string;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ q, a, isOpen, onToggle }) => (
  <div className="glass-card overflow-hidden transition-all duration-300 hover:shadow-md">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-[#F5F5F7]/80 transition-colors duration-200"
    >
      <span className="text-base font-semibold text-[#1d1d1f] pr-4">{q}</span>
      <div
        className={`flex-shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
      >
        <ChevronDown size={20} className="text-[#8e8e93]" />
      </div>
    </button>
    <div
      className={`grid transition-all duration-300 ease-in-out ${
        isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="overflow-hidden">
        <div className="px-6 pb-5 text-sm text-[#515154] leading-relaxed">{a}</div>
      </div>
    </div>
  </div>
);

/* ─── Narrative step data ─── */
const GRAD = 'whitespace-nowrap text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-fuchsia-500';
const narrativeSteps = [
  {
    num: '01',
    title: (
      <>
        连接你的<span className={GRAD}>电商平台</span>
      </>
    ),
    desc: 'Shopify、抖音、淘宝——填入 API Key，28 秒完成接入。我们负责实时同步，你负责看数据。',
    stat: '28 秒',
    statLabel: '完成接入',
    icon: Zap,
  },
  {
    num: '02',
    title: (
      <>
        数据自动汇聚，<span className={GRAD}>AI 开始工作</span>
      </>
    ),
    desc: '订单、库存、客户画像自动落库。千问大模型读取你的全部数据，生成趋势、预警、建议。不是报表，是可执行的行动项。',
    stat: '5+',
    statLabel: '支持平台',
    icon: TrendingUp,
  },
  {
    num: '03',
    title: (
      <>
        看到别人<span className={GRAD}>看不到的</span>
      </>
    ),
    desc: 'AI 告诉你哪个渠道退货率异常、哪个商品下周该补货、哪些客户即将流失。数据就在那里，只是以前没人帮你看。',
    stat: '99%',
    statLabel: '分析准确率',
    icon: Eye,
  },
  {
    num: '04',
    title: (
      <>
        AI 建议，<span className={GRAD}>一键执行</span>
      </>
    ),
    desc: '清仓降价、唤醒优惠券——点一下"执行"，改动真实写回你的 Shopify 店铺。不是纸上谈兵，是立刻发生。',
    stat: '1 键',
    statLabel: '真实回写',
    icon: Rocket,
  },
  {
    num: '05',
    title: (
      <>
        多店铺，<span className={GRAD}>一屏全景</span>
      </>
    ),
    desc: '每家店铺独立接入、独立同步，订单与营收自动合并统计、绝不重复计算，每笔订单的平台来源一目了然。',
    stat: '6+',
    statLabel: '平台支持',
    icon: Layers,
  },
  {
    num: '06',
    title: (
      <>
        自动同步，<span className={GRAD}>数据常新</span>
      </>
    ),
    desc: '增量拉取 + 实时 Webhook 双通道，按你设定的频率自动更新店铺数据；同步失败会明明白白告诉你原因。',
    stat: '15 分钟',
    statLabel: '最低同步间隔',
    icon: RefreshCw,
  },
];

/* ─── 叙事步骤迷你界面插图（纯 CSS/SVG，延续 hero console 的设计语言） ─── */
const MiniConnectCard: React.FC = () => (
  <div className="w-full max-w-sm mx-auto glass-card rounded-3xl p-6 shadow-xl shadow-violet-500/10">
    <div className="flex items-center gap-2.5 mb-5">
      <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center text-sm font-bold">S</span>
      <span className="text-sm font-semibold text-[#1d1d1f]">连接 Shopify</span>
      <span className="ml-auto text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 font-medium border border-emerald-100">已连接</span>
    </div>
    <div className="rounded-xl bg-[#F5F5F7]/90 px-4 py-3 mb-4">
      <div className="text-xs text-[#8e8e93] mb-1">Admin API Access Token</div>
      <div className="flex items-center gap-2">
        <Lock size={12} className="text-[#8e8e93]" />
        <span className="text-[13px] font-mono text-[#6e6e73] tracking-tight">shpat_••••••••••••e1dc</span>
      </div>
    </div>
    <div className="h-11 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-violet-500/25">
      <Zap size={14} /> 一键接入 · 28 秒
    </div>
  </div>
);

const MiniSyncFlow: React.FC = () => (
  <div className="w-full max-w-sm mx-auto glass-card rounded-3xl p-6 shadow-xl shadow-violet-500/10">
    <div className="text-xs font-semibold tracking-[0.2em] text-[#8e8e93] uppercase mb-4">Live Sync</div>
    <div className="space-y-3.5">
      {[
        { n: 'Shopify', w: '82%', c: 'from-emerald-400 to-emerald-500' },
        { n: '抖音', w: '64%', c: 'from-slate-600 to-gray-800' },
        { n: '淘宝', w: '48%', c: 'from-orange-400 to-orange-500' },
      ].map((r, i) => (
        <div key={r.n} className="flex items-center gap-3">
          <span className="text-[13px] font-medium text-[#515154] w-14 text-right">{r.n}</span>
          <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className={`bar-grow h-full rounded-full bg-gradient-to-r ${r.c}`} style={{ width: r.w, animationDelay: `${0.3 + i * 0.2}s` }} />
          </div>
        </div>
      ))}
    </div>
    <div className="mt-5 flex items-center justify-between rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-3 text-white shadow-lg shadow-violet-500/25">
      <span className="inline-flex items-center gap-2 text-[13px] font-semibold"><Sparkles size={14} /> 千问 AI 分析中</span>
      <span className="w-1.5 h-1.5 rounded-full bg-white soft-pulse" />
    </div>
  </div>
);

const MiniInsightCard: React.FC = () => (
  <div className="w-full max-w-sm mx-auto space-y-4">
    <div className="glass-card rounded-2xl p-5 shadow-xl shadow-violet-500/10 float-y" style={{ animationDelay: '0.4s' }}>
      <div className="flex items-start gap-3.5">
        <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center flex-shrink-0"><TrendingUp size={17} /></span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#1d1d1f]">未来 7 天营收预测</div>
          <div className="text-xl font-bold text-[#1d1d1f] tabular-nums mt-1">¥1.2M <span className="text-xs font-semibold text-emerald-500">+18.2%</span></div>
        </div>
      </div>
    </div>
    <div className="glass-card rounded-2xl p-5 shadow-xl shadow-fuchsia-500/10 float-y -translate-x-4" style={{ animationDelay: '1.1s' }}>
      <div className="flex items-start gap-3.5">
        <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center flex-shrink-0"><Package size={17} /></span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#1d1d1f]">库存风险预警</div>
          <div className="text-[13px] text-[#515154] mt-1">3 个商品预计 5 天内售罄，建议今日补货</div>
        </div>
      </div>
    </div>
  </div>
);

const MiniExecuteCard: React.FC = () => (
  <div className="w-full max-w-sm mx-auto space-y-4">
    <div className="glass-card rounded-2xl p-5 shadow-xl shadow-violet-500/10">
      <div className="flex items-center gap-3.5">
        <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center flex-shrink-0"><Rocket size={17} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[#1d1d1f]">库存积压 → 一键清仓</div>
          <div className="text-[13px] text-[#515154] mt-0.5">降价 15%：¥399 → <span className="font-bold text-emerald-600">¥339.15</span></div>
        </div>
        <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
      </div>
      <div className="mt-3 text-[11px] font-medium text-violet-600 bg-violet-50 rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1">
        <Sparkles size={11} /> 已同步 Shopify 全部变体
      </div>
    </div>
    <div className="glass-card rounded-2xl p-5 shadow-xl shadow-fuchsia-500/10 float-y -translate-x-4" style={{ animationDelay: '1.1s' }}>
      <div className="flex items-center gap-3.5">
        <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center flex-shrink-0"><Tag size={17} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[#1d1d1f]">唤醒券 WAKE-2026 已创建</div>
          <div className="text-[13px] text-[#515154] mt-0.5">满 99 减 20 · 14 天有效</div>
        </div>
        <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
      </div>
    </div>
  </div>
);

const MiniStoresCard: React.FC = () => (
  <div className="w-full max-w-sm mx-auto glass-card rounded-3xl p-6 shadow-xl shadow-violet-500/10">
    <div className="text-xs font-semibold tracking-[0.2em] text-[#8e8e93] uppercase mb-4">All Stores</div>
    <div className="space-y-3">
      {[
        { n: 'Nexora Store', p: 'Shopify', dot: 'bg-emerald-500', s: '已连接' },
        { n: '抖音旗舰店', p: '抖音', dot: 'bg-gray-700', s: '已连接' },
        { n: 'Sandbox Demo', p: '沙盒', dot: 'bg-violet-500', s: '演示中' },
      ].map((r) => (
        <div key={r.n} className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${r.dot} flex-shrink-0`} />
          <span className="text-[13px] font-medium text-[#1d1d1f] flex-1 truncate">{r.n}</span>
          <span className="text-[11px] text-[#8e8e93]">{r.p}</span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">{r.s}</span>
        </div>
      ))}
    </div>
    <div className="mt-5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-3 text-white shadow-lg shadow-violet-500/25 flex items-center justify-between">
      <span className="text-[12px] font-medium opacity-90">本月合并营收</span>
      <span className="text-lg font-bold tabular-nums">¥8.2M</span>
    </div>
  </div>
);

const MiniAutoSyncCard: React.FC = () => (
  <div className="w-full max-w-sm mx-auto glass-card rounded-3xl p-6 shadow-xl shadow-violet-500/10">
    <div className="flex items-center justify-between mb-4">
      <div className="text-xs font-semibold tracking-[0.2em] text-[#8e8e93] uppercase">Auto Sync</div>
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 soft-pulse" /> 每 15 分钟
      </span>
    </div>
    <div className="space-y-3">
      {[
        { t: '18:40', d: '订单同步 +5 · 退款同步 +1' },
        { t: '18:25', d: '商品同步 +2 · 库存更新' },
        { t: '18:10', d: '无变更，跳过（增量）' },
      ].map((r, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-[#8e8e93] w-10 flex-shrink-0">{r.t}</span>
          <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
          <span className="text-[13px] text-[#515154]">{r.d}</span>
        </div>
      ))}
    </div>
    <div className="mt-4 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
      <div className="text-[11px] text-[#8e8e93] mb-1">最近一次同步结果</div>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#1d1d1f]">同步成功</span>
        <span className="text-[11px] text-emerald-600 font-medium">0 错误</span>
      </div>
    </div>
  </div>
);

const NarrativeVisual: React.FC<{ index: number }> = ({ index }) => {
  const comps = [
    <MiniConnectCard key="c" />,
    <MiniSyncFlow key="s" />,
    <MiniInsightCard key="i" />,
    <MiniExecuteCard key="e" />,
    <MiniStoresCard key="m" />,
    <MiniAutoSyncCard key="a" />,
  ];
  return (
    <div className="relative flex items-center justify-center py-6">
      {/* backdrop ghost number */}
      <span
        aria-hidden
        className="absolute text-[130px] md:text-[170px] font-bold leading-none select-none pointer-events-none bg-gradient-to-b from-violet-300/90 via-fuchsia-300/50 to-transparent bg-clip-text text-transparent"
      >
        {narrativeSteps[index].num}
      </span>
      <div className="relative z-10 w-full flex justify-center">{comps[index]}</div>
    </div>
  );
};

/* ─── Narrative row (alternating) ─── */
const NarrativeRow: React.FC<{ item: (typeof narrativeSteps)[number]; index: number }> = ({
  item,
  index,
}) => {
  const { ref, visible, style } = useReveal(0.2);
  const reversed = index % 2 === 1;
  return (
    <div
      ref={ref}
      className="grid md:grid-cols-2 gap-12 md:gap-20 items-center"
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(48px)',
      }}
    >
      {/* Content */}
      <div className={reversed ? 'md:order-last' : ''}>
        <div className="flex items-center gap-3 mb-5">
          <span className="text-xs font-semibold tracking-[0.25em] text-violet-600">
            STEP {item.num}
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-violet-200 to-transparent max-w-[72px]" />
        </div>
        <h3 className="text-2xl md:text-4xl font-semibold text-[#1d1d1f] leading-tight tracking-tight">
          {item.title}
        </h3>
        <p className="mt-4 text-base sm:text-lg text-[#515154] leading-relaxed">{item.desc}</p>
        <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-50 border border-violet-100 text-violet-700 shadow-sm">
          <item.icon size={15} className="text-violet-500" />
          <span className="text-sm font-semibold tabular-nums">{item.stat}</span>
          <span className="text-xs text-violet-500/80">{item.statLabel}</span>
        </div>
      </div>

      {/* Mini UI illustration */}
      <div className={reversed ? 'md:order-first' : ''}>
        <NarrativeVisual index={index} />
      </div>
    </div>
  );
};

/* ─── 自动轮播分镜舞台：定时切换（离屏暂停），大字舞台卡片 ─── */
const STEP_MS = 4500;
const Storyboard: React.FC = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  const n = narrativeSteps.length;

  // 离开视口时暂停轮播，省电也不错过内容
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.25 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // 定时切换（悬停不打断）
  useEffect(() => {
    if (!inView) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % n), STEP_MS);
    return () => clearTimeout(t);
  }, [active, inView, n]);

  const copyStyle = (i: number): React.CSSProperties => ({
    opacity: i === active ? 1 : 0,
    transform: `translateY(${i === active ? 0 : i < active ? -56 : 56}px)`,
    filter: `blur(${i === active ? 0 : 5}px)`,
    transition: 'opacity 0.8s cubic-bezier(0.22,1,0.36,1), transform 0.8s cubic-bezier(0.22,1,0.36,1), filter 0.8s cubic-bezier(0.22,1,0.36,1)',
    pointerEvents: i === active ? 'auto' : 'none',
  });
  const visStyle = (i: number): React.CSSProperties => ({
    opacity: i === active ? 1 : 0,
    transform: i === active
      ? 'perspective(1400px) translateX(0) rotateY(0deg) scale(1)'
      : `perspective(1400px) translateX(${i < active ? -140 : 140}px) rotateY(${i < active ? -28 : 28}deg) scale(0.9)`,
    transition: 'opacity 0.85s cubic-bezier(0.22,1,0.36,1), transform 0.85s cubic-bezier(0.22,1,0.36,1)',
    pointerEvents: 'none',
  });
  const numStyle = (i: number): React.CSSProperties => ({
    opacity: i === active ? 0.95 : 0,
    transform: `translateY(${i === active ? 0 : i < active ? -170 : 170}px)`,
    transition: 'opacity 0.9s cubic-bezier(0.22,1,0.36,1), transform 0.9s cubic-bezier(0.22,1,0.36,1)',
  });

  const stepLabels = ['连接', '汇聚', '决策', '执行', '全景', '常新'];

  return (
    <div ref={sectionRef} className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div
        className="relative overflow-hidden rounded-[36px] sm:rounded-[44px] border border-violet-100/90 bg-white/75 backdrop-blur-xl shadow-2xl shadow-violet-500/10"
      >
        {/* 舞台背景：缓慢旋转的极光色轮 + 点阵 */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div
            className="absolute left-1/2 top-1/2 w-[1100px] h-[1100px] rounded-full opacity-[0.17] blur-[100px] aurora-spin-slow"
            style={{
              background: 'conic-gradient(from 0deg, #7c3aed, #a855f7, #d946ef, #f0abfc, #7c3aed)',
            }}
          />
          <div className="absolute inset-0 dot-grid opacity-60" />
        </div>

        <div className="relative z-10 grid md:grid-cols-2 gap-8 xl:gap-12 items-center px-6 sm:px-10 lg:px-16 pt-12 pb-24 md:pt-16 md:pb-24 lg:py-20 min-h-[600px] lg:min-h-[680px]">
          {/* 左：文案层 */}
          <div className="relative h-[300px] md:h-[360px] lg:h-[400px]">
            {narrativeSteps.map((item, i) => (
              <div key={item.num} style={copyStyle(i)} className="absolute inset-0 flex flex-col justify-center">
                <div className="flex items-center gap-3 mb-6">
                  <span className="text-sm font-bold tracking-[0.3em] text-violet-600">
                    STEP {item.num}
                  </span>
                  <span className="h-px w-20 bg-gradient-to-r from-violet-400 to-transparent" />
                </div>
                <h3 className="text-4xl md:text-5xl xl:text-6xl font-bold text-[#1d1d1f] leading-[1.12] tracking-tight">
                  {item.title}
                </h3>
                <p className="mt-6 text-lg md:text-xl xl:text-2xl text-[#515154] leading-relaxed max-w-xl">
                  {item.desc}
                </p>
                <div className="mt-8 inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-white border border-violet-200/80 text-violet-700 shadow-lg shadow-violet-500/10 self-start">
                  <item.icon size={20} className="text-violet-500" />
                  <span className="text-xl font-bold tabular-nums">{item.stat}</span>
                  <span className="text-base text-violet-500/90">{item.statLabel}</span>
                </div>
              </div>
            ))}
          </div>

          {/* 右：视觉层（3D 从右进左出）+ 幽灵数字 */}
          <div className="relative h-[340px] md:h-[420px] lg:h-[460px]">
            {narrativeSteps.map((item, i) => (
              <React.Fragment key={item.num}>
                <span
                  aria-hidden
                  className="absolute -top-2 -right-2 text-[130px] md:text-[170px] xl:text-[200px] leading-none font-bold select-none pointer-events-none bg-gradient-to-b from-violet-300/80 via-fuchsia-300/50 to-transparent bg-clip-text text-transparent"
                  style={numStyle(i)}
                >
                  {item.num}
                </span>
                <div
                  className="absolute inset-0 flex items-center justify-center will-change-transform"
                  style={visStyle(i)}
                >
                  <NarrativeVisual index={i} />
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* 底部步骤指示（可点击跳转） */}
        <div className="absolute bottom-7 left-1/2 -translate-x-1/2 z-20 flex items-center gap-8">
          {stepLabels.map((label, i) => (
            <button
              key={label}
              onClick={() => setActive(i)}
              className={`text-sm font-bold tracking-[0.25em] transition-colors duration-300 cursor-pointer ${
                i === active ? 'text-violet-600' : 'text-[#8e8e93] hover:text-violet-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ─── Animated "Nexora Console" dashboard mockup ─── */
const HeroConsole: React.FC = () => (
  <div className="relative float-y" style={{ animationDelay: '0.2s' }}>
    {/* Glow behind the window */}
    <div className="absolute -inset-8 rounded-[48px] bg-gradient-to-br from-violet-400/30 via-purple-400/20 to-fuchsia-400/30 blur-2xl pointer-events-none" />

    <div className="relative glass-card rounded-3xl shadow-2xl shadow-violet-500/10 overflow-hidden">
      {/* Browser chrome */}
      <div className="flex items-center gap-1.5 px-5 py-3.5 bg-[#F5F5F7]/90 border-b border-gray-100">
        <div className="w-3 h-3 rounded-full bg-red-400" />
        <div className="w-3 h-3 rounded-full bg-amber-400" />
        <div className="w-3 h-3 rounded-full bg-emerald-400" />
        <div className="ml-3 flex items-center gap-1.5 flex-1 min-w-0">
          <Lock size={10} className="text-[#8e8e93] flex-shrink-0" />
          <span className="text-[11px] text-[#8e8e93] font-mono tracking-tight truncate">
            Nexora Console · 千问 AI
          </span>
        </div>
        <span className="text-[10px] text-[#8e8e93] font-medium flex-shrink-0">实时同步中</span>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4 bg-gradient-to-b from-white/80 to-white/40">
        {/* Header + AI pill */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-[#1d1d1f]">营收总览</div>
            <div className="text-[10px] text-[#8e8e93] mt-0.5">近 7 日 · 全渠道</div>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white text-[11px] font-semibold shadow-lg shadow-violet-500/30">
            <Sparkles size={12} />
            千问 AI 分析就绪
            <span className="w-1.5 h-1.5 rounded-full bg-white soft-pulse" />
          </div>
        </div>

        {/* Stat chips */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-[#F5F5F7]/90 p-4">
            <div className="flex items-center gap-1.5">
              <Package size={12} className="text-violet-500" />
              <span className="text-[11px] font-medium text-[#6e6e73]">订单数</span>
            </div>
            <div className="mt-1.5 text-2xl font-bold text-[#1d1d1f] tabular-nums tracking-tight">
              12,847
            </div>
            <div className="mt-1 text-[11px] font-medium text-emerald-500">+12.5% vs 昨日</div>
          </div>
          <div className="rounded-2xl bg-[#F5F5F7]/90 p-4">
            <div className="flex items-center gap-1.5">
              <CreditCard size={12} className="text-fuchsia-500" />
              <span className="text-[11px] font-medium text-[#6e6e73]">营收</span>
            </div>
            <div className="mt-1.5 text-2xl font-bold text-[#1d1d1f] tabular-nums tracking-tight">
              ¥1.2M
            </div>
            <div className="mt-1 text-[11px] font-medium text-emerald-500">+8.3% vs 昨日</div>
          </div>
        </div>

        {/* Sparkline (SVG gradient stroke + draw-in) */}
        <div className="rounded-2xl bg-white/80 border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-[#6e6e73]">近 7 日营收趋势</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600">
              <TrendingUp size={12} /> +18.2%
            </span>
          </div>
          <svg viewBox="0 0 320 96" className="w-full h-24" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sparkStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#7c3aed" />
                <stop offset="100%" stopColor="#d946ef" />
              </linearGradient>
              <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,78 C24,74 40,58 56,62 C72,66 80,82 96,70 C112,58 128,40 144,46 C160,52 168,70 184,58 C200,46 216,22 232,27 C248,32 256,46 272,36 C288,26 304,16 320,18 L320,96 L0,96 Z"
              fill="url(#sparkFill)"
            />
            <path
              className="sparkline-path"
              d="M0,78 C24,74 40,58 56,62 C72,66 80,82 96,70 C112,58 128,40 144,46 C160,52 168,70 184,58 C200,46 216,22 232,27 C248,32 256,46 272,36 C288,26 304,16 320,18"
              fill="none"
              stroke="url(#sparkStroke)"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="320" cy="18" r="4" fill="#d946ef" />
            <circle cx="320" cy="18" r="9" fill="#d946ef" opacity="0.2" className="soft-pulse" />
          </svg>
        </div>

        {/* Platform distribution bars */}
        <div className="rounded-2xl bg-white/80 border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-medium text-[#6e6e73]">平台来源分布</span>
            <span className="text-[10px] text-[#8e8e93]">4 个渠道已连接</span>
          </div>
          <div className="space-y-2.5">
            {[
              { name: 'Shopify', pct: 45, bar: 'from-violet-500 to-violet-400', text: 'text-violet-600' },
              { name: '抖音', pct: 28, bar: 'from-purple-500 to-purple-400', text: 'text-purple-600' },
              { name: '淘宝', pct: 17, bar: 'from-fuchsia-500 to-fuchsia-400', text: 'text-fuchsia-600' },
              { name: 'Amazon', pct: 10, bar: 'from-slate-400 to-slate-300', text: 'text-slate-500' },
            ].map((p, i) => (
              <div key={p.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-[#1d1d1f]">{p.name}</span>
                  <span className={`text-[11px] font-semibold tabular-nums ${p.text}`}>{p.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`bar-grow h-full rounded-full bg-gradient-to-r ${p.bar}`}
                    style={{ width: `${p.pct}%`, animationDelay: `${0.6 + i * 0.15}s` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI insight footer */}
        <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-3 text-white shadow-lg shadow-violet-500/25">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles size={14} className="flex-shrink-0" />
            <span className="text-xs font-medium truncate">AI 洞察：抖音渠道转化率 ↑18%</span>
          </div>
          <ArrowRight size={14} className="opacity-80 flex-shrink-0" />
        </div>
      </div>
    </div>

    {/* Floating AI card —— 左缘完全对齐大卡片 + 垂直横跨大卡底缘（嵌入感） */}
    <div
      className="hidden sm:flex items-center gap-3 glass-card rounded-2xl px-4 py-3 shadow-xl shadow-violet-500/10"
      style={{
        position: 'absolute',
        top: '100%',
        left: '0',
        transform: 'translateY(-50%)',
        animation: 'floatY 8s ease-in-out 1.5s infinite',
      }}
    >
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center shadow-lg shadow-violet-500/30">
        <Sparkles size={15} />
      </div>
      <div>
        <div className="text-xs font-semibold text-[#1d1d1f]">千问 AI 已就绪</div>
        <div className="text-[10px] text-[#6e6e73]">库存预警 · 营收预测 · 客户分层</div>
      </div>
    </div>
  </div>
);

/* ─── Main ─── */
/** 背景粒子场：确定性坐标，避免重渲染抖动（GPU transform 动画） */
const PARTICLES = Array.from({ length: 24 }, (_, i) => {
  const seed = (i * 37 + 11) % 100;
  return {
    left: `${(seed * 3.7) % 100}%`,
    bottom: `${-8 + (i * 13) % 30}%`,
    size: `${2 + (i % 3)}px`,
    duration: `${14 + (i % 7) * 3}s`,
    delay: `${-(i * 1.7) % 20}s`,
    opacity: 0.35 + ((i * 7) % 5) * 0.08,
  };
});

export const Landing: React.FC = () => {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [isYearly, setIsYearly] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [infoModal, setInfoModal] = useState<{ title: string; content: React.ReactNode } | null>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const consoleTiltRef = useTilt<HTMLDivElement>(7);
  const heroInnerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 80);
      // Hero 滚动视差：上移 + 渐隐，让出舞台
      const hh = window.innerHeight * 0.9;
      const t = Math.min(1, Math.max(0, window.scrollY / hh));
      if (heroInnerRef.current) {
        heroInnerRef.current.style.transform = `translateY(${(-t * 70).toFixed(1)}px) scale(${(1 - t * 0.04).toFixed(3)})`;
        heroInnerRef.current.style.opacity = (1 - t * 0.6).toFixed(3);
      }
    };
    const onProgress = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      setScrollProgress(max > 0 ? el.scrollTop / max : 0);
    };
    onScroll();
    onProgress();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onProgress, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onProgress);
    };
  }, []);

  // 首页营销页固定浅色：强制移除 dark class（含 MutationObserver 兜底），
  // 离开时恢复用户主题选择
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    root.classList.remove('dark');
    // 兜底：Landing 挂载期间任何代码加回 dark class 都立即清除
    const mo = new MutationObserver(() => {
      if (root.classList.contains('dark')) root.classList.remove('dark');
    });
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => {
      mo.disconnect();
      if (hadDark) root.classList.add('dark');
    };
  }, []);

  // 鼠标视差：原生 window 监听（transform-only，60fps 友好）
  useEffect(() => {
    const onBgMouseMove = (e: MouseEvent) => {
      const el = bgRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const nx = e.clientX - r.left - r.width / 2;
      const ny = e.clientY - r.top - r.height / 2;
      el.style.setProperty('--mx', (nx / r.width).toFixed(3));
      el.style.setProperty('--my', (ny / r.height).toFixed(3));
    };
    window.addEventListener('mousemove', onBgMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', onBgMouseMove);
  }, []);

  const scrollToPricing = () => {
    const el = document.getElementById('pricing');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToFeatures = () => {
    const el = document.getElementById('features');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white text-[#1d1d1f] overflow-x-clip relative">
      {/* 滚动进度条 */}
      <div className="fixed top-0 left-0 right-0 h-0.5 z-[70] pointer-events-none" aria-hidden>
        <div
          className="h-full bg-gradient-to-r from-violet-600 via-purple-500 to-fuchsia-500 origin-left"
          style={{ transform: `scaleX(${scrollProgress})` }}
        />
      </div>
      {/* ============ Dynamic animated background ============ */}
      <div
        ref={bgRef}
        className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
        style={{ '--mx': '0', '--my': '0' } as React.CSSProperties}
      >
        {/* Aurora: 缓慢旋转的 conic 极光 */}
        <div className="absolute left-1/2 -top-[30%] w-[1400px] h-[1400px] -translate-x-1/2 rounded-full opacity-[0.12] blur-[130px] aurora-spin"
          style={{ background: 'conic-gradient(from 0deg, #7c3aed, #a855f7, #d946ef, #ec4899, #7c3aed)' }} />
        {/* 动态点阵网格（向下渐隐） */}
        <div className="absolute inset-0 dot-grid" />
        {/* 浮动粒子场 */}
        {PARTICLES.map((p, i) => (
          <span key={i} className="particle" style={{
            left: p.left,
            bottom: p.bottom,
            width: p.size,
            height: p.size,
            animationDuration: p.duration,
            animationDelay: p.delay,
            opacity: p.opacity,
          }} />
        ))}
        {/* 三层光斑 + 鼠标视差（transform-only 合成层） */}
        <div className="parallax-layer" style={{ transform: 'translate(calc(var(--mx) * -60px), calc(var(--my) * -60px))' }}>
          <div
            className="absolute w-[820px] h-[820px] rounded-full opacity-25 animate-blob-1"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)' }}
          />
        </div>
        <div className="parallax-layer" style={{ transform: 'translate(calc(var(--mx) * 40px), calc(var(--my) * 40px))' }}>
          <div
            className="absolute w-[720px] h-[720px] rounded-full opacity-20 animate-blob-2"
            style={{ background: 'linear-gradient(135deg, #a855f7, #d946ef)' }}
          />
        </div>
        <div className="parallax-layer" style={{ transform: 'translate(calc(var(--mx) * 90px), calc(var(--my) * 90px))' }}>
          <div
            className="absolute w-[620px] h-[620px] rounded-full opacity-20 animate-blob-3"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #a855f7)' }}
          />
        </div>
      </div>
      {/* ============ 液态玻璃光泽层（流动光线） ============ */}
      <div className="pointer-events-none fixed inset-0 z-[1] glass-sheen" aria-hidden="true" />

      {/* ============ CSS animations (Landing-specific) ============ */}
      {/* NOTE: `float` and `pulse-glow` intentionally NOT redefined here — they
          already live in src/index.css. Only Landing-specific keyframes are local. */}
      <style>{`
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient-shift { animation: gradient-shift 4s ease infinite; background-size: 200% 200%; }
        @keyframes blob1 { 0%,100% { transform:translate(-10%,-10%) rotate(0deg) scale(1); } 33% { transform:translate(30%,10%) rotate(120deg) scale(1.15); } 66% { transform:translate(-20%,40%) rotate(240deg) scale(0.9); } }
        @keyframes blob2 { 0%,100% { transform:translate(40%,20%) rotate(0deg) scale(1); } 33% { transform:translate(-30%,-30%) rotate(-120deg) scale(1.2); } 66% { transform:translate(20%,-10%) rotate(-240deg) scale(0.85); } }
        @keyframes blob3 { 0%,100% { transform:translate(0%,30%) rotate(0deg) scale(1); } 33% { transform:translate(-40%,-20%) rotate(-100deg) scale(1.1); } 66% { transform:translate(30%,30%) rotate(200deg) scale(0.95); } }
        .animate-blob-1 { animation: blob1 22s ease-in-out infinite; }
        .animate-blob-2 { animation: blob2 22s ease-in-out infinite; }
        .animate-blob-3 { animation: blob3 22s ease-in-out infinite; }

        @keyframes floatY { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
        .float-y { animation: floatY 7s ease-in-out infinite; }

        @keyframes drawLine { to { stroke-dashoffset: 0; } }
        .sparkline-path {
          stroke-dasharray: 600;
          stroke-dashoffset: 600;
          animation: drawLine 2.6s cubic-bezier(0.25,0.1,0.25,1) 0.4s forwards;
        }

        @keyframes growBar { from { width: 0%; } }
        .bar-grow { animation: growBar 1.3s cubic-bezier(0.25,0.1,0.25,1) forwards; }

        @keyframes softPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
        .soft-pulse { animation: softPulse 2.4s ease-in-out infinite; }

        /* ---- 背景动效：极光 / 点阵网格 / 粒子 / 视差 ---- */
        @keyframes auroraSpin { from { transform: translateX(-50%) rotate(0deg); } to { transform: translateX(-50%) rotate(360deg); } }
        .aurora-spin {
          transform: translateX(-50%);
          animation: auroraSpin 42s linear infinite;
        }

        @keyframes gridPan { from { background-position: 0 0; } to { background-position: 34px 34px; } }
        .dot-grid {
          background-image: radial-gradient(circle, rgba(99, 102, 241, 0.22) 1px, transparent 1px);
          background-size: 34px 34px;
          -webkit-mask-image: radial-gradient(ellipse 75% 65% at 50% 28%, black 25%, transparent 78%);
          mask-image: radial-gradient(ellipse 75% 65% at 50% 28%, black 25%, transparent 78%);
          animation: gridPan 26s linear infinite;
        }

        @keyframes particleRise {
          0%   { transform: translateY(0) scale(1);    opacity: 0; }
          8%   { opacity: var(--po, 0.6); }
          88%  { opacity: var(--po, 0.6); }
          100% { transform: translateY(-105vh) scale(1.4); opacity: 0; }
        }
        .particle {
          position: absolute;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(167, 139, 250, 0.9), rgba(217, 70, 239, 0.25));
          box-shadow: 0 0 6px rgba(168, 85, 247, 0.5);
          animation-name: particleRise;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          will-change: transform, opacity;
        }

        .parallax-layer { transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1); will-change: transform; }

        /* 光斑柔和边界 */
        .animate-blob-1, .animate-blob-2, .animate-blob-3 { filter: blur(140px); }

        /* 液态玻璃：流动光泽条纹（缓慢左右扫过） */
        .glass-sheen {
          background: linear-gradient(
            115deg,
            transparent 32%,
            rgba(255, 255, 255, 0.55) 42%,
            rgba(255, 255, 255, 0.1) 50%,
            transparent 62%
          );
          background-size: 240% 240%;
          animation: sheenDrift 17s ease-in-out infinite alternate;
          will-change: background-position;
        }
        @keyframes sheenDrift {
          from { background-position: 130% 0%; }
          to   { background-position: -30% 0%; }
        }

        @media (prefers-reduced-motion: reduce) {
          .aurora-spin, .dot-grid, .particle, .animate-blob-1, .animate-blob-2, .animate-blob-3, .float-y, .soft-pulse, .glass-sheen { animation: none !important; }
          .parallax-layer { transition: none; }
        }

        /* 移动端性能降级：关闭最重的背景层（极光 / 粒子 / 点阵 / 光泽） */
        @media (max-width: 767px) {
          .aurora-spin, .dot-grid, .particle, .glass-sheen { display: none !important; }
          .parallax-layer { transition: none !important; }
        }
      `}</style>

      {/* ============ Navbar ============ */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-white/80 backdrop-blur-md border-b border-gray-100 shadow-sm' : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/25">
                <Sparkles size={18} className="text-white" />
              </div>
              <span className="text-xl font-bold text-[#1d1d1f]">Nexora</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a
                href="#features"
                className="nav-link text-sm font-medium text-[#6e6e73] hover:text-[#1d1d1f] transition-colors duration-200"
              >
                功能特性
              </a>
              <a
                href="#pricing"
                className="nav-link text-sm font-medium text-[#6e6e73] hover:text-[#1d1d1f] transition-colors duration-200"
              >
                定价方案
              </a>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-3">
                <TransitionLink to="/login">
                  <Button variant="outline" size="sm">
                    登录
                  </Button>
                </TransitionLink>
                <TransitionLink to="/register">
                  <Button variant="primary" size="sm">
                    免费注册
                  </Button>
                </TransitionLink>
              </div>
              {/* Mobile hamburger menu */}
              <button
                className="md:hidden p-2 rounded-lg text-[#1d1d1f] hover:bg-gray-100 transition-colors"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="切换导航菜单"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>

          {/* Mobile dropdown navigation panel */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-gray-100 space-y-1 animate-fade-in">
              <a
                href="#features"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-base font-medium text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-gray-50 transition-colors"
              >
                功能特性
              </a>
              <a
                href="#pricing"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-base font-medium text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-gray-50 transition-colors"
              >
                定价方案
              </a>
              <div className="pt-3 mt-3 border-t border-gray-100 flex flex-col gap-2">
                <TransitionLink to="/login" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="outline" size="sm" className="w-full">
                    登录
                  </Button>
                </TransitionLink>
                <TransitionLink to="/register" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="primary" size="sm" className="w-full">
                    免费注册
                  </Button>
                </TransitionLink>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ============ Hero — split screen ============ */}
      <section className="relative pt-36 sm:pt-44 pb-24 sm:pb-36 px-4 sm:px-6 lg:px-8 overflow-hidden bg-white/80 backdrop-blur-2xl">
        {/* Local decorative orbs */}
        <div className="absolute -top-20 left-1/4 w-[500px] h-[500px] rounded-full bg-violet-200/30 blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 right-[8%] w-72 h-72 rounded-full bg-fuchsia-200/25 blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 left-[2%] w-96 h-96 rounded-full bg-indigo-200/20 blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div ref={heroInnerRef} className="grid lg:grid-cols-2 lg:gap-16 items-center will-change-transform">
            {/* Left — copy */}
            <div className="text-center lg:text-left">
              <Reveal>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/70 border border-violet-100 text-violet-700 text-sm font-medium shadow-sm backdrop-blur">
                  <span className="w-2 h-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 animate-pulse-glow" />
                  v2.0 现已发布
                  <span className="text-violet-300">·</span>
                  <span className="text-[#8e8e93]">6 大平台已接入</span>
                </div>
              </Reveal>
              <Reveal delay={100}>
                <h1 className="mt-8 text-5xl sm:text-7xl lg:text-8xl text-[#1d1d1f] leading-[1.04] tracking-tight">
                  <span className="animate-hero-title block font-light tracking-tight" style={{ animationDelay: '0.15s' }}>
                    一个面板，
                  </span>
                  <span
                    className="animate-hero-title block font-semibold tracking-tight"
                    style={{ animationDelay: '0.32s' }}
                  >
                    <span className="bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-500 bg-clip-text text-transparent animate-gradient-sweep">
                      管理全部电商渠道
                    </span>
                    <span className="font-light italic text-[#6e6e73]">。</span>
                  </span>
                </h1>
              </Reveal>
              <Reveal delay={300}>
                <p className="mt-6 text-lg sm:text-xl text-[#515154] leading-relaxed max-w-xl mx-auto lg:mx-0">
                  连接 Shopify、抖音、淘宝。订单自动汇聚、库存实时同步、千问 AI 深度分析——不是报表，是建议。
                </p>
              </Reveal>
              <Reveal delay={450}>
                <div className="mt-9 flex flex-wrap items-center justify-center lg:justify-start gap-4">
                  <TransitionLink to="/register" className="animate-cta-breathe magnetic inline-block">
                    <Button
                      variant="primary"
                      size="lg"
                      rightIcon={<ArrowRight size={18} />}
                      className="shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 hover:scale-105"
                    >
                      开始免费试用
                    </Button>
                  </TransitionLink>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={scrollToFeatures}
                    className="hover:scale-105"
                  >
                    查看功能
                  </Button>
                </div>
              </Reveal>
              <Reveal delay={600}>
                <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-x-7 gap-y-2.5">
                  {['无需信用卡', '14 天免费', '5 分钟接入'].map((t) => (
                    <span key={t} className="inline-flex items-center gap-2 text-sm text-[#6e6e73]">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                        <Check size={11} strokeWidth={3} />
                      </span>
                      {t}
                    </span>
                  ))}
                </div>
              </Reveal>
            </div>

            {/* Right — animated console mockup（3D 入场 + 鼠标倾斜） */}
            <Reveal delay={300} className="mt-20 lg:mt-0">
              <div ref={consoleTiltRef} className="console-enter will-change-transform">
                <HeroConsole />
              </div>
            </Reveal>
          </div>
        </div>
        {/* 向下滚动提示 */}
        <a
          href="#features"
          aria-label="向下滚动查看功能"
          className="absolute bottom-7 left-1/2 -translate-x-1/2 z-10 text-[#8e8e93] hover:text-violet-600 transition-colors animate-bounce"
        >
          <ChevronDown size={26} />
        </a>
      </section>

      {/* ============ Trust Anchors (Stripe-style big numbers) ============ */}
      <section className="relative py-20 sm:py-24 bg-white/80 backdrop-blur-2xl border-y border-gray-100 overflow-hidden">
        <div className="absolute -right-20 top-0 w-[350px] h-[350px] bg-violet-300/20 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -left-20 bottom-0 w-[350px] h-[350px] bg-fuchsia-300/20 rounded-full blur-[100px] pointer-events-none" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-10 md:gap-8 text-center">
            {marketingStats.map((s, i) => (
              <Reveal key={s.label} delay={i * 100}>
                <div className="space-y-1">
                  <div className="text-4xl md:text-6xl font-bold text-[#1d1d1f] tracking-tight">
                    <ViewCountUp value={s.value} decimals={s.decimals} prefix={s.prefix} suffix={s.suffix} />
                  </div>
                  <div className="mt-2 text-sm font-medium text-[#1d1d1f]">{s.label}</div>
                  <div className="text-xs text-[#8e8e93]">{s.sub}</div>
                </div>
              </Reveal>
            ))}
          </div>
          <div className="mt-14 pt-8 border-t border-gray-100">
            <p className="text-center text-[11px] font-semibold tracking-[0.25em] text-[#8e8e93] uppercase mb-6">
              已接入 6 大电商平台
            </p>
            <PlatformMarquee />
          </div>
        </div>
      </section>

      {/* ============ Features — 2x2 glass cards ============ */}
      <section id="features" className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8 bg-white/80 backdrop-blur-2xl overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-violet-200/30 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-fuchsia-200/25 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-indigo-200/20 rounded-full blur-[80px] pointer-events-none" />
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold tracking-[0.25em] text-violet-600">
                FEATURES
              </span>
              <h2 className="mt-4 text-4xl sm:text-5xl font-semibold text-[#1d1d1f] tracking-tight">
                扩展所需的一切功能
              </h2>
              <p className="mt-4 text-base sm:text-lg text-[#515154] leading-relaxed max-w-2xl mx-auto">
                从多平台订单同步到千问 AI 洞察，电商运营所需的一切，开箱即用。
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {bentoFeatures.map((feature, idx) => (
              <Reveal key={feature.title} delay={idx * 100}>
                <div
                  className="group relative overflow-hidden p-8 rounded-3xl glass-card spotlight-card glare-host hover:-translate-y-1 hover:shadow-2xl transition-all duration-500 cursor-default"
                  onMouseMove={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    e.currentTarget.style.setProperty('--sx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
                    e.currentTarget.style.setProperty('--sy', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
                  }}
                >
                  <span className="glare-streak" aria-hidden />
                  {/* subtle top sheen */}
                  <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-gradient-to-br from-violet-200/40 to-fuchsia-200/30 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  <div className="relative z-10">
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.accent} text-white flex items-center justify-center mb-5 shadow-lg ${feature.shadow} group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300`}
                    >
                      <feature.icon size={22} />
                    </div>
                    <h3 className="text-xl font-semibold text-[#1d1d1f] mb-2">{feature.title}</h3>
                    <p className="text-[15px] text-[#515154] leading-relaxed">{feature.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ Scroll Narrative — 连接 → AI 分析 → 智能决策 ============ */}
      <section id="how" className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8 bg-white/80 backdrop-blur-2xl overflow-x-clip">
        <div className="absolute top-1/4 right-0 w-[450px] h-[450px] bg-violet-200/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 left-0 w-[400px] h-[400px] bg-fuchsia-200/15 rounded-full blur-[120px] pointer-events-none" />
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold tracking-[0.25em] text-violet-600">
                HOW IT WORKS
              </span>
              <h2 className="mt-4 text-4xl sm:text-5xl font-semibold text-[#1d1d1f] tracking-tight">
                连接 →
                <span className="bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent">
                  AI 分析
                </span>
                {' '}→ 智能决策
              </h2>
              <p className="mt-4 text-lg sm:text-xl text-[#515154] leading-relaxed max-w-2xl mx-auto">
                三步完成从多平台数据到可执行商业决策的闭环
              </p>
            </div>
          </Reveal>
        </div>
        {shouldSkipReveal() ? (
          /* reduced-motion：静态交替行 */
          <div className="max-w-5xl mx-auto space-y-16 sm:space-y-24">
            {narrativeSteps.map((item, i) => (
              <NarrativeRow key={item.num} item={item} index={i} />
            ))}
          </div>
        ) : (
          /* 自动轮播分镜舞台 */
          <Storyboard />
        )}
      </section>

      {/* ============ Wavy divider ============ */}
      <div className="text-[#f5f5f7]">
        <WavyDivider />
      </div>

      {/* ============ Qwen AI Highlight ============ */}
      <section className="relative py-20 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-violet-600 via-purple-600 to-violet-700 text-white overflow-hidden">
        {/* glow orbs */}
        <div className="absolute -top-32 -right-24 w-[420px] h-[420px] rounded-full bg-fuchsia-400/20 blur-[120px] pointer-events-none float-y" />
        <div className="absolute -bottom-40 -left-24 w-[460px] h-[460px] rounded-full bg-indigo-400/20 blur-[130px] pointer-events-none float-y" style={{ animationDelay: '-3s' }} />
        <div className="absolute top-1/3 left-1/2 w-[300px] h-[300px] rounded-full bg-white/10 blur-[100px] pointer-events-none float-y" style={{ animationDelay: '-6s' }} />
        {/* subtle noise */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.06] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            backgroundSize: '160px 160px',
          }}
        />
        <div className="max-w-5xl mx-auto text-center relative">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-sm font-medium mb-6 backdrop-blur">
              <Sparkles size={16} className="text-violet-200" />
              千问 AI 驱动
            </div>
            <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight">通义千问 · 真正的 AI 电商智能</h2>
            <p className="mt-4 text-base sm:text-lg text-white/80 leading-relaxed max-w-3xl mx-auto">
              Nexora 集成了阿里云通义千问（Qwen）大模型，对您的订单数据、客户行为和商品表现进行深度分析 — 不是规则模板，是真正的 AI 推理。
            </p>
            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
              {[
                { icon: Brain, title: '深度数据分析', desc: '千问读取全部订单、客户和商品数据，识别人工难以发现的趋势与异常。' },
                { icon: LineChart, title: '智能营收预测', desc: '基于历史销售曲线 + 季节性因素，生成未来 7 天营收预测及置信区间。' },
                { icon: Lightbulb, title: '可执行建议', desc: '不仅是"提升销量"，而是"优先处理 pending 订单、分析抖音取消原因"等具体行动项。' },
              ].map((item, i) => (
                <div
                  key={i}
                  className="glare-host bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/20 hover:bg-white/15 hover:-translate-y-1 transition-all duration-300 shadow-lg shadow-black/10 float-y"
                  style={{ animationDelay: `${i * 1.2}s` }}
                >
                  <span className="glare-streak" aria-hidden />
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-white/25 to-white/10 border border-white/20 flex items-center justify-center mb-4 shadow-lg shadow-black/10">
                    <item.icon size={20} className="text-white" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                  <p className="text-sm text-white/70">{item.desc}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <div className="text-[#f5f5f7]">
        <WavyDivider flip />
      </div>

      {/* ============ Pricing ============ */}
      <section id="pricing" className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8 bg-white/80 backdrop-blur-2xl overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-300/20 rounded-full blur-[130px] pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-fuchsia-300/20 rounded-full blur-[100px] pointer-events-none" />
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="text-center mb-10">
              <span className="text-xs font-semibold tracking-[0.25em] text-violet-600">
                PRICING
              </span>
              <h2 className="mt-4 text-4xl sm:text-5xl font-semibold text-[#1d1d1f] tracking-tight">
                简单透明的定价
              </h2>
              <p className="mt-4 text-base sm:text-lg text-[#515154] leading-relaxed max-w-2xl mx-auto">
                选择适合您需求的方案。随时升级或降级。
              </p>
            </div>
          </Reveal>

          {/* Toggle (capsule) */}
          <Reveal delay={100}>
            <div className="flex items-center justify-center mb-12">
              <div className="inline-flex items-center p-1 rounded-full bg-[#F5F5F7] border border-gray-200 shadow-sm">
                <button
                  onClick={() => setIsYearly(false)}
                  className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                    !isYearly
                      ? 'bg-[#1d1d1f] text-white shadow-md'
                      : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                  }`}
                >
                  月付
                </button>
                <button
                  onClick={() => setIsYearly(true)}
                  className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-1.5 ${
                    isYearly
                      ? 'bg-[#1d1d1f] text-white shadow-md'
                      : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                  }`}
                >
                  年付
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                      isYearly ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    省17%
                  </span>
                </button>
              </div>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto items-start">
            {pricingPlans.map((plan, idx) => (
              <Reveal key={plan.name} delay={idx * 150}>
                <div
                  className={`relative rounded-3xl p-8 transition-all duration-500 glass-card ${
                    plan.popular
                      ? 'border-2 border-violet-300 shadow-2xl shadow-violet-500/10 scale-[1.03] z-10 hover:scale-[1.05]'
                      : 'border border-gray-200 shadow-sm hover:shadow-xl hover:-translate-y-1'
                  }`}
                >
                  {plan.popular && (
                    <>
                      <div aria-hidden className="animated-border pointer-events-none absolute inset-0 !rounded-3xl" />
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                        <span className="px-3.5 py-1 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white text-xs font-semibold shadow-lg shadow-violet-500/30">
                          推荐
                        </span>
                      </div>
                    </>
                  )}
                  {/* Tier badge */}
                  <div className="mb-3">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200">
                      {plan.tier === 'free' ? '基础版' : plan.tier === 'pro' ? '专业版' : '企业版'}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-[#1d1d1f]">{plan.name}</h3>
                  <div className="mt-4 flex items-baseline">
                    <span
                      key={isYearly ? 'y' : 'm'}
                      className="price-swap inline-block text-4xl font-bold text-[#1d1d1f]"
                    >
                      {plan.name === 'Free'
                        ? '¥0'
                        : isYearly
                          ? `¥${plan.name === 'Pro' ? '24' : '83'}`
                          : plan.price}
                    </span>
                    <span className="ml-1.5 text-sm text-[#8e8e93]">
                      /{plan.name === 'Free' ? plan.period : '月'}
                    </span>
                  </div>
                  {isYearly && plan.name !== 'Free' && (
                    <p className="text-xs text-[#8e8e93] mt-1">
                      每年 ¥{plan.name === 'Pro' ? '289' : '986'}
                    </p>
                  )}
                  <p className="mt-2 text-sm text-[#6e6e73]">{plan.description}</p>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check size={16} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-[#6e6e73]">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8">
                    <TransitionLink to="/register">
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
                    </TransitionLink>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="relative py-20 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-white/5 translate-y-1/2 -translate-x-1/4" />
        <div className="absolute top-1/3 left-1/4 w-64 h-64 rounded-full bg-fuchsia-400/10 blur-3xl" />

        <div className="max-w-6xl mx-auto relative">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <Reveal>
              <div>
                <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-white leading-tight tracking-tight">
                  准备好让生意
                  <br />
                  一目了然了吗？
                </h2>
                <p className="mt-4 text-base sm:text-lg text-violet-100 leading-relaxed max-w-md">
                  今天就开始统一管理你的电商生意。14 天免费试用，无需信用卡。
                </p>
              </div>
            </Reveal>
            <Reveal delay={200}>
              <div className="flex flex-col sm:flex-row items-start lg:justify-end gap-4">
                <TransitionLink
                  to="/register"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white text-violet-700 font-semibold text-base shadow-xl shadow-black/10 hover:bg-violet-50 hover:scale-105 transition-all duration-300"
                >
                  开始免费试用
                  <ArrowRight size={18} />
                </TransitionLink>
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
      <section id="faq" className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8 bg-white/80 backdrop-blur-2xl overflow-hidden">
        <div className="max-w-3xl mx-auto">
          <Reveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold tracking-[0.25em] text-violet-600">
                FAQ
              </span>
              <h2 className="mt-4 text-4xl sm:text-5xl font-semibold text-[#1d1d1f] tracking-tight">
                常见问题
              </h2>
              <p className="mt-4 text-base sm:text-lg text-[#515154] leading-relaxed">
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

      {/* ============ 关于 Nexora：发展历程 + 创始人 ============ */}
      <section id="about" className="relative z-10 py-24 sm:py-32 px-4 sm:px-6 lg:px-8 text-white overflow-hidden" style={{ background: 'linear-gradient(160deg, #0b1023 0%, #151238 45%, #0b1023 100%)' }}>
        {/* 背景装饰 */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-violet-600/10 blur-[120px]" />
          <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full bg-fuchsia-600/10 blur-[120px]" />
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          {/* 标题 */}
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-violet-300 text-sm font-medium">
              <Sparkles size={14} />
              关于 Nexora
            </span>
            <h2 className="mt-5 text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
              一个人，一支队伍，
              <br />
              <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
                从第一行代码到真实店铺运营。
              </span>
            </h2>
            <p className="mt-5 text-base text-[#8e8e93] max-w-2xl mx-auto leading-relaxed">
              Nexora 不是团队作业的产物——它由创始人独立完成全部后端、前端、AI 与数据工程。
              下面是这段旅程的每一步，以及站在它背后的人。
            </p>
          </div>

          {/* 发展历程 timeline */}
          <div className="mb-20">
            <h3 className="text-lg font-bold text-white/90 mb-8 flex items-center gap-2">
              <span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-violet-400 to-fuchsia-500" />
              发展历程
            </h3>
            <div className="relative">
              {/* 竖线 */}
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-violet-500/60 via-fuchsia-500/40 to-transparent hidden sm:block" />
              <div className="space-y-8">
                {[
                  { v: 'v1.0', t: '2026.06', title: '立项 · 从 0 到 1', desc: '完成全栈架构设计：多租户工作空间体系 + 商品 / 订单 / 客户 / 库存全流程 CRUD，FastAPI + React 双端同日跑通。' },
                  { v: 'v2.0', t: '2026.07', title: '安全与工程化', desc: '6 大平台适配器接入、JWT + 2FA 双因素认证、Fernet 凭证加密、路由层重构瘦身 60%，28 项 pytest 集成测试筑底。' },
                  { v: 'v3.0', t: '2026.08', title: 'AI 深度融合', desc: '接入通义千问，落地 8 个真实 AI 面板：BI 对话、销售分析、智能定价、销量预测、经营日报 / 周报——全部真实模型调用，拒绝规则伪装。' },
                  { v: 'v4.0', t: '2026.08', title: '真实数据引擎', desc: '接入真实 Shopify 店铺（Admin REST API）：商品 / 订单 / 客户 / 优惠券 / 退款双向同步，凭证 Fernet 加密落库，增量同步上线。' },
                  { v: 'v5.0', t: '2026.08', title: '经营智能体', desc: '对话式 Agent 上线：一句话指令 → AI 拆解任务 → 调用真实工具 → Shopify 回写验证，全程留审计；利润分析毛利看板 + 自动巡检同日发布。' },
                ].map((m, i) => (
                  <div key={m.v} className="relative sm:pl-12 flex gap-4">
                    {/* 节点 */}
                    <div className="hidden sm:flex absolute left-0 top-1 w-[15px] h-[15px] rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/40 ring-4 ring-slate-900" />
                    <div className="flex-shrink-0 w-16">
                      <span className="text-xs font-bold text-violet-300">{m.v}</span>
                      <p className="text-[11px] text-[#8e8e93] mt-0.5">{m.t}</p>
                    </div>
                    <div className="flex-1 rounded-2xl bg-white/[0.03] border border-white/10 px-5 py-4 hover:border-violet-500/40 hover:bg-white/[0.05] transition-all duration-300">
                      <p className="text-sm font-bold text-white">{m.title}</p>
                      <p className="text-sm text-[#a1a1aa] mt-1.5 leading-relaxed">{m.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 创始人卡 */}
          <div className="rounded-3xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 p-8 sm:p-10 backdrop-blur">
            <h3 className="text-lg font-bold text-white/90 mb-8 flex items-center gap-2">
              <span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-amber-400 to-orange-500" />
              创始人
            </h3>
            <div className="flex flex-col lg:flex-row gap-10">
              {/* 左：头像 + 名片 */}
              <div className="lg:w-[300px] flex-shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 flex items-center justify-center text-3xl font-extrabold text-white shadow-xl shadow-violet-500/30 select-none">
                    浩
                  </div>
                  <div>
                    <p className="text-xl font-extrabold text-white">李浩棋</p>
                    <p className="text-sm text-violet-300 font-medium">创始人 · 全栈工程师</p>
                    <p className="text-xs text-[#8e8e93] mt-1">Nexora 独立开发者</p>
                  </div>
                </div>
                <p className="mt-6 text-sm text-[#a1a1aa] leading-relaxed">
                  "不是报表，是建议。"——我相信中小卖家需要的不是又一个后台，而是一个替他们思考、并能真正动手执行的经营智能体。
                </p>
                <span className="inline-flex items-center gap-1.5 mt-5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                  挑战者杯参赛项目
                </span>
              </div>
              {/* 右：数字成就 + 技术栈 */}
              <div className="flex-1">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    { n: '46,000+', l: '行代码 · 独立编写' },
                    { n: '137+', l: 'REST API 端点' },
                    { n: '26', l: '张数据库表' },
                    { n: '8', l: '个真实 AI 面板' },
                    { n: '39', l: '条自动化测试' },
                    { n: '1', l: '家真实 Shopify 店铺' },
                  ].map((s) => (
                    <div key={s.l} className="rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-5 text-center hover:border-violet-400/40 hover:bg-white/[0.07] transition-all duration-300 group">
                      <p className="text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight bg-gradient-to-r from-white to-violet-200 bg-clip-text text-transparent group-hover:scale-105 transition-transform duration-300">{s.n}</p>
                      <p className="text-xs text-[#8e8e93] mt-1.5">{s.l}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-7">
                  <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">技术栈</p>
                  <div className="flex flex-wrap gap-2">
                    {['FastAPI', 'React 18', 'TypeScript', 'SQLAlchemy', '通义千问', 'Shopify Admin API', 'ECharts', 'Tailwind CSS', 'Playwright', 'APScheduler'].map((tech) => (
                      <span key={tech} className="px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-xs text-[#c4c4cc] font-medium hover:border-violet-400/50 hover:text-white transition-all duration-200">
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ Footer ============ */}
      <footer className="bg-slate-900 text-[#8e8e93] py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-5 gap-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
                  <Sparkles size={18} className="text-white" />
                </div>
                <span className="text-xl font-bold text-white">Nexora</span>
              </div>
              <p className="text-sm max-w-sm">
                一个面板，管理全部电商渠道。订单、库存、客户与 AI 洞察，实时汇聚于此。
              </p>
              <div className="flex items-center gap-2.5 mt-6">
                {PLATFORMS.map((p) => (
                  <span
                    key={p.name}
                    title={p.name}
                    className={`w-7 h-7 rounded-lg bg-gradient-to-br ${p.hue} text-white text-[11px] font-bold flex items-center justify-center shadow-sm opacity-80 hover:opacity-100 transition-opacity`}
                  >
                    {p.mark}
                  </span>
                ))}
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
                  <Link to="/terms" className="text-sm hover:text-white transition-colors">
                    服务条款
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
                    onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })}
                    className="text-sm hover:text-white transition-colors text-left cursor-pointer"
                  >
                    关于我们
                  </button>
                </li>
                <li>
                  <button
                    onClick={() =>
                      setInfoModal({
                        title: '联系我们',
                        content: (
                          <div className="space-y-2 text-sm text-gray-600">
                            <p><span className="font-medium text-slate-900">联系人：</span>李浩棋</p>
                            <p><span className="font-medium text-slate-900">手机号：</span>13656117061</p>
                          </div>
                        ),
                      })
                    }
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

      {/* 信息弹窗 */}
      <Modal
        isOpen={!!infoModal}
        onClose={() => setInfoModal(null)}
        title={infoModal?.title || ''}
        size="md"
      >
        {infoModal?.content}
      </Modal>
    </div>
  );
};
