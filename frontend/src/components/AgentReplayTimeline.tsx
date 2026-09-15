import React, { useEffect, useState } from 'react';
import {
  Radar, Brain, Play, History, ChevronDown, ChevronUp, RefreshCw,
  Zap, Lock, ShieldCheck, CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import api from '@/services/api';
import { usePageT, useI18n } from '@/i18n';

const D = {
  zh: {
    title: 'Agent 决策回放',
    subtitle: '把每次巡店还原成「感知 → 决策 → 执行 → 回访」，看清楚它为什么这么做',
    empty: '还没有巡店记录——让 Agent 当班一次后，这里会显示完整决策链路',
    refresh: '刷新',
    status_auto: '自主执行',
    status_confirm: '待你确认',
    status_guided: '引导建议',
    status_blocked: '被限额拦下',
    hit: '命中',
    miss: '未命中',
    watching: '观察中',
    planned: '计划',
    reviewed: '回访',
    load_fail: '加载失败',
  },
  en: {
    title: 'Agent Decision Replay',
    subtitle: 'Each patrol replayed as perceive → decide → act → review',
    empty: 'No patrol yet — run the Agent once and the full chain shows up here',
    refresh: 'Refresh',
    status_auto: 'Auto-executed',
    status_confirm: 'Awaiting confirm',
    status_guided: 'Guided',
    status_blocked: 'Capped',
    hit: 'Hit',
    miss: 'Miss',
    watching: 'Watching',
    planned: 'planned',
    reviewed: 'reviewed',
    load_fail: 'Load failed',
  },
};

interface ReplayItem {
  status?: string;
  action_type?: string | null;
  tool?: string | null;
  label?: string;
  detail?: string;
  reason?: string;
  why_confirm?: string;
  risk?: string | null;
  shopify_synced?: boolean | null;
  text?: string;
  title?: string;
  outcome?: string;
  metric_before?: number | null;
  metric_after?: number | null;
  lesson?: string | null;
}

interface ReplayPhase {
  key: string;
  label_zh: string;
  label_en: string;
  desc_zh: string;
  desc_en: string;
  items?: ReplayItem[];
  detail?: {
    conclusion: string;
    planned: number;
    distribution: Record<string, number>;
  };
}

interface ReplayRun {
  task_id: string;
  created_at: string;
  status: string;
  conclusion: string;
  phases: ReplayPhase[];
  totals: Record<string, number>;
}

const PHASE_ICON: Record<string, React.ReactNode> = {
  perceive: <Radar size={14} />,
  decide: <Brain size={14} />,
  act: <Play size={14} />,
  review: <History size={14} />,
};

const fmtTime = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const utcMs = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
  return new Date(utcMs).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const AgentReplayTimeline: React.FC<{ slug: string }> = ({ slug }) => {
  const t = usePageT(D);
  const { lang } = useI18n();
  const [runs, setRuns] = useState<ReplayRun[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [openRun, setOpenRun] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await api.get(`/workspaces/${slug}/ai/agent/replay?limit=5`, { timeout: 20000 });
      setRuns(r.data?.runs ?? []);
      if (r.data?.runs?.length) setOpenRun(r.data.runs[0].task_id);
    } catch {
      /* 静默：不阻塞工作台 */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug]);

  const statusMeta = (s?: string) => {
    if (s === 'auto_executed') return { text: t('status_auto'), cls: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', Icon: Zap };
    if (s === 'awaiting_confirm') return { text: t('status_confirm'), cls: 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400', Icon: Lock };
    if (s === 'guided') return { text: t('status_guided'), cls: 'bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400', Icon: ShieldCheck };
    return { text: t('status_blocked'), cls: 'bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400', Icon: Clock };
  };

  const outcomeMeta = (o?: string) => {
    if (o === 'improved') return { text: t('hit'), cls: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', Icon: CheckCircle2 };
    if (o === 'not_improved') return { text: t('miss'), cls: 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400', Icon: XCircle };
    return { text: t('watching'), cls: 'bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400', Icon: Clock };
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-sm">
              <History size={16} className="text-white" />
            </div>
            <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-gray-100 leading-tight">{t('title')}</h3>
          </div>
          <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-1 ml-11">{t('subtitle')}</p>
        </div>
        <button
          onClick={load}
          className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors flex-shrink-0 inline-flex items-center gap-1"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {t('refresh')}
        </button>
      </div>

      <div className="px-5 pb-5">
        {loading && !runs ? (
          <div className="animate-pulse space-y-2 py-2">
            <div className="h-4 w-2/3 bg-gray-100 dark:bg-gray-700/60 rounded" />
            <div className="h-4 w-1/2 bg-gray-100 dark:bg-gray-700/60 rounded" />
          </div>
        ) : !runs || runs.length === 0 ? (
          <p className="text-[12.5px] text-gray-400 dark:text-gray-500 py-3">{t('empty')}</p>
        ) : (
          <div className="space-y-2.5">
            {runs.map((run) => {
              const open = openRun === run.task_id;
              return (
                <div key={run.task_id} className="rounded-xl border border-gray-100 dark:border-gray-700/60 overflow-hidden">
                  <button
                    onClick={() => setOpenRun(open ? null : run.task_id)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    <span className="text-[11px] font-mono text-gray-400 dark:text-gray-500 flex-shrink-0 tabular-nums">
                      {fmtTime(run.created_at)}
                    </span>
                    <span className="text-[13px] font-medium text-slate-700 dark:text-gray-200 truncate flex-1">{run.conclusion}</span>
                    <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex-shrink-0 tabular-nums">
                      {run.totals.auto_executed} {t('status_auto')}
                    </span>
                    <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 flex-shrink-0 tabular-nums">
                      {run.totals.planned} {t('planned')}
                    </span>
                    {open ? <ChevronUp size={14} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />}
                  </button>

                  {open && (
                    <div className="px-3.5 pb-3.5 pt-1">
                      <div className="relative pl-5">
                        {/* 时间线主轴 */}
                        <span className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-150 dark:bg-gray-700" aria-hidden="true" />
                        {run.phases.map((ph, pi) => {
                          const tone = [
                            'bg-sky-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500',
                          ][pi] || 'bg-gray-400';
                          return (
                            <div key={ph.key} className="relative pb-3 last:pb-0">
                              <span className={`absolute -left-[17px] top-1 w-3.5 h-3.5 rounded-full ${tone} ring-2 ring-white dark:ring-gray-800`} aria-hidden="true" />
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-500 dark:text-gray-400">{PHASE_ICON[ph.key]}</span>
                                <span className="text-[12.5px] font-bold text-slate-700 dark:text-gray-200">
                                  {lang === 'zh' ? ph.label_zh : ph.label_en}
                                </span>
                                <span className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                                  {lang === 'zh' ? ph.desc_zh : ph.desc_en}
                                </span>
                              </div>

                              {/* 决策阶段：展示计划分布 */}
                              {ph.key === 'decide' && ph.detail && (
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  {Object.entries(ph.detail.distribution).map(([k, v]) => (
                                    <span key={k} className="text-[11px] px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 tabular-nums">
                                      {k}: {v}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* 感知 / 执行阶段 */}
                              {ph.items && ph.key !== 'review' && ph.items.length > 0 && (
                                <div className="mt-1.5 space-y-1">
                                  {ph.items.map((it, ii) => {
                                    if (ph.key === 'perceive') {
                                      return (
                                        <p key={ii} className="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed">
                                          · {it.text}
                                        </p>
                                      );
                                    }
                                    const sm = statusMeta(it.status);
                                    const Icon = sm.Icon;
                                    return (
                                      <div key={ii} className="flex items-start gap-2 text-[12px]">
                                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold flex-shrink-0 ${sm.cls}`}>
                                          <Icon size={10} />{sm.text}
                                        </span>
                                        <span className="text-gray-600 dark:text-gray-300 min-w-0">
                                          <span className="font-medium">{it.label}</span>
                                          {it.detail ? <span className="text-gray-400 dark:text-gray-500"> · {it.detail}</span> : null}
                                          {it.why_confirm ? <span className="text-amber-600/80 dark:text-amber-400/70"> · {it.why_confirm}</span> : null}
                                          {it.shopify_synced ? <span className="text-emerald-600/80 dark:text-emerald-400/70"> · Shopify ✓</span> : null}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* 回访阶段 */}
                              {ph.key === 'review' && (
                                <div className="mt-1.5 space-y-1">
                                  {(!ph.items || ph.items.length === 0) ? (
                                    <p className="text-[12px] text-gray-400 dark:text-gray-500">
                                      {lang === 'zh' ? '尚未到回访窗口（执行后 1 小时起自动对比指标）' : 'Review window not reached yet'}
                                    </p>
                                  ) : (
                                    ph.items.map((it, ii) => {
                                      const om = outcomeMeta(it.outcome);
                                      const Icon = om.Icon;
                                      return (
                                        <div key={ii} className="flex items-start gap-2 text-[12px]">
                                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold flex-shrink-0 ${om.cls}`}>
                                            <Icon size={10} />{om.text}
                                          </span>
                                          <span className="text-gray-600 dark:text-gray-300 min-w-0">
                                            <span className="font-medium">{it.title}</span>
                                            {it.metric_before != null && it.metric_after != null && (
                                              <span className="text-gray-400 dark:text-gray-500 tabular-nums"> · {it.metric_before} → {it.metric_after}</span>
                                            )}
                                          </span>
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
