import React, { useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, RefreshCw, Sparkles, Info, ShieldCheck, LineChart as LineChartIcon, Stethoscope, History,
} from 'lucide-react';
import api from '@/services/api';
import { usePageT, useI18n } from '@/i18n';
import { HealthRadarChart } from '@/components/charts/HealthRadarChart';

interface HealthDimension {
  key: string;
  name: string;
  score: number;
  level: string;
  reasons: string[];
}

interface PrevSnapshot {
  score: number;
  level: string;
  dimensions: HealthDimension[];
  computed_at?: string | null;
}

interface HealthData {
  score: number;
  level: string;
  summary: string;
  dimensions: HealthDimension[];
  anomalies?: { severity: number; tag: string; title: string; detail: string }[];
  ai_generated?: boolean;
  prev?: PrevSnapshot | null;
  computed_at?: string;
}

interface HistoryPoint {
  score: number;
  level: string;
  created_at?: string | null;
}

const D = {
  zh: {
    health_title: '经营健康引擎',
    health_subtitle: '自动体检 · 归因诊断 · 历史沉淀（处方由 AI 决策助手开具）',
    refresh: '重新体检',
    level_green: '健康',
    level_yellow: '需关注',
    level_red: '需干预',
    loading: '体检中…',
    anomaly_title: '异常雷达',
    score_method: '评分方法',
    score_method_title: '六个维度 · 自动评分',
    radar_title: '六维健康画像',
    radar_hint: '凹陷处即薄弱环节，点击维度查看归因',
    diagnosis_title: '诊断结论',
    weakest_title: '最薄弱维度',
    goto_prescription: '去决策助手看处方',
    computed_at: '最近体检',
    vs_prev: '较上次',
    trend_title: '体检趋势',
    trend_empty: '完成多次体检后，这里将展示历史趋势',
    first_check: '首次体检',
    ai_badge: 'AI 解读',
    prev_legend: '虚线为上期',
    snapshot_count: '次体检沉淀',
  },
  en: {
    health_title: 'Business Health Engine',
    health_subtitle: 'Auto check-up · diagnosis · history (prescriptions via AI Assistant)',
    refresh: 'Re-check',
    level_green: 'Healthy',
    level_yellow: 'Watch',
    level_red: 'Action needed',
    loading: 'Checking…',
    anomaly_title: 'Anomaly radar',
    score_method: 'Scoring method',
    score_method_title: '6 dimensions · auto scored',
    radar_title: 'Health Radar',
    radar_hint: 'Dip = weak dimension, click to see root cause',
    diagnosis_title: 'Diagnosis',
    weakest_title: 'Weakest dimension',
    goto_prescription: 'View prescriptions',
    computed_at: 'Last check-up',
    vs_prev: 'vs last',
    trend_title: 'Check-up trend',
    trend_empty: 'Trend appears after multiple check-ups',
    first_check: 'First check-up',
    ai_badge: 'AI summary',
    prev_legend: 'dashed = previous',
    snapshot_count: 'check-ups archived',
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

const fmtTime = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date().toDateString() === d.toDateString();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return today ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
};

/** 体检趋势线（真实持久化快照，刷新不丢） */
const TrendSpark: React.FC<{ points: HistoryPoint[]; color: string }> = ({ points, color }) => {
  if (points.length < 2) return null;
  const w = 110, h = 32, pad = 4;
  const min = Math.min(...points.map(p => p.score));
  const max = Math.max(...points.map(p => p.score));
  const range = Math.max(max - min, 10);
  const stepX = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((p.score - min) / range) * (h - pad * 2);
    return { x, y, p };
  });
  const polyline = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 2.6 : 1.6} fill={color} opacity={i === coords.length - 1 ? 1 : 0.55}>
          <title>{`${c.p.score} 分 · ${fmtTime(c.p.created_at)}`}</title>
        </circle>
      ))}
    </svg>
  );
};

