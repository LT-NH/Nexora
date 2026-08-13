import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Play, RefreshCw, Sparkles, TrendingUp } from 'lucide-react';
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
    today_actions: '今日行动清单',
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

const actionIcon = (type: string, size = 16) => {
  if (type === 'restock' || type === 'clearance') return <RefreshCw size={size} className="text-blue-500" />;
  if (type === 'retention') return <Sparkles size={size} className="text-violet-500" />;
  if (type === 'keep') return <TrendingUp size={size} className="text-emerald-500" />;
  return <AlertTriangle size={size} className="text-amber-500" />;
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
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl" />
          <div className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-6 text-sm text-gray-500 dark:text-gray-400">
        {t('loading')}
      </div>
    );
  }

  const color = levelColor(data.level);
  const ringLen = 2 * Math.PI * 42;

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-gray-100 flex items-center gap-2">
            <Activity size={18} className="text-primary-500" />
            {t('health_title')}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('health_subtitle')}</p>
        </div>
        <button
          onClick={fetchHealth}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-primary-500 transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          {t('refresh')}
        </button>
      </div>

      {data.anomalies && data.anomalies.length > 0 && (
        <div className="px-6 pt-2">
          <div className="rounded-xl border border-amber-200 dark:border-amber-700/50 bg-amber-50/60 dark:bg-amber-900/15 px-4 py-3 space-y-2">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <AlertTriangle size={13} />
              {t('anomaly_title')}
            </p>
            {data.anomalies.slice(0, 3).map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.severity >= 3 ? 'bg-red-500' : 'bg-amber-500'}`} />
                <div>
                  <p className="font-medium text-slate-700 dark:text-gray-200">{a.title}</p>
                  <p className="text-gray-500 dark:text-gray-400 mt-0.5">{a.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-6 pt-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Score ring */}
        <div className="flex items-center gap-5">
          <div className="relative w-[108px] h-[108px] flex-shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke={color} strokeWidth="8" strokeLinecap="round"
                strokeDasharray={ringLen}
                strokeDashoffset={ringLen * (1 - (data.score / 100))}
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-slate-900 dark:text-gray-100 tabular-nums">{data.score}</span>
              <span className="text-[10px] text-gray-400">{t('level_' + data.level)}</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full mb-2"
              style={{ backgroundColor: `${color}1a`, color }}
            >
              <CheckCircle2 size={11} />
              {levelLabel(data.level, t)}
            </span>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{data.summary}</p>
          </div>
        </div>

        {/* Dimensions */}
        <div className="space-y-2.5">
          {data.dimensions.map((dim) => {
            const c = levelColor(dim.level);
            return (
              <div key={dim.key} className="group">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-600 dark:text-gray-300 font-medium">{dim.name}</span>
                  <span className="tabular-nums" style={{ color: c }}>
                    {dim.score}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.max(4, dim.score)}%`, backgroundColor: c }}
                  />
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate group-hover:whitespace-normal">
                  {dim.reasons.join(' · ')}
                </p>
              </div>
            );
          })}
        </div>

        {/* Today's actions */}
        <div>
          <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-1.5">
            <Sparkles size={13} className="text-primary-500" />
            {t('today_actions')}
          </p>
          <div className="space-y-2">
            {data.actions.length === 0 && (
              <p className="text-xs text-gray-400">{t('loading')}</p>
            )}
            {data.actions.slice(0, 5).map((a, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 px-3 py-2.5"
              >
                <span className="mt-0.5 flex-shrink-0">{actionIcon(a.type)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-700 dark:text-gray-200">{a.title}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{a.detail}</p>
                  {a.impact && (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {t('action_impact')}：{a.impact}
                    </p>
                  )}
                  {(a.type === 'clearance' || a.type === 'retention' || a.type === 'restock') && (
                    <button
                      onClick={() => handleExecute(a)}
                      disabled={executingType !== null}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 dark:text-primary-300 hover:text-primary-700 disabled:opacity-50 transition-colors"
                    >
                      <Play size={11} className={executingType === a.type ? 'animate-spin' : ''} />
                      {executingType === a.type ? t('executing') : t('execute')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
