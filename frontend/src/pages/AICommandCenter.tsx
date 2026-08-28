import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sparkles, TrendingUp, Bot, ShieldAlert, Tag, Radio, Send, Check, Loader2, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '@/hooks/useWorkspace';
import { AiDecisionPanel } from '@/components/AiDecisionPanel';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';

const translations = {
  zh: {
    title: 'AI 经营指挥台',
    subtitle: '对 AI 下指令，它调用真实工具完成经营操作——可审计、可回滚',
    center: '指挥中心',
    center_sub: '今日 AI 结论 · 一键执行 · 回访验证',
    agent_title: '对话式指挥',
    agent_sub: '输入自然语言指令，AI 拆解任务并调用真实工具执行',
    agent_placeholder: '例如：把库存积压的商品降价 10% / 给高价值客户建一张券',
    send: '执行',
    auto_label: '自动执行（跳过确认）',
    thinking: 'AI 正在拆解任务…',
    pending: '等待确认',
    confirm: '确认执行',
    tasks_title: '任务历史',
    step_pending: '待确认',
    step_done: '完成',
    step_failed: '失败',
    forecast_title: '销售预测',
    forecast_sub: '未来 7 天（千问基于真实订单）',
    pricing_title: 'AI 定价雷达',
    pricing_sub: '逐商品差异化定价建议',
    risk_title: '风险雷达',
    risk_sub: '缺货与客户流失（千问解读）',
    chat_cta: '与 AI 经营顾问对话',
    no_risk: '暂无风险项',
  },
  en: {
    title: 'AI Command Center',
    subtitle: 'Give AI orders — it calls real tools to run your business. Auditable, reversible',
    center: 'Command Center',
    center_sub: 'Today\'s AI conclusions · one-click execute · follow-up loop',
    agent_title: 'Conversational Command',
    agent_sub: 'Type natural language — AI decomposes tasks and calls real tools',
    agent_placeholder: 'e.g. Discount overstocked items by 10% / Create a coupon for VIPs',
    send: 'Run',
    auto_label: 'Auto execute (skip confirm)',
    thinking: 'AI is decomposing the task…',
    pending: 'Awaiting confirmation',
    confirm: 'Confirm & Execute',
    tasks_title: 'Task History',
    step_pending: 'Pending',
    step_done: 'Done',
    step_failed: 'Failed',
    forecast_title: 'Sales Forecast',
    forecast_sub: 'Next 7 days (Qwen on real orders)',
    pricing_title: 'AI Pricing Radar',
    pricing_sub: 'Per-product differentiated pricing',
    risk_title: 'Risk Radar',
    risk_sub: 'Stockout & churn (Qwen interpreted)',
    chat_cta: 'Talk to AI Advisor',
    no_risk: 'No risks detected',
  },
};

interface ChatMsg {
  role: 'user' | 'agent';
  text: string;
  steps?: any[];
  status?: string;
  task_id?: string;
}

