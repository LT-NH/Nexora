import React, { useEffect, useState } from 'react';
import {
  Bot, Sparkles, ShieldCheck, CheckCircle2, Clock, RefreshCw, ChevronDown, ChevronUp, BookOpen, AlertTriangle, Zap, Lock,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';
import { usePageT, useI18n } from '@/i18n';

const D = {
  zh: {
    title: '巡店 Agent',
    badge: '自主当班',
    run: '让 Agent 当班',
    running: '巡店中…',
    last_run: '上次巡店',
    never: 'Agent 还没当过班，点右上按钮让它跑一次',
    status_done: '已完成',
    status_awaiting: '待你确认',
    pending_title: '待你确认的动作（影响营收，需你拍板）',
    confirm_btn: '确认执行',
    executed_title: 'Agent 已自主处理',
    autonomous: '自主决策',
    guidance_title: '引导建议',
    skipped_title: '因限额未执行',
    policy_title: 'Agent 权限边界',
    policy_hint: 'Agent 只能在绿色动作上自主决策；红色动作永远需要你确认',
    used: '今日已用',
    exp_title: '经验库',
    exp_hint: '每条经验 = 一次「建议 → 执行 → 回访」闭环的真实结果',
    hit: '近期命中',
    no_exp: '经验库还是空的——Agent 执行并回访后会自动沉淀',
    load_fail: '加载失败',
    run_ok: 'Agent 巡店完成',
    confirm_ok: '已确认执行',
    confirm_fail: '确认执行失败',
  },
  en: {
    title: 'Store Sentinel Agent',
    badge: 'Autonomous',
    run: 'Run patrol',
    running: 'Patrolling…',
    last_run: 'Last patrol',
    never: 'Agent has not run yet — click the button to dispatch it',
    status_done: 'Completed',
    status_awaiting: 'Awaiting your confirm',
    pending_title: 'Actions awaiting confirm (revenue impact — your call)',
    confirm_btn: 'Confirm & execute',
    executed_title: 'Handled autonomously',
    autonomous: 'Self-decided',
    guidance_title: 'Guidance',
    skipped_title: 'Skipped (daily cap)',
    policy_title: 'Agent permission boundary',
    policy_hint: 'The Agent may self-decide only on green actions; red ones always need you',
    used: 'Used today',
    exp_title: 'Experience Base',
    exp_hint: 'Each entry = a real closed loop of suggest → execute → follow-up',
    hit: 'Recent hits',
    no_exp: 'Experience base is empty — it grows as the Agent executes & follows up',
    load_fail: 'Load failed',
    run_ok: 'Patrol finished',
    confirm_ok: 'Confirmed & executed',
    confirm_fail: 'Confirm failed',
  },
};

interface PolicyRow {
  action_type: string;
  risk: string;
  auto_allowed: boolean;
  side_effect: boolean;
  daily_cap: number | null;
  note: string;
  used_today?: number;
  remaining_today?: number | null;
}

interface AgentReport {
  has_report: boolean;
  task_id?: string;
  status?: string;
  conclusion?: string;
  summary?: {
    guidance?: { action: string; args: Record<string, unknown>; reason?: string }[];
    executed?: { tool: string; action_type?: string; risk?: string; autonomous?: boolean; args: Record<string, unknown>; result: Record<string, unknown>; reason?: string }[];
    pending?: { tool: string; action_type?: string; risk?: string; why_confirm?: string; args: Record<string, unknown>; reason?: string }[];
    skipped?: { action: string; reason: string; rate_limited?: boolean }[];
    autonomy?: { auto_executed: number; awaiting_confirm: number; rate_limited: number };
    generated_at?: string;
  };
  created_at?: string;
}

interface ExperienceItem {
  id: string;
  title: string;
  outcome: string;
  result_before: number | null;
  result_after: number | null;
  lesson?: string | null;
}

const ACTION_LABEL: Record<string, { zh: string; en: string }> = {
  refund_check: { zh: '退款核查', en: 'Refund check' },
  restock: { zh: '补货引导', en: 'Restock' },
  create_coupon: { zh: '发放优惠券', en: 'Issue coupon' },
  clearance: { zh: '滞销清仓', en: 'Clearance' },
  price_adjust: { zh: '调整售价', en: 'Price adjust' },
  keep: { zh: '不干预', en: 'No-op' },
};

const fmtTime = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const utcMs = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
  return new Date(utcMs).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const outcomeBadge = (outcome: string, lang: string) => {
  if (outcome === 'improved') return { text: lang === 'zh' ? '命中' : 'Hit', cls: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' };
  if (outcome === 'not_improved') return { text: lang === 'zh' ? '未命中' : 'Miss', cls: 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400' };
  return { text: lang === 'zh' ? '观察中' : 'Watching', cls: 'bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400' };
};

export const StoreAgentPanel: React.FC<{ slug: string }> = ({ slug }) => {
  const t = usePageT(D);
  const { lang } = useI18n();
  const { addToast } = useToast();
  const [report, setReport] = useState<AgentReport | null>(null);
  const [exps, setExps] = useState<{ total: number; recent_improved: number; items: ExperienceItem[] } | null>(null);
  const [policies, setPolicies] = useState<PolicyRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [showExp, setShowExp] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);

  const load = async () => {
    try {
      const [r, e, p] = await Promise.all([
        api.get(`/workspaces/${slug}/ai/agent/report`, { timeout: 10000 }),
        api.get(`/workspaces/${slug}/ai/experiences?limit=5`, { timeout: 10000 }),
        api.get(`/workspaces/${slug}/ai/agent/policy`, { timeout: 10000 }),
      ]);
      setReport(r.data);
      setExps(e.data);
      setPolicies(p.data?.policies ?? null);
    } catch {
      /* 静默：Agent 面板失败不影响工作台 */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug]);

  const runPatrol = async () => {
    setRunning(true);
    try {
      await api.post(`/workspaces/${slug}/ai/agent/run-store-check`, {}, { timeout: 180000 });
      addToast('success', t('run_ok'), '');
      await load();
    } catch {
      addToast('error', t('load_fail'), '');
    } finally {
      setRunning(false);
    }
  };

  const confirmTask = async () => {
    if (!report?.task_id) return;
    setConfirming(report.task_id);
    try {
      await api.post(`/workspaces/${slug}/ai/agent/tasks/${report.task_id}/confirm`, {}, { timeout: 60000 });
      addToast('success', t('confirm_ok'), '');
      await load();
    } catch {
      addToast('error', t('confirm_fail'), '');
    } finally {
      setConfirming(null);
    }
  };

  const pending = report?.summary?.pending || [];
  const executed = report?.summary?.executed || [];
  const guidance = report?.summary?.guidance || [];
  const skipped = report?.summary?.skipped || [];
  const awaiting = report?.status === 'awaiting_confirm' && pending.length > 0;
  const aLabel = (a?: string) => (a && ACTION_LABEL[a] ? ACTION_LABEL[a][lang === 'zh' ? 'zh' : 'en'] : a || '');

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-sm shadow-violet-500/20">
            <Bot size={17} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-gray-100 leading-none">{t('title')}</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400 leading-tight flex-shrink-0">
                {t('badge')}
              </span>
            </div>
            <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-1">
              {report?.has_report ? `${t('last_run')} · ${fmtTime(report.created_at)}` : t('never')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {report?.has_report && (
            <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${awaiting ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'}`}>
              {awaiting ? t('status_awaiting') : t('status_done')}
            </span>
          )}
          <button
            onClick={runPatrol}
            disabled={running || loading}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white transition-colors shadow-sm shadow-violet-500/20"
          >
            <RefreshCw size={13} className={running ? 'animate-spin' : ''} />
            {running ? t('running') : t('run')}
          </button>
        </div>
      </div>

      {loading && !report ? (
        <div className="px-5 py-6 animate-pulse space-y-2">
          <div className="h-4 w-2/3 bg-gray-100 dark:bg-gray-700/60 rounded" />
          <div className="h-4 w-1/2 bg-gray-100 dark:bg-gray-700/60 rounded" />
        </div>
      ) : (
        <div className="px-5 pb-5 pt-2 space-y-3">
          {/* 结论 */}
          {report?.has_report && report.conclusion && (
            <div className="rounded-xl border border-violet-100 dark:border-violet-500/20 bg-violet-50/50 dark:bg-violet-500/[0.06] px-4 py-3 flex items-start gap-2.5">
              <Sparkles size={14} className="text-violet-500 mt-0.5 flex-shrink-0" />
              <p className="text-[13px] leading-relaxed text-slate-700 dark:text-gray-200">{report.conclusion}</p>
            </div>
          )}

          {/* 待确认（高风险动作） */}
          {awaiting && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/[0.07] overflow-hidden">
              <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400" />
                <p className="text-[12px] font-bold text-amber-700 dark:text-amber-400 tracking-wide">{t('pending_title')}</p>
              </div>
              {pending.map((p, i) => (
                <div key={i} className="px-4 py-2 flex items-center justify-between gap-3 border-t border-amber-100/60 dark:border-amber-500/10">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-slate-800 dark:text-gray-100 truncate">
                      {p.tool === 'update_product_price'
                        ? `${aLabel(p.action_type || 'price_adjust')} → ¥${(p.args as { new_price?: number }).new_price}`
                        : p.tool === 'create_coupon'
                          ? `发券 → ¥${(p.args as { value?: number }).value} 满 ¥${(p.args as { min_amount?: number }).min_amount ?? 99} 减`
                          : p.tool}
                    </p>
                    {p.reason && <p className="text-[12px] text-gray-500 dark:text-gray-400 truncate">{p.reason}</p>}
                    {p.why_confirm && (
                      <p className="text-[11px] text-amber-600/80 dark:text-amber-400/70 truncate mt-0.5">{p.why_confirm}</p>
                    )}
                  </div>
                  <button
                    onClick={confirmTask}
                    disabled={confirming === report?.task_id}
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white transition-colors flex-shrink-0"
                  >
                    {confirming === report?.task_id ? '…' : t('confirm_btn')}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 自主执行 */}
          {executed.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Zap size={13} className="text-emerald-500" />
                <p className="text-[12px] font-bold text-gray-600 dark:text-gray-300 tracking-wide">{t('executed_title')}</p>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  {t('autonomous')}
                </span>
              </div>
              <div className="space-y-1.5">
                {executed.map((ex, i) => {
                  const r = ex.result || {};
                  return (
                    <div key={i} className="rounded-lg bg-emerald-50/60 dark:bg-emerald-500/[0.06] px-3.5 py-2 text-[12.5px] text-gray-600 dark:text-gray-300 flex items-center gap-2">
                      <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />
                      <span className="truncate">
                        {ex.tool === 'update_product_price'
                          ? `已调价 ${r.product}：¥${r.old_price} → ¥${r.new_price}${r.shopify_synced ? '（已同步 Shopify）' : ''}`
                          : ex.tool === 'clearance_price'
                            ? `已清仓 ${r.product}：¥${r.old_price} → ¥${r.new_price}（-${r.drop_pct}%，可调回）${r.shopify_synced ? ' · 已同步 Shopify' : ''}`
                            : ex.tool === 'create_coupon'
                              ? `已建券 ${r.code}（¥${r.value} 满 ¥${r.min_amount} 减）`
                              : ex.tool}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 因限额未执行 */}
          {skipped.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Lock size={13} className="text-gray-400" />
                <p className="text-[12px] font-bold text-gray-500 dark:text-gray-400 tracking-wide">{t('skipped_title')}</p>
              </div>
              <div className="space-y-1.5">
                {skipped.map((s, i) => (
                  <div key={i} className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3.5 py-2 text-[12px] text-gray-500 dark:text-gray-400 truncate">
                    {aLabel(s.action)} · {s.reason}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 引导建议 */}
          {guidance.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <ShieldCheck size={13} className="text-sky-500" />
                <p className="text-[12px] font-bold text-gray-600 dark:text-gray-300 tracking-wide">{t('guidance_title')}</p>
              </div>
              <div className="space-y-1.5">
                {guidance.map((g, i) => {
                  // 清洗 qwen 可能带入的原始 uuid 前缀，只展示可读商品信息
                  const raw = String((g.args as { product?: string }).product ?? '');
                  const readable = raw.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[:：]?\s*/i, '').trim();
                  return (
                    <div key={i} className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3.5 py-2 text-[12.5px] text-gray-600 dark:text-gray-300 flex items-center gap-2">
                      <Clock size={12} className="text-sky-500 flex-shrink-0" />
                      <span className="truncate">
                        {g.action === 'restock' ? `补货：${readable || '低库存商品'}` : g.action === 'refund_check' ? '退款异常核查' : g.action}
                        {g.reason ? ` · ${g.reason}` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Agent 权限边界（可折叠） */}
          {policies && policies.length > 0 && (
            <div className="rounded-xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/70 dark:bg-gray-800/40 overflow-hidden">
              <button onClick={() => setShowPolicy(s => !s)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left">
                <ShieldCheck size={13} className="text-violet-500" />
                <span className="text-[12px] font-bold text-gray-600 dark:text-gray-300 tracking-wide">{t('policy_title')}</span>
                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  {policies.filter(p => p.auto_allowed).length} 可自主
                </span>
                <span className="h-px flex-1 bg-gray-100 dark:bg-gray-700/60" />
                {showPolicy ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </button>
              {showPolicy && (
                <div className="px-4 pb-3 space-y-1.5">
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">{t('policy_hint')}</p>
                  {policies.filter(p => p.action_type !== 'keep').map((p) => {
                    const tone = p.auto_allowed
                      ? 'bg-emerald-50 dark:bg-emerald-500/[0.08] border-emerald-100 dark:border-emerald-500/20'
                      : 'bg-rose-50/60 dark:bg-rose-500/[0.07] border-rose-100 dark:border-rose-500/20';
                    return (
                      <div key={p.action_type} className={`rounded-lg border px-3 py-2 ${tone}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {p.auto_allowed
                              ? <Zap size={11} className="text-emerald-500 flex-shrink-0" />
                              : <Lock size={11} className="text-rose-500 flex-shrink-0" />}
                            <span className="text-[12.5px] font-medium text-slate-700 dark:text-gray-200 truncate">
                              {aLabel(p.action_type)}
                            </span>
                          </div>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                            p.auto_allowed
                              ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                              : 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400'
                          }`}>
                            {p.auto_allowed ? 'Agent 可自主' : '需你确认'}
                          </span>
                        </div>
                        <p className="text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{p.note}</p>
                        {p.auto_allowed && p.daily_cap !== null && (
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 tabular-nums">
                            {t('used')} {p.used_today ?? 0}/{p.daily_cap}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 经验库（可折叠） */}
          <div className="rounded-xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/70 dark:bg-gray-800/40 overflow-hidden">
            <button onClick={() => setShowExp(s => !s)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left">
              <BookOpen size={13} className="text-violet-500" />
              <span className="text-[12px] font-bold text-gray-600 dark:text-gray-300 tracking-wide">{t('exp_title')}</span>
              {exps && exps.total > 0 && (
                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400">
                  {exps.total} 条 · {t('hit')} {exps.recent_improved}
                </span>
              )}
              <span className="h-px flex-1 bg-gray-100 dark:bg-gray-700/60" />
              {showExp ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
            </button>
            {showExp && (
              <div className="px-4 pb-3 space-y-1.5">
                {!exps || exps.items.length === 0 ? (
                  <p className="text-[12px] text-gray-400">{t('no_exp')}</p>
                ) : (
                  <>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">{t('exp_hint')}</p>
                    {exps.items.slice(0, 3).map((e) => {
                      const badge = outcomeBadge(e.outcome, lang);
                      return (
                        <div key={e.id} className="rounded-lg bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[12.5px] font-medium text-slate-700 dark:text-gray-200 truncate">{e.title}</p>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${badge.cls}`}>{badge.text}</span>
                          </div>
                          {e.result_before !== null && e.result_after !== null && (
                            <p className="text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5 tabular-nums">
                              指标 {e.result_before} → {e.result_after}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
