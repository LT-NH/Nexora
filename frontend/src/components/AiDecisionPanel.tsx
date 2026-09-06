import React, { useEffect, useState } from 'react';
import {
  Brain, PackageX, RefreshCw, ShoppingCart, Sparkles, Target, TrendingDown, TrendingUp, UserX, CheckCircle2, XCircle, ChevronDown, ChevronUp, CalendarClock, Zap, Stethoscope, BookOpen, ArrowUpRight,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';
import { usePageT, useI18n } from '@/i18n';

interface AiInsightItem {
  id: string;
  insight_type: string;
  title: string;
  detail: string;
  confidence: number;
  action_type: string;
  action_params: string;
  status: string;
  suggested_at?: string;
  snapshot_id?: string | null;
}

interface Diagnosis {
  snapshot_id: string;
  score: number;
  level: string;
  weakest?: { name: string; score: number } | null;
  computed_at?: string | null;
}

interface ExperienceItem {
  id: string;
  action_type: string;
  title: string;
  outcome: string;
  lesson?: string | null;
  delta_days: number;
  feedback_at?: string | null;
}

const D = {
  zh: {
    title: 'AI 决策助手',
    subtitle: '消费健康诊断 · 开处方 · 真实执行 · 经验沉淀',
    today: '今日处方',
    no_insight: '今日无待处理处方，经营状态良好',
    execute: '执行',
    executing: '执行中…',
    executed: '已执行',
    feedback_title: '回访验证',
    improved: '已改善',
    not_improved: '未改善',
    feedback_note: '30 天后回访该处方命中情况',
    hit_rate: '处方命中率',
    predictions: '未来 7 天预测',
    predict_stockout: '预计缺货',
    predict_churn: '客户流失风险',
    no_predict: '未来 7 天无缺货风险',
    no_churn: '暂无流失风险客户',
    exec_done: '执行成功',
    exec_fail: '执行失败，请重试',
    feedback_saved: '反馈已记录，谢谢',
    conf: '置信度',
    diagnosis_from: '处方依据 · 健康引擎体检',
    score_short: '综合',
    weakest_short: '最薄弱',
    view_health: '查看体检',
    exp_title: '经验库',
    exp_lessons: '条沉淀',
    exp_empty: '执行处方并回访后，自动沉淀为经验资产',
    hit_outcome: '命中',
    miss_outcome: '未命中',
  },
  en: {
    title: 'AI Decision Assistant',
    subtitle: 'Diagnosis-driven prescriptions · real execute · experience loop',
    today: "Today's prescriptions",
    no_insight: 'No pending prescriptions today — business looks good',
    execute: 'Execute',
    executing: 'Executing…',
    executed: 'Executed',
    feedback_title: 'Follow-up',
    improved: 'Improved',
    not_improved: 'Not improved',
    feedback_note: 'Revisit this prescription in 30 days',
    hit_rate: 'Prescription hit rate',
    predictions: 'Next 7 days forecast',
    predict_stockout: 'Stockout risk',
    predict_churn: 'Churn risk',
    no_predict: 'No stockout risk in next 7 days',
    no_churn: 'No churn-risk customers',
    exec_done: 'Executed',
    exec_fail: 'Execution failed, please retry',
    feedback_saved: 'Feedback saved, thanks',
    conf: 'confidence',
    diagnosis_from: 'Based on Health Engine check-up',
    score_short: 'Score',
    weakest_short: 'Weakest',
    view_health: 'View check-up',
    exp_title: 'Experience base',
    exp_lessons: 'archived',
    exp_empty: 'Execute prescriptions & give feedback to build the knowledge base',
    hit_outcome: 'Hit',
    miss_outcome: 'Miss',
  },
};

const typeTheme: Record<string, { bg: string; fg: string; icon: any }> = {
  stockout: { bg: 'bg-rose-50 dark:bg-rose-500/15', fg: 'text-rose-600 dark:text-rose-400', icon: PackageX },
  refund: { bg: 'bg-amber-50 dark:bg-amber-500/15', fg: 'text-amber-600 dark:text-amber-400', icon: TrendingDown },
  overstock: { bg: 'bg-orange-50 dark:bg-orange-500/15', fg: 'text-orange-600 dark:text-orange-400', icon: RefreshCw },
  churn: { bg: 'bg-violet-50 dark:bg-violet-500/15', fg: 'text-violet-600 dark:text-violet-400', icon: UserX },
  growth: { bg: 'bg-emerald-50 dark:bg-emerald-500/15', fg: 'text-emerald-600 dark:text-emerald-400', icon: TrendingUp },
};

export const AiDecisionPanel: React.FC<{ slug: string }> = ({ slug }) => {
  const t = usePageT(D);
  const { lang } = useI18n();
  const { addToast } = useToast();
  const [insights, setInsights] = useState<AiInsightItem[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [stats, setStats] = useState<{ hit_rate: number | null; total_executed: number } | null>(null);
  const [predictions, setPredictions] = useState<any>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [experiences, setExperiences] = useState<{ total: number; items: ExperienceItem[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [showPred, setShowPred] = useState(false);
  const [showExp, setShowExp] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [sum, st, pred, exp] = await Promise.all([
        api.get(`/workspaces/${slug}/ai/daily-summary`, { timeout: 20000 }),
        api.get(`/workspaces/${slug}/ai/insights/stats`, { timeout: 10000 }),
        api.get(`/workspaces/${slug}/ai/predictions`, { timeout: 15000 }),
        api.get(`/workspaces/${slug}/ai/experiences?limit=3`, { timeout: 10000 }),
      ]);
      setInsights(sum.data.insights || []);
      setMetrics(sum.data.metrics || null);
      setDiagnosis(sum.data.diagnosis || null);
      setStats(st.data);
      setPredictions(pred.data);
      setExperiences(exp.data ? { total: exp.data.total ?? 0, items: exp.data.items || [] } : null);
    } catch {
      // 静默：AI 面板失败不影响工作台
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [slug]);

  const handleExecute = async (ins: AiInsightItem) => {
    setExecutingId(ins.id);
    try {
      const res = await api.post(`/workspaces/${slug}/ai/insights/${ins.id}/execute`, {}, { timeout: 60000 });
      addToast('success', t('exec_done'), res.data?.message || '');
      setInsights(prev => prev.map(i => (i.id === ins.id ? { ...i, status: 'executed' } : i)));
      load();
    } catch {
      addToast('error', t('exec_fail'), '');
    } finally {
      setExecutingId(null);
    }
  };

  const handleFeedback = async (ins: AiInsightItem, improved: boolean) => {
    try {
      await api.post(`/workspaces/${slug}/ai/insights/${ins.id}/feedback`, { improved });
      addToast('success', t('feedback_saved'), '');
      load();
    } catch {
      addToast('error', t('feedback_saved'), '');
    }
  };

  if (loading && insights.length === 0) {
    return (
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl" />
          <div className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl" />
        </div>
      </div>
    );
  }

  const hitRate = stats?.hit_rate;

  const fmtHM = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const today = new Date().toDateString() === d.toDateString();
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return today ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
  };

  const scrollToHealth = () => {
    document.getElementById('health-engine-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const diagColor = diagnosis?.level === 'green' ? '#10b981' : diagnosis?.level === 'yellow' ? '#f59e0b' : '#ef4444';

  return (
    <div id="ai-decision-panel" className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden panel-glow scroll-mt-20">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-sm shadow-violet-500/20">
            <Brain size={17} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-gray-100 leading-none">
                {t('title')}
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 flex-shrink-0 leading-tight">
                {lang === 'zh' ? '千问驱动' : 'Qwen AI'}
              </span>
            </div>
            <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-1">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hitRate !== null && hitRate !== undefined ? (
            <div className="flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Target size={12} />
              {t('hit_rate')} {hitRate}%
            </div>
          ) : (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 px-1">{t('hit_rate')} —</span>
          )}
          <button onClick={() => setShowPred(s => !s)} className="p-2 rounded-lg text-gray-400 hover:text-violet-500 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors" title={t('predictions')}>
            {showPred ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* 诊断溯源条：处方来自健康引擎哪次体检（单向流可视化） */}
      {diagnosis && (
        <div className="px-5 pt-3">
          <div className="flex items-center gap-2 flex-wrap rounded-lg bg-sky-50/70 dark:bg-sky-500/[0.08] border border-sky-100 dark:border-sky-500/20 px-3 py-2">
            <Stethoscope size={13} className="text-sky-500 flex-shrink-0" />
            <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">{t('diagnosis_from')}</span>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {t('score_short')} <b className="tabular-nums" style={{ color: diagColor }}>{diagnosis.score}</b>
              {diagnosis.weakest && (
                <> · {t('weakest_short')}「{diagnosis.weakest.name}」{diagnosis.weakest.score}</>
              )}
              {diagnosis.computed_at && <> · {fmtHM(diagnosis.computed_at)}</>}
            </span>
            <button
              onClick={scrollToHealth}
              className="ml-auto inline-flex items-center gap-0.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 transition-colors"
            >
              {t('view_health')}
              <ArrowUpRight size={11} />
            </button>
          </div>
        </div>
      )}

      {/* Today's summary */}
      <div className="px-5 pt-3">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={13} className="text-violet-500" />
          <p className="text-[13px] font-bold text-gray-600 dark:text-gray-300 tracking-wide">{t('today')}</p>
          <span className="h-px flex-1 bg-gray-100 dark:bg-gray-700/60" />
        </div>
        <div className="space-y-2.5 animate-fade-in">
          {insights.length === 0 && (
            <p className="text-[13px] text-gray-400 flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-emerald-500" />
              {t('no_insight')}
            </p>
          )}
          {insights.map(ins => {
            const theme = typeTheme[ins.insight_type] || typeTheme.stockout;
            const Icon = theme.icon;
            const executed = ins.status === 'executed';
            return (
              <div key={ins.id} className="rounded-xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-800/40 px-3.5 py-3 flex items-start gap-3 hover:border-gray-200 dark:hover:border-gray-600 transition-all">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${theme.bg} ${theme.fg}`}>
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800 dark:text-gray-100 truncate">{ins.title}</p>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 flex-shrink-0">
                      {t('conf')} {Math.round(ins.confidence * 100)}%
                    </span>
                  </div>
                  <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed line-clamp-2">{ins.detail}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {!executed ? (
                      <button
                        onClick={() => handleExecute(ins)}
                        disabled={executingId !== null}
                        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                      >
                        <Zap size={11} className={executingId === ins.id ? 'animate-pulse' : ''} />
                        {executingId === ins.id ? t('executing') : t('execute')}
                      </button>
                    ) : (
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 size={12} />
                        {t('executed')}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                      <CalendarClock size={11} />
                      {t('feedback_note')}
                    </span>
                    {executed && (
                      <div className="flex items-center gap-1 ml-auto">
                        <button
                          onClick={() => handleFeedback(ins, true)}
                          className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 transition-colors"
                        >
                          <CheckCircle2 size={11} className="inline mr-0.5" />
                          {t('improved')}
                        </button>
                        <button
                          onClick={() => handleFeedback(ins, false)}
                          className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-500/15 text-rose-500 hover:bg-rose-100 transition-colors"
                        >
                          <XCircle size={11} className="inline mr-0.5" />
                          {t('not_improved')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Predictions (collapsible, 平滑展开/收起) */}
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          showPred ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!showPred}
      >
        <div className="overflow-hidden">
        <div className="px-5 pb-4 mt-1">
          <div className="rounded-xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-800/40 p-3.5">
            <div className="flex items-center gap-2 mb-2.5">
              <CalendarClock size={13} className="text-primary-500" />
              <p className="text-[13px] font-bold text-gray-600 dark:text-gray-300">{t('predictions')}</p>
              <span className="h-px flex-1 bg-gray-100 dark:bg-gray-700/60" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-semibold text-rose-500 flex items-center gap-1 mb-1.5">
                  <PackageX size={11} />
                  {t('predict_stockout')}
                </p>
                <div className="space-y-1">
                  {(!predictions?.stockout_7d || predictions.stockout_7d.length === 0) && (
                    <p className="text-[12px] text-gray-400">{t('no_predict')}</p>
                  )}
                  {predictions?.stockout_7d?.slice(0, 4).map((s: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-[12px]">
                      <span className="text-gray-600 dark:text-gray-300 truncate max-w-[180px]">{s.name}</span>
                      <span className={`font-semibold flex-shrink-0 ${s.severity === 'critical' || s.severity === 'high' ? 'text-rose-500' : 'text-amber-500'}`}>
                        {s.days_left <= 0 ? '已缺货' : `${s.days_left} 天后`} · {s.eta}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-violet-500 flex items-center gap-1 mb-1.5">
                  <UserX size={11} />
                  {t('predict_churn')}
                </p>
                <div className="space-y-1">
                  {(!predictions?.churn_risk || predictions.churn_risk.length === 0) && (
                    <p className="text-[12px] text-gray-400">{t('no_churn')}</p>
                  )}
                  {predictions?.churn_risk?.slice(0, 4).map((c: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-[12px]">
                      <span className="text-gray-600 dark:text-gray-300 truncate max-w-[180px]">{c.name}</span>
                      <span className={`font-semibold flex-shrink-0 ${c.risk === 'high' ? 'text-rose-500' : 'text-amber-500'}`}>
                        {c.days_since_last} 天未下单
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Metrics strip */}
      {metrics && (
        <div className="px-5 pb-4 pt-1 grid grid-cols-3 gap-3">
          {[
            { label: lang === 'zh' ? '退款率' : 'Refund rate', value: `${metrics.refund_rate}%`, color: metrics.refund_rate >= 8 ? 'text-rose-500' : 'text-emerald-500' },
            { label: lang === 'zh' ? '断货风险' : 'Stockout', value: `${metrics.stockout_count}`, color: metrics.stockout_count > 0 ? 'text-amber-500' : 'text-emerald-500' },
            { label: lang === 'zh' ? '库存积压' : 'Overstock', value: `${metrics.overstock_count}`, color: metrics.overstock_count > 0 ? 'text-orange-500' : 'text-emerald-500' },
          ].map((m, i) => (
            <div key={i} className="rounded-lg bg-gray-50 dark:bg-gray-800/60 px-3 py-2 text-center">
              <p className={`text-lg font-bold tabular-nums leading-none ${m.color}`}>{m.value}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{m.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* 经验库：处方执行 + 回访沉淀的知识资产（差异化壁垒） */}
      {experiences && (
        <div className="px-5 pb-4">
          <div className="rounded-xl border border-amber-100 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/[0.06] px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <BookOpen size={13} className="text-amber-500" />
              <span className="text-[12px] font-bold text-amber-700 dark:text-amber-300">{t('exp_title')}</span>
              <span className="text-[11px] text-gray-400 dark:text-gray-500">{experiences.total} {t('exp_lessons')}</span>
              <span className="h-px flex-1 bg-amber-100 dark:bg-amber-500/10" />
              {experiences.items.length > 0 && (
                <button
                  onClick={() => setShowExp(s => !s)}
                  className="text-gray-400 hover:text-amber-500 transition-colors"
                  aria-expanded={showExp}
                >
                  {showExp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              )}
            </div>
            {experiences.items.length === 0 ? (
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">{t('exp_empty')}</p>
            ) : (
              <div className={`grid transition-all duration-300 ease-in-out ${showExp ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                  <div className="space-y-1.5 mt-2">
                    {experiences.items.map(e => (
                      <div key={e.id} className="flex items-start gap-2 text-[12px]">
                        <span className={`mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                          e.outcome === 'improved'
                            ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : e.outcome === 'not_improved'
                              ? 'bg-rose-100 dark:bg-rose-500/15 text-rose-500'
                              : 'bg-gray-100 dark:bg-gray-700/50 text-gray-500'
                        }`}>
                          {e.outcome === 'improved' ? t('hit_outcome') : e.outcome === 'not_improved' ? t('miss_outcome') : '—'}
                        </span>
                        <div className="min-w-0">
                          <p className="text-gray-600 dark:text-gray-300 truncate">{e.title}</p>
                          {e.lesson && <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{e.lesson}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