export const AICommandCenter: React.FC = () => {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const slug = currentWorkspace?.slug || '';
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [sales, setSales] = useState<any>(null);
  const [pricing, setPricing] = useState<any[]>([]);
  const [predictions, setPredictions] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [autoMode, setAutoMode] = useState(false);
  const [running, setRunning] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem('nexora_lang') === 'en') setLang('en');
    } catch { /* ignore */ }
  }, []);
  const t = translations[lang];

  const fetchData = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const [salesRes, pricingRes, predRes, tasksRes] = await Promise.allSettled([
        api.post(`/workspaces/${slug}/ai/analyze-sales`, { period: '30d' }, { timeout: 60000 }),
        api.get(`/workspaces/${slug}/ai/pricing`, { timeout: 60000 }),
        api.get(`/workspaces/${slug}/ai/predictions`, { timeout: 60000 }),
        api.get(`/workspaces/${slug}/ai/agent/tasks`, { timeout: 15000 }),
      ]);
      if (salesRes.status === 'fulfilled') setSales(salesRes.value.data);
      if (pricingRes.status === 'fulfilled') setPricing(pricingRes.value.data?.items || []);
      if (predRes.status === 'fulfilled') setPredictions(predRes.value.data);
      if (tasksRes.status === 'fulfilled') setTasks(tasksRes.value.data?.tasks || []);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const runCommand = async (instruction: string, auto: boolean) => {
    if (!instruction.trim() || running) return;
    setMessages((m) => [...m, { role: 'user', text: instruction }]);
    setInput('');
    setRunning(true);
    try {
      const res: any = await api.post(
        `/workspaces/${slug}/ai/agent/command`,
        { instruction, auto },
        { timeout: 180000 },
      );
      const d = res.data;
      setMessages((m) => [...m, { role: 'agent', text: d.reply, steps: d.steps, status: d.status, task_id: d.task_id }]);
      // 刷新任务历史
      api.get(`/workspaces/${slug}/ai/agent/tasks`, { timeout: 15000 })
        .then((r: any) => setTasks(r.data?.tasks || []))
        .catch(() => {});
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'agent', text: `执行失败：${e?.response?.data?.detail || e?.message || '未知错误'}` }]);
    } finally {
      setRunning(false);
    }
  };

  const confirmTask = async (taskId: string) => {
    setRunning(true);
    try {
      const res: any = await api.post(`/workspaces/${slug}/ai/agent/tasks/${taskId}/confirm`, {}, { timeout: 120000 });
      setMessages((m) => m.map((msg) =>
        msg.task_id === taskId
          ? { ...msg, text: res.data.reply, status: res.data.status, steps: msg.steps?.map((s: any) => (s.status === 'pending' ? { ...s, status: 'done' } : s)) }
          : msg,
      ));
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'agent', text: `确认失败：${e?.message || '未知错误'}` }]);
    } finally {
      setRunning(false);
    }
  };

  const fmt = (n: number | undefined) =>
    `¥${(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;

  const riskCount = (predictions?.stockout_7d?.length || 0) + (predictions?.churn_risk?.length || 0);

  const renderSteps = (steps: any[] | undefined) => {
    if (!steps || steps.length === 0) return null;
    return (
      <div className="mt-2 space-y-1.5">
        {steps.map((s: any, i: number) => (
          <div key={i} className={`rounded-lg px-3 py-2 text-xs ${
            s.status === 'pending' ? 'bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800'
              : s.status === 'failed' ? 'bg-red-50 dark:bg-red-900/10'
                : 'bg-emerald-50/70 dark:bg-emerald-900/10'}`}>
            <p className="font-semibold flex items-center gap-1.5">
              {s.status === 'pending' ? (
                <><span className="text-amber-600">{t.step_pending}</span>· {s.tool}</>
              ) : s.status === 'failed' ? (
                <><span className="text-red-600">{t.step_failed}</span>· {s.tool}</>
              ) : (
                <><Check size={11} className="text-emerald-600" /><span className="text-emerald-700 dark:text-emerald-400">{t.step_done}</span>· {s.tool}</>
              )}
            </p>
            {s.tool === 'update_product_price' && s.result?.ok !== false && s.status !== 'pending' && (
              <p className="text-gray-600 dark:text-gray-300 mt-0.5">
                {s.result?.product}: ¥{s.result?.old_price} → ¥{s.result?.new_price}
                {s.result?.shopify_synced ? ' · Shopify 已同步' : ''}
              </p>
            )}
            {s.tool === 'create_coupon' && s.result?.code && s.status !== 'pending' && (
              <p className="text-gray-600 dark:text-gray-300 mt-0.5">
                券码 {s.result.code}（满 {s.result.min_amount} 减 {s.result.value}）{s.result.shopify_synced ? ' · Shopify 已同步' : ''}
              </p>
            )}
            {s.tool === 'search_products' && s.result?.count !== undefined && (
              <p className="text-gray-600 dark:text-gray-300 mt-0.5">
                找到 {s.result.count} 个商品{s.result.products?.slice(0, 3).map((pp: any) => ` · ${pp.name}(¥${pp.price}, 库存${pp.stock})`).join('')}
              </p>
            )}
            {s.status === 'pending' && s.result?.note && (
              <p className="text-amber-700 dark:text-amber-400 mt-0.5">{s.result.note}</p>
            )}
            {s.status === 'failed' && s.result?.error && (
              <p className="text-red-600 mt-0.5">{s.result.error}</p>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 页头 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#111827] dark:text-gray-100 flex items-center gap-2">
            <Sparkles size={20} className="text-[#EB9D2A]" />
            {t.title}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t.subtitle}</p>
        </div>
        <Button variant="primary" leftIcon={<Bot size={15} />} onClick={() => navigate('/ai-chat')}>
          {t.chat_cta}
        </Button>
      </div>

      {/* 对话式 Agent（核心） */}
      <Card title={t.agent_title} subtitle={t.agent_sub}>
        {/* 消息流 */}
        <div className="space-y-4 max-h-[420px] overflow-y-auto mb-4 pr-1">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <Bot size={28} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">{t.agent_placeholder}</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'agent' && (
                <div className="w-7 h-7 rounded-full bg-[#EB9D2A] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot size={14} className="text-white" />
                </div>
              )}
              <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                <div className={`rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === 'user'
                    ? 'bg-[#8B5CF6] text-white rounded-tr-sm'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-tl-sm border border-gray-100 dark:border-gray-700'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  {renderSteps(msg.steps)}
                  {/* pending 确认按钮 */}
                  {msg.status === 'awaiting_confirm' && msg.task_id && (
                    <Button
                      variant="primary"
                      size="sm"
                      className="mt-2"
                      leftIcon={running ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      onClick={() => confirmTask(msg.task_id!)}
                      disabled={running}
                    >
                      {t.confirm}
                    </Button>
                  )}
                </div>
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User size={14} className="text-primary-600" />
                </div>
              )}
            </div>
          ))}
          {running && (
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full bg-[#EB9D2A] flex items-center justify-center flex-shrink-0">
                <Bot size={14} className="text-white" />
              </div>
              <div className="rounded-2xl bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-500 border border-gray-100 dark:border-gray-700">
                <Loader2 size={13} className="animate-spin inline mr-1.5" />
                {t.thinking}
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        {/* 输入区 */}
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runCommand(input, autoMode); } }}
            placeholder={t.agent_placeholder}
            className="flex-1 text-sm rounded-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#EB9D2A]/40"
            disabled={running}
          />
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none flex-shrink-0">
            <input type="checkbox" checked={autoMode} onChange={(e) => setAutoMode(e.target.checked)} className="w-3.5 h-3.5 accent-[#EB9D2A]" />
            {t.auto_label}
          </label>
          <Button
            variant="primary"
            size="sm"
            leftIcon={running ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            onClick={() => runCommand(input, autoMode)}
            disabled={running || !input.trim()}
            className="!bg-[#EB9D2A] hover:!bg-[#CD8407] !shadow-none flex-shrink-0"
          >
            {t.send}
          </Button>
        </div>
      </Card>

      {/* 快捷三卡 + 任务历史 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card title={t.forecast_title} subtitle={t.forecast_sub}>
          {sales ? (
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-[28px] font-extrabold tabular-nums tracking-tight text-[#111827] dark:text-gray-100">
                  {fmt(sales.forecast?.next_7_days)}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                  sales.trend === 'upward' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20'
                    : sales.trend === 'downward' ? 'bg-red-50 text-red-600 dark:bg-red-900/20'
                      : 'bg-gray-100 text-gray-500'}`}>
                  <TrendingUp size={12} />
                  {sales.trend === 'upward' ? '上升' : sales.trend === 'downward' ? '下行' : '平稳'}
                </span>
                <span className="text-xs text-gray-400">置信度 {sales.forecast?.confidence || '-'}</span>
              </div>
              <div className="mt-3 space-y-1.5">
                {(sales.recommendations || []).slice(0, 2).map((r: string, i: number) => (
                  <p key={i} className="text-xs text-gray-600 dark:text-gray-300 flex gap-1.5">
                    <Sparkles size={11} className="text-[#EB9D2A] flex-shrink-0 mt-0.5" />
                    {r}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <p className="py-6 text-sm text-gray-400">{loading ? '…' : '暂无数据'}</p>
          )}
        </Card>

        <Card title={t.pricing_title} subtitle={t.pricing_sub}>
          <div className="space-y-2">
            {pricing.slice(0, 3).map((p: any) => (
              <div key={p.product_id} className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2">
                <p className="text-xs font-semibold text-slate-800 dark:text-gray-200 truncate flex items-center gap-1.5">
                  <Tag size={11} className="text-[#EB9D2A] flex-shrink-0" />
                  {p.name}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{p.suggestion}</p>
              </div>
            ))}
            {pricing.length === 0 && <p className="py-6 text-sm text-gray-400">{loading ? '…' : '暂无'}</p>}
          </div>
        </Card>

        <Card title={t.risk_title} subtitle={t.risk_sub}>
          {predictions ? (
            <div>
              <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  riskCount > 0 ? 'bg-red-50 text-red-600 dark:bg-red-900/20' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20'}`}>
                  <ShieldAlert size={12} />
                  {riskCount > 0 ? `${riskCount} 项风险` : '无风险'}
                </span>
                <span className="text-[11px] text-gray-400">缺货 {predictions.stockout_7d?.length || 0} · 流失 {predictions.churn_risk?.length || 0}</span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                {predictions.note || t.no_risk}
              </p>
            </div>
          ) : (
            <p className="py-6 text-sm text-gray-400">{loading ? '…' : '暂无'}</p>
          )}
        </Card>

        {/* 任务历史 */}
        <Card title={t.tasks_title}>
          <div className="space-y-2 max-h-[240px] overflow-y-auto">
            {tasks.length === 0 && <p className="py-6 text-sm text-gray-400 text-center">暂无任务</p>}
            {tasks.map((task: any) => (
              <div key={task.id} className="rounded-lg border border-gray-100 dark:border-gray-700 px-3 py-2">
                <p className="text-xs font-semibold text-slate-800 dark:text-gray-200 truncate">{task.instruction}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    task.status === 'done' ? 'bg-emerald-50 text-emerald-600'
                      : task.status === 'awaiting_confirm' ? 'bg-amber-50 text-amber-600'
                        : task.status === 'failed' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                    {task.status}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {task.created_at ? new Date(task.created_at.replace('+00:00', 'Z')).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* 今日结论（保留） */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Radio size={14} className="text-[#EB9D2A]" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-gray-100">{t.center}</h2>
          <span className="text-xs text-gray-400">{t.center_sub}</span>
        </div>
        <AiDecisionPanel slug={slug} />
      </div>
    </div>
  );
};
