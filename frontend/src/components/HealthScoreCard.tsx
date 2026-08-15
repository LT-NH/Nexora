import React, { useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle2, Play, RefreshCw, Sparkles, TrendingUp,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';
import { usePageT } from '@/i18n';

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
}

const D = {
  zh: {
    health_title: '经营健康',
    health_subtitle: '引擎自动体检 · 归因诊断 · 今日处方',
    today_actions: '今日行动',
    action_impact: '影响',
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
  },
  en: {
    health_title: 'Business health',
    health_subtitle: 'Auto check-up · diagnosis · today\'s prescriptions',
    today_actions: 'Today\'s actions',
    action_impact: 'Impact',
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
  },
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
const actionIcon = (type: string, size = 14) => {
  if (type === 'restock' || type === 'clearance') return <RefreshCw size={size} />;
  if (type === 'retention') return <Sparkles size={size} />;
  if (type === 'keep') return <TrendingUp size={size} />;
  return <AlertTriangle size={size} />;
};

export const HealthScoreCard: React.FC<{ slug: string }> = ({ slug }) => {
  const t = usePageT(D);
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [executingType, setExecutingType] = useState<string | null>(null);

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
      setData(res.data?.health || data);
    } catch {
      addToast('error', t('exec_fail'), '');
    } finally {
      setExecutingType(null);
    }
  };

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/workspaces/${slug}/health`, { timeout: 15000 });
      setData(res.data);
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
          <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-28 bg-gray-100 dark:bg-gray-800 rounded-xl" />
          <div className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl" />
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
  const ringLen = 2 * Math.PI * 62;
  const anomalyCount = data.anomalies?.length || 0;

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 pt-5 pb-1">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-violet-500 flex items-center justify-center shadow-sm shadow-primary-500/20">
            <Activity size={17} className="text-white" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-gray-100 leading-none">
              {t('health_title')}
              {anomalyCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 align-middle">
                  <AlertTriangle size={9} />
                  {anomalyCount}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{t('health_subtitle')}</p>
          </div>
        </div>
        <button
          onClick={fetchHealth}
          disabled={loading}
          title={t('refresh')}
          className="p-2 rounded-lg text-gray-400 hover:text-primary-500 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Anomalies banner ── */}
      {data.anomalies && data.anomalies.length > 0 && (
        <div className="px-6 pt-3">
          <div className="rounded-xl border border-rose-100 dark:border-rose-500/20 bg-rose-50/50 dark:bg-rose-500/[0.06] overflow-hidden">
            <div className="flex items-center gap-2 px-3.5 pt-2.5 pb-1">
              <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-300 uppercase tracking-wide">
                {t('anomaly_title')}
              </span>
              <span className="h-px flex-1 bg-rose-100 dark:bg-rose-500/10" />
            </div>
            <div className="px-3.5 pb-3 pt-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-1.5">
              {data.anomalies.slice(0, 3).map((a, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.severity >= 3 ? 'bg-rose-500' : 'bg-amber-500'}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-700 dark:text-gray-200 truncate">{a.title}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{a.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Score + Dimensions ── */}
      <div className="p-6 pb-5 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8">
        {/* Score ring */}
        <div className="flex flex-col items-center lg:items-start">
          <div className="relative w-[140px] h-[140px]">
            <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
              <circle cx="70" cy="70" r="62" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="10" />
              <circle
                cx="70" cy="70" r="62" fill="none"
                stroke={color} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={ringLen}
                strokeDashoffset={ringLen * (1 - (data.score / 100))}
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[44px] font-bold leading-none text-slate-900 dark:text-gray-100 tabular-nums tracking-tight">
                {data.score}
              </span>
              <span
                className="mt-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${color}18`, color }}
              >
                {levelLabel(data.level, t)}
              </span>
            </div>
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-gray-600 dark:text-gray-300 text-center lg:text-left max-w-[260px]">
            {data.summary}
          </p>
        </div>

        {/* Dimensions grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-7 gap-y-4 content-center">
          {data.dimensions.map((dim) => {
            const c = levelColor(dim.level);
            return (
              <div key={dim.key} className="min-w-0">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{dim.name}</span>
                  <span className="text-sm font-semibold tabular-nums leading-none" style={{ color: c }}>
                    {dim.score}
                    <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500 ml-0.5">/100</span>
                  </span>
                </div>
                <div className="h-1 rounded-full bg-gray-100 dark:bg-gray-700/60 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.max(4, dim.score)}%`, backgroundColor: c }}
                  />
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5 truncate">
                  {dim.reasons.join(' · ')}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Today's actions ── */}
      <div className="px-6 pb-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={13} className="text-primary-500" />
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 tracking-wide">
            {t('today_actions')}
          </p>
          <span className="h-px flex-1 bg-gray-100 dark:bg-gray-700/60" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {data.actions.length === 0 && (
            <p className="text-xs text-gray-400 col-span-full">{t('loading')}</p>
          )}
          {data.actions.slice(0, 5).map((a, i) => {
            const theme = actionTheme[a.type] || actionTheme.channel_recovery;
            const actionable = a.type === 'clearance' || a.type === 'retention' || a.type === 'restock';
            return (
              <div
                key={i}
                className="group flex flex-col gap-2 rounded-xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-800/40 px-3.5 py-3 hover:border-gray-200 dark:hover:border-gray-600 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${theme.bg} ${theme.fg}`}>
                      {actionIcon(a.type)}
                    </span>
                    <span className="text-xs font-medium text-slate-800 dark:text-gray-100 truncate">{a.title}</span>
                  </div>
                  {actionable && (
                    <button
                      onClick={() => handleExecute(a)}
                      disabled={executingType !== null}
                      className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors flex-shrink-0"
                    >
                      <Play size={10} className={executingType === a.type ? 'animate-spin' : ''} />
                      {executingType === a.type ? t('executing') : t('execute')}
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">{a.detail}</p>
                {a.impact && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-auto">
                    <TrendingUp size={11} className="flex-shrink-0" />
                    <span className="truncate">{a.impact}</span>
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
