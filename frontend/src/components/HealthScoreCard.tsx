import React, { useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle2, Play, RefreshCw, Sparkles, TrendingUp, Info, ShieldCheck, LineChart as LineChartIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';
import { usePageT, useI18n } from '@/i18n';
import { HealthRadarChart } from '@/components/charts/HealthRadarChart';

interface HealthAction {
  type: string;
  severity: number;
  title: string;
  detail: string;
  impact: string;
  product_id?: string;
}

interface HealthDimension {
  key: string;
  name: string;
  score: number;
  level: string;
  reasons: string[];
}

interface HealthData {
  score: number;
  level: string;
  summary: string;
  dimensions: HealthDimension[];
  actions: HealthAction[];
  anomalies?: { severity: number; tag: string; title: string; detail: string }[];
  ai_generated?: boolean;
  computed_at?: string;
}

const D = {
  zh: {
    health_title: '经营健康引擎',
    health_subtitle: '自动体检 · 归因诊断 · 今日处方',
    today_actions: '今日行动处方',
    action_impact: '预估影响',
    refresh: '重新体检',
    level_green: '健康',
    level_yellow: '需关注',
    level_red: '需干预',
    loading: '体检中…',
    execute: '执行',
    executing: '执行中…',
    go_to: '去处理',
    anomaly_title: '异常雷达',
    exec_success: '执行成功',
    exec_fail: '执行失败',
    score_trend: '体检趋势',
    score_method: '评分方法',
    score_method_title: '六个维度 · 自动评分',
    radar_title: '六维健康画像',
    radar_hint: '凹陷处即薄弱环节，优先处理低分维度',
    priority_0: 'P0 紧急',
    priority_1: 'P1 优先',
    priority_2: 'P2 关注',
    computed_at: '最近体检',
    no_action: '暂无处方，经营状态良好',
  },
  en: {
    health_title: 'Business Health Engine',
    health_subtitle: 'Auto check-up · diagnosis · today\'s prescriptions',
    today_actions: "Today's action plan",
    action_impact: 'Estimated impact',
    refresh: 'Re-check',
    level_green: 'Healthy',
    level_yellow: 'Watch',
    level_red: 'Action needed',
    loading: 'Checking…',
    execute: 'Execute',
    executing: 'Executing…',
    go_to: 'Go handle',
    anomaly_title: 'Anomaly radar',
    exec_success: 'Executed',
    exec_fail: 'Failed',
    score_trend: 'Check-up trend',
    score_method: 'Scoring method',
    score_method_title: '6 dimensions · auto scored',
    radar_title: 'Health Radar',
    radar_hint: 'Dip = weak dimension, handle low scores first',
    priority_0: 'P0 Urgent',
    priority_1: 'P1 High',
    priority_2: 'P2 Watch',
    computed_at: 'Last check-up',
    no_action: 'No prescriptions — business is healthy',
  },
};

/** 维度评分方法说明（专业口径） */
const DIM_DESC: Record<string, { zh: string; en: string }> = {
  cashflow: { zh: '现金流：基准 85 分，退款率每 +1% 扣 4 分；营收环比上升加分', en: 'Cashflow: base 85, -4 per +1% refund rate; up on revenue growth' },
  inventory: { zh: '库存：滞销 SKU 占比 ×1.5 + 断货 SKU 占比 ×2.5 扣分', en: 'Inventory: overstock % ×1.5 + stockout % ×2.5 deducted' },
  customer: { zh: '客户：复购率 ×0.9 + 45 基准，流失率每 +1% 扣 1.5 分', en: 'Customers: repeat rate ×0.9 + 45 base, -1.5 per +1% churn' },
  channel: { zh: '渠道：单一渠道占比超 60% 或最差渠道负增长扣分', en: 'Channel: high concentration or worst channel negative growth' },
  growth: { zh: '增长：近 7 天对比前 7 天营收增速，负增长按比例扣分', en: 'Growth: 7-day vs prior 7-day revenue growth deduction' },
  profit: { zh: '利润：近 14 天毛利率基准 45%，每偏离 1% 调 2 分；退款损耗与成本覆盖不足扣分', en: 'Profit: 14-day gross margin, base 45%; ±2 per %; refund loss & coverage penalty' },
};

const levelColor = (level: string) =>
  level === 'green' ? '#10b981' : level === 'yellow' ? '#f59e0b' : '#ef4444';

const levelLabel = (level: string, t: any) =>
  level === 'green' ? t('level_green') : level === 'yellow' ? t('level_yellow') : t('level_red');

/** 行动类型 → 主题色（用于图标底色 / 徽章） */
const actionTheme: Record<string, { bg: string; fg: string }> = {
  restock: { bg: 'bg-blue-50 dark:bg-blue-500/15', fg: 'text-blue-600 dark:text-blue-400' },
  clearance: { bg: 'bg-amber-50 dark:bg-amber-500/15', fg: 'text-amber-600 dark:text-amber-400' },
  retention: { bg: 'bg-violet-50 dark:bg-violet-500/15', fg: 'text-violet-600 dark:text-violet-400' },
  keep: { bg: 'bg-emerald-50 dark:bg-emerald-500/15', fg: 'text-emerald-600 dark:text-emerald-400' },
  refund_check: { bg: 'bg-rose-50 dark:bg-rose-500/15', fg: 'text-rose-600 dark:text-rose-400' },
  channel_recovery: { bg: 'bg-sky-50 dark:bg-sky-500/15', fg: 'text-sky-600 dark:text-sky-400' },
};
const actionIcon = (type: string, size = 15) => {
  if (type === 'restock' || type === 'clearance') return <RefreshCw size={size} />;
  if (type === 'retention') return <Sparkles size={size} />;
  if (type === 'keep') return <TrendingUp size={size} />;
  return <AlertTriangle size={size} />;
};

const priorityOf = (severity: number) => (severity >= 3 ? 0 : severity === 2 ? 1 : 2);
const priorityStyle = [
  { labelKey: 'priority_0', cls: 'bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400' },
  { labelKey: 'priority_1', cls: 'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  { labelKey: 'priority_2', cls: 'bg-gray-100 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400' },
];

/** 迷你体检趋势线（SVG，最近 10 次体检分数） */
const TrendSpark: React.FC<{ points: { score: number }[]; color: string }> = ({ points, color }) => {
  if (points.length < 2) {
    return (
      <div className="flex items-center gap-1.5 text-[12px] text-gray-400 dark:text-gray-500">
        <LineChartIcon size={13} />
        <span className="opacity-0">·</span>
      </div>
    );
  }
  const w = 96, h = 30, pad = 3;
  const min = Math.min(...points.map(p => p.score));
  const max = Math.max(...points.map(p => p.score));
  const range = Math.max(max - min, 10);
  const stepX = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((p.score - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = points[points.length - 1].score;
  const delta = points.length > 1 ? last - points[points.length - 2].score : 0;
  return (
    <div className="flex items-center gap-2">
      <svg width={w} height={h} className="overflow-visible">
        <polyline points={coords.join(' ')} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={coords[coords.length - 1].split(',')[0]} cy={coords[coords.length - 1].split(',')[1]} r="2.4" fill={color} />
      </svg>
      <span className={`text-[12px] font-semibold tabular-nums ${delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
        {delta >= 0 ? '+' : ''}{delta.toFixed(0)}
      </span>
    </div>
  );
};

export const HealthScoreCard: React.FC<{ slug: string }> = ({ slug }) => {
  const t = usePageT(D);
  const { lang } = useI18n();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [executingType, setExecutingType] = useState<string | null>(null);
  const [history, setHistory] = useState<{ score: number }[]>([]);
  const [showMethod, setShowMethod] = useState(false);

  const handleExecute = async (action: HealthAction) => {
    if (action.type === 'restock') {
      navigate('/products');
      return;
    }
    if (action.type !== 'clearance' && action.type !== 'retention') {
      return;
    }
    setExecutingType(action.type);
    try {
      const res = await api.post(`/workspaces/${slug}/health/execute`, {
        type: action.type,
        product_id: action.product_id,
      });
      addToast('success', t('exec_success'), res.data?.message || '');
      if (res.data?.health) {
        setData(res.data.health);
        setHistory(h => [...h.slice(-9), { score: res.data.health.score }]);
      }
    } catch {
      addToast('error', t('exec_fail'), '');
    } finally {
      setExecutingType(null);
    }
  };

  const fetchHealth = async (withAI = false) => {
    setLoading(true);
    try {
      // withAI=true：千问基于六维画像生成个性化 AI 总结（首次加载快速返回规则版，手动刷新出 AI 解读）
      const res = await api.get(`/workspaces/${slug}/health${withAI ? '?ai=1' : ''}`, { timeout: 30000 });
      setData(res.data);
      setHistory(h => [...h.slice(-9), { score: res.data.score }]);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (loading && !data) {
    return (
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-44 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded-xl" />
          <div className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-6 text-sm text-gray-500 dark:text-gray-400">
        {t('loading')}
      </div>
    );
  }

  const color = levelColor(data.level);
  const ringLen = 2 * Math.PI * 70;
  const anomalyCount = data.anomalies?.length || 0;

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 pt-5 pb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-fuchsia-500 flex items-center justify-center shadow-sm shadow-primary-500/20">
            <Activity size={19} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-gray-100 leading-none">
                  {t('health_title')}
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400 flex-shrink-0 leading-tight">
                  {lang === 'zh' ? '六维体检' : '6-D Health'}
                </span>
              </div>
              {anomalyCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400">
                  <AlertTriangle size={11} />
                  {anomalyCount}
                </span>
              )}
            </div>
            <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-1">{t('health_subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMethod(s => !s)}
            title={t('score_method')}
            className={`p-2 rounded-lg transition-colors ${showMethod ? 'text-primary-600 bg-primary-50 dark:bg-primary-500/10' : 'text-gray-400 hover:text-primary-500 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
          >
            <Info size={16} />
          </button>
          <button
            onClick={() => fetchHealth(true)}
            disabled={loading}
            title={t('refresh')}
            className="p-2 rounded-lg text-gray-400 hover:text-primary-500 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Anomalies banner ── */}
      {data.anomalies && data.anomalies.length > 0 && (
        <div className="px-6 pt-3">
          <div className="rounded-xl border border-rose-100 dark:border-rose-500/20 bg-rose-50/50 dark:bg-rose-500/[0.06] overflow-hidden">
            <div className="flex items-center gap-2 px-4 pt-3 pb-1">
              <span className="text-xs font-bold text-rose-600 dark:text-rose-300 uppercase tracking-wide">
                {t('anomaly_title')}
              </span>
              <span className="h-px flex-1 bg-rose-100 dark:bg-rose-500/10" />
            </div>
            <div className="px-4 pb-3 pt-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-2">
              {data.anomalies.slice(0, 3).map((a, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.severity >= 3 ? 'bg-rose-500' : 'bg-amber-500'}`} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-slate-700 dark:text-gray-200 truncate">{a.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{a.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 雷达图主视觉 + 维度条 + 评分方法（占主要版面） ── */}
      <div className="p-6 pb-5">
        {/* 六维健康雷达图：凹陷即薄弱 —— 占满宽度作为主视觉 */}
        <div className="rounded-2xl border border-gray-100 dark:border-gray-700/60 bg-white dark:bg-gray-800/40 p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-primary-500" />
              <p className="text-[14px] font-bold text-gray-700 dark:text-gray-200">{t('radar_title')}</p>
              <span className="text-[11px] text-gray-400 dark:text-gray-500 hidden sm:inline">{t('radar_hint')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-gray-500 dark:text-gray-400">综合分</span>
              <span className="text-xl font-extrabold leading-none tabular-nums" style={{ color }}>
                {data.score}
              </span>
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${color}18`, color }}
              >
                {levelLabel(data.level, t)}
              </span>
              {data.ai_generated && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-500/15 text-violet-600 dark:text-violet-300">
                  <Sparkles size={10} />
                  AI 解读
                </span>
              )}
            </div>
          </div>
          <HealthRadarChart dimensions={data.dimensions} />
        </div>

        {/* 维度条（2 列：上方雷达主视觉 + 下方细节） */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 content-center mt-6">
          {data.dimensions.map((dim) => {
            const c = levelColor(dim.level);
            return (
              <div key={dim.key} className="min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                    {dim.name}
                  </span>
                  <span className="text-base font-bold tabular-nums leading-none" style={{ color: c }}>
                    {dim.score}
                    <span className="text-[11px] font-normal text-gray-400 dark:text-gray-500 ml-0.5">/100</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700/60 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.max(4, dim.score)}%`, backgroundColor: c }}
                  />
                </div>
                <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-2 leading-relaxed line-clamp-2">
                  {dim.reasons.join(' · ')}
                </p>
              </div>
            );
          })}
        </div>

        {/* 评分方法弹层 */}
        <div className={`mt-5 rounded-xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/70 dark:bg-gray-800/40 transition-all ${showMethod ? 'block' : 'hidden'}`}>
          <div className="flex items-center gap-2 px-4 pt-3">
            <ShieldCheck size={13} className="text-primary-500" />
            <span className="text-[12px] font-bold text-gray-600 dark:text-gray-300 tracking-wide">{t('score_method_title')}</span>
            <span className="h-px flex-1 bg-gray-100 dark:bg-gray-700/60" />
          </div>
          <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {data.dimensions.map((dim) => (
              <div key={dim.key} className="flex items-start gap-2 text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed">
                <span className="font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap flex-shrink-0">{dim.name}</span>
                <span>{DIM_DESC[dim.key]?.[lang] || ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Today's actions ── */}
      <div className="px-6 pb-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-primary-500" />
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200 tracking-wide">
            {t('today_actions')}
          </p>
          <span className="h-px flex-1 bg-gray-100 dark:bg-gray-700/60" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {data.actions.length === 0 && (
            <p className="text-[13px] text-gray-400 col-span-full flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-emerald-500" />
              {t('no_action')}
            </p>
          )}
          {data.actions.slice(0, 5).map((a, i) => {
            const theme = actionTheme[a.type] || actionTheme.channel_recovery;
            const actionable = a.type === 'clearance' || a.type === 'retention' || a.type === 'restock';
            const pri = priorityOf(a.severity);
            return (
              <div
                key={i}
                className="group flex flex-col gap-2 rounded-xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-800/40 px-4 py-3.5 hover:border-gray-200 dark:hover:border-gray-600 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${theme.bg} ${theme.fg}`}>
                      {actionIcon(a.type)}
                    </span>
                    <span className="text-sm font-semibold text-slate-800 dark:text-gray-100 truncate">{a.title}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${priorityStyle[pri].cls}`}>
                      {t(priorityStyle[pri].labelKey)}
                    </span>
                    {actionable && (
                      <button
                        onClick={() => handleExecute(a)}
                        disabled={executingType !== null}
                        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
                      >
                        <Play size={11} className={executingType === a.type ? 'animate-spin' : ''} />
                        {executingType === a.type ? t('executing') : t('execute')}
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">{a.detail}</p>
                {a.impact && (
                  <p className="text-[13px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mt-auto font-medium">
                    <TrendingUp size={13} className="flex-shrink-0" />
                    <span className="truncate">{t('action_impact')}：{a.impact}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