export const HealthScoreCard: React.FC<{ slug: string }> = ({ slug }) => {
  const t = usePageT(D);
  const { lang } = useI18n();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [showMethod, setShowMethod] = useState(false);
  const [selectedDim, setSelectedDim] = useState<string | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      // 后端默认 ai=1：千问基于六维画像生成 AI 总结（失败自动回落规则版）
      const [healthRes, historyRes] = await Promise.all([
        api.get(`/workspaces/${slug}/health?ai=1`, { timeout: 35000 }),
        api.get(`/workspaces/${slug}/health/history?limit=12`, { timeout: 10000 }),
      ]);
      setData(healthRes.data);
      setHistory((historyRes.data?.items || []).map((it: any) => ({
        score: it.score, level: it.level, created_at: it.created_at,
      })));
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

  const scrollToPrescription = () => {
    document.getElementById('ai-decision-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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
  const anomalyCount = data.anomalies?.length || 0;
  const weakest = data.dimensions.reduce((m, d) => (d.score < m.score ? d : m), data.dimensions[0]);
  const prevDelta = data.prev ? data.score - data.prev.score : null;

  return (
    <div id="health-engine-card" className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden scroll-mt-20">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 pt-5 pb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-fuchsia-500 flex items-center justify-center shadow-sm shadow-primary-500/20">
            <Activity size={19} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-gray-100 leading-none">
                {t('health_title')}
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400 flex-shrink-0 leading-tight">
                {lang === 'zh' ? '诊断层' : 'Diagnosis'}
              </span>
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
            onClick={fetchHealth}
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

      {/* ── 诊断结论（AI 总结 + 最薄弱维度 + 处方引导） ── */}
      <div className="px-6 pt-4">
        <div className="rounded-xl border border-violet-100 dark:border-violet-500/20 bg-gradient-to-br from-violet-50/70 to-fuchsia-50/40 dark:from-violet-500/[0.07] dark:to-fuchsia-500/[0.04] px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Stethoscope size={14} className="text-violet-500" />
            <span className="text-xs font-bold text-violet-600 dark:text-violet-300 uppercase tracking-wide">{t('diagnosis_title')}</span>
            {data.ai_generated && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300">
                <Sparkles size={9} />
                {t('ai_badge')}
              </span>
            )}
            <span className="h-px flex-1 bg-violet-100 dark:bg-violet-500/10" />
            {data.computed_at && (
              <span className="text-[11px] text-gray-400 dark:text-gray-500">{t('computed_at')} {fmtTime(data.computed_at)}</span>
            )}
          </div>
          <p className="text-[13px] leading-relaxed text-slate-700 dark:text-gray-200">{data.summary}</p>
          <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
            <div className="flex items-center gap-2 text-[12px]">
              <span className="text-gray-500 dark:text-gray-400">{t('weakest_title')}</span>
              <span
                className="inline-flex items-center gap-1.5 font-bold px-2 py-0.5 rounded-full"
                style={{ color: levelColor(weakest.level), backgroundColor: `${levelColor(weakest.level)}15` }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: levelColor(weakest.level) }} />
                {weakest.name} {weakest.score}
              </span>
            </div>
            <button
              onClick={scrollToPrescription}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors shadow-sm shadow-violet-500/20"
            >
              {t('goto_prescription')}
              <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* ── 雷达图主视觉 + 维度条 + 评分方法 ── */}
      <div className="p-6 pb-5">
        <div className="rounded-2xl border border-gray-100 dark:border-gray-700/60 bg-white dark:bg-gray-800/40 p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-primary-500" />
              <p className="text-[14px] font-bold text-gray-700 dark:text-gray-200">{t('radar_title')}</p>
              <span className="text-[11px] text-gray-400 dark:text-gray-500 hidden sm:inline">{t('radar_hint')}</span>
              {data.prev && (
                <span className="text-[11px] text-gray-400 dark:text-gray-500 hidden md:inline">· {t('prev_legend')}</span>
              )}
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
              {prevDelta !== null && (
                <span className={`text-[11px] font-bold tabular-nums ${prevDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                  {t('vs_prev')} {prevDelta >= 0 ? '+' : ''}{prevDelta}
                </span>
              )}
            </div>
          </div>

          {/* 维度快捷选择 chips：点击联动雷达顶点强调 + 下方归因高亮 */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {data.dimensions.map((d) => {
              const c = levelColor(d.level);
              const active = selectedDim === d.key;
              return (
                <button
                  key={d.key}
                  onClick={() => setSelectedDim(active ? null : d.key)}
                  className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full border transition-all ${
                    active
                      ? 'border-transparent text-white shadow-sm'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800/60'
                  }`}
                  style={active ? { backgroundColor: c } : undefined}
                  aria-pressed={active}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: active ? '#fff' : c }} />
                  {d.name}
                  <span className="tabular-nums">{d.score}</span>
                </button>
              );
            })}
          </div>

          <HealthRadarChart dimensions={data.dimensions} previous={data.prev?.dimensions ?? null} selectedKey={selectedDim} />

          {/* 真实历史趋势（持久化快照） */}
          <div className="flex items-center justify-between mt-1 pt-3 border-t border-gray-100 dark:border-gray-700/60">
            <div className="flex items-center gap-1.5 text-[12px] text-gray-400 dark:text-gray-500">
              <History size={12} />
              <span>{t('trend_title')}</span>
              {history.length > 0 && (
                <span className="text-gray-300 dark:text-gray-600">· {history.length} {t('snapshot_count')}</span>
              )}
            </div>
            {history.length >= 2 ? (
              <TrendSpark points={history} color={color} />
            ) : (
              <span className="text-[11px] text-gray-300 dark:text-gray-600 flex items-center gap-1">
                <LineChartIcon size={11} />
                {history.length === 1 ? t('first_check') : t('trend_empty')}
              </span>
            )}
          </div>
        </div>

        {/* 维度条（点击选中展开完整归因） */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 content-center mt-6">
          {data.dimensions.map((dim) => {
            const c = levelColor(dim.level);
            const active = selectedDim === dim.key;
            return (
              <button
                key={dim.key}
                onClick={() => setSelectedDim(active ? null : dim.key)}
                className={`min-w-0 text-left rounded-xl px-3 py-2 -mx-3 transition-all ${
                  active ? 'bg-gray-50 dark:bg-gray-700/30 ring-1 ring-gray-200 dark:ring-gray-600' : 'hover:bg-gray-50/70 dark:hover:bg-gray-700/20'
                }`}
              >
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
                <p className={`text-[13px] text-gray-500 dark:text-gray-400 mt-2 leading-relaxed ${active ? '' : 'line-clamp-2'}`}>
                  {dim.reasons.join(' · ')}
                </p>
              </button>
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
    </div>
  );
};
