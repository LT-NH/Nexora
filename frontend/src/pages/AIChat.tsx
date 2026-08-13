import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Bot, Lightbulb, Send, Sparkles } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useWorkspace } from '@/hooks/useWorkspace';
import { extractErrorMessage } from '@/services/api';
import { aiService, type AIChatResult } from '@/services/ai';
import { usePageT, type Lang } from '@/i18n';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  data?: Array<Record<string, unknown>>;
  chartType?: AIChatResult['chart_type'];
  suggestion?: string;
  intent?: string;
  error?: boolean;
  /** AI 回答文本中提取到的实体（用于图表联动高亮） */
  highlight?: string;
}

type T = (key: string, fallback?: string) => string;

const D = {
  zh: {
    page_title: 'AI 智能助手',
    title: 'AI 智能助手',
    subtitle: '自然语言查询营收、订单、退款、热销商品、库存与客户情况',
    welcome: '你好，我是 Nexora AI 智能助手',
    welcome_desc: '你可以问我营收、订单、退款率、热销商品、库存预警或客户情况，我会基于店铺真实数据回答，并附上图表与运营建议。',
    input_placeholder: '输入你的问题，例如：本月营收多少？',
    send: '发送',
    no_workspace: '尚未选择工作区，请先创建或切换工作区后再提问。',
    ai_error_prefix: '抱歉，AI 助手暂时无法回答：',
    q_revenue: '本月营收多少？',
    q_top_products: '哪个商品卖得最好？',
    q_refund_rate: '退款率高的订单',
    q_low_stock: '库存不足预警',
    q_products: '有哪些商品？',
    q_orders: '最近有哪些订单？',
    intent_revenue: '营收分析',
    intent_order_count: '订单统计',
    intent_refund_rate: '退款分析',
    intent_top_products: '热销商品',
    intent_low_stock: '库存预警',
    intent_customer_insight: '客户洞察',
    intent_churn: '流失预警',
    intent_default: '综合概览',
    h_name: '商品',
    h_label: '指标',
    h_value: '数值',
    h_stock: '当前库存',
    h_threshold: '预警线',
    h_revenue: '营收',
    h_quantity: '销量',
    h_product_id: '商品 ID',
    h_current_price: '现价',
    h_suggestion: '建议',
    h_reason: '原因',
  },
  en: {
    page_title: 'AI Assistant',
    title: 'AI Assistant',
    subtitle: 'Ask about revenue, orders, refunds, top products, stock and customers',
    welcome: 'Hi, I\'m the Nexora AI Assistant',
    welcome_desc: 'Ask me about revenue, orders, refund rate, best sellers, stock alerts or customers. I\'ll answer with real store data, charts and insights.',
    input_placeholder: 'Type your question, e.g. What was this month\'s revenue?',
    send: 'Send',
    no_workspace: 'No workspace selected. Please create or switch to a workspace first.',
    ai_error_prefix: 'Sorry, the AI assistant is temporarily unavailable: ',
    q_revenue: 'What was this month\'s revenue?',
    q_top_products: 'Which product sold the best?',
    q_refund_rate: 'Orders with high refund rate',
    q_low_stock: 'Low stock alerts',
    q_products: 'What products are available?',
    q_orders: 'What are the recent orders?',
    intent_revenue: 'Revenue analysis',
    intent_order_count: 'Order statistics',
    intent_refund_rate: 'Refund analysis',
    intent_top_products: 'Top products',
    intent_low_stock: 'Low stock alert',
    intent_customer_insight: 'Customer insights',
    intent_churn: 'Churn alert',
    intent_default: 'Overview',
    h_name: 'Product',
    h_label: 'Metric',
    h_value: 'Value',
    h_stock: 'Stock',
    h_threshold: 'Threshold',
    h_revenue: 'Revenue',
    h_quantity: 'Qty sold',
    h_product_id: 'Product ID',
    h_current_price: 'Price',
    h_suggestion: 'Suggestion',
    h_reason: 'Reason',
  },
} as Record<Lang, Record<string, string>>;

const getQuickPrompts = (t: T): string[] => [
  t('q_revenue'),
  t('q_top_products'),
  t('q_refund_rate'),
  t('q_low_stock'),
  t('q_products'),
  t('q_orders'),
];

const getIntentLabels = (t: T): Record<string, string> => ({
  revenue_summary: t('intent_revenue'),
  order_count: t('intent_order_count'),
  refund_rate: t('intent_refund_rate'),
  top_products: t('intent_top_products'),
  low_stock: t('intent_low_stock'),
  customer_insight: t('intent_customer_insight'),
  churn_customers: t('intent_churn'),
  default: t('intent_default'),
});

const getHeaderLabels = (t: T): Record<string, string> => ({
  name: t('h_name'),
  label: t('h_label'),
  value: t('h_value'),
  stock: t('h_stock'),
  threshold: t('h_threshold'),
  revenue: t('h_revenue'),
  quantity: t('h_quantity'),
  product_id: t('h_product_id'),
  current_price: t('h_current_price'),
  suggestion: t('h_suggestion'),
  reason: t('h_reason'),
});

/** Render an arbitrary cell value as readable text. */
function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'number') {
    return v.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  }
  return String(v);
}

/** Simple div-based chart renderer (no chart library needed). */
/**
 * 从 AI 回答文本中提取与数据匹配的实体名（商品/日期），用于图表联动高亮。
 * 回答里通常直接包含数据 label（如"无线蓝牙耳机"），命中即高亮对应行/条。
 */
const extractHighlight = (answer: string, data: Array<Record<string, unknown>> | undefined): string | undefined => {
  if (!answer || !data || data.length === 0) return undefined;
  const labels = data
    .map((d) => String(d.name || d.label || '').trim())
    .filter((x) => x.length >= 2);
  // 按长度降序匹配，避免"耳机"先于"无线蓝牙耳机"命中
  labels.sort((a, b) => b.length - a.length);
  for (const lb of labels) {
    if (answer.includes(lb)) return lb;
  }
  return undefined;
};

const ChartBlock: React.FC<{
  data: Array<Record<string, unknown>>;
  type: NonNullable<AIChatResult['chart_type']>;
  highlight?: string;
}> = ({ data, type, highlight }) => {
  const t = usePageT(D);
  const headerLabels = getHeaderLabels(t);
  if (type === 'number') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {data.map((d, i) => (
          <div
            key={i}
            className="rounded-xl bg-white/70 dark:bg-gray-800/60 border border-black/[0.04] dark:border-white/[0.06] px-4 py-3"
          >
            <div className="text-xs text-gray-500 dark:text-gray-400">{formatCell(d.label)}</div>
            <div className="mt-1 text-lg font-bold text-slate-900 dark:text-gray-100">
              {formatCell(d.value)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'list') {
    if (data.length === 0) return null;
    const headers = Object.keys(data[0]);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              {headers.map((h) => (
                <th key={h} className="py-2 pr-4 font-medium whitespace-nowrap">
                  {headerLabels[h] || h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const rowText = Object.values(row).join(' ');
              const isHit = highlight && rowText.includes(highlight);
              return (
              <tr key={i} className={`border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors duration-300 ${isHit ? 'bg-primary-50 dark:bg-primary-900/25' : ''}`}>
                {headers.map((h) => (
                  <td key={h} className="py-2 pr-4 text-gray-700 dark:text-gray-200 whitespace-nowrap">
                    {formatCell(row[h])}
                  </td>
                ))}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const values = data.map((d) => Number(d.value) || 0);
  const max = Math.max(...values, 1);

  if (type === 'bar') {
    return (
      <div className="space-y-2">
        {data.map((d, i) => {
          const label = String(d.name || d.label || `#${i + 1}`);
          const value = Number(d.value) || 0;
          const isHit = highlight && label.includes(highlight);
          return (
            <div key={i} className="flex items-center gap-2">
              <span className={`w-24 shrink-0 text-xs truncate ${isHit ? 'font-semibold text-primary-600 dark:text-primary-300' : 'text-gray-600 dark:text-gray-300'}`}>
                {label}
              </span>
              <div className={`flex-1 h-5 rounded-md overflow-hidden ${isHit ? 'ring-2 ring-primary-400/60' : 'bg-gray-100 dark:bg-gray-800'}`}>
                <div
                  className={`h-full rounded-md bg-gradient-to-r from-primary-500 to-primary-600 ${isHit ? 'ai-hit-pulse' : ''}`}
                  style={{ width: `${Math.max(4, (value / max) * 100)}%` }}
                />
              </div>
              <span className="w-14 shrink-0 text-right text-xs font-medium text-gray-600 dark:text-gray-300">
                {formatCell(d.value)}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // line → vertical bars
  const showValues = data.length <= 12;
  return (
    <div className="flex items-end gap-1.5 h-36">
      {data.map((d, i) => {
        const label = String(d.label || `#${i + 1}`);
        const value = Number(d.value) || 0;
        const height = Math.max(3, Math.round((value / max) * 110));
        const isHit = highlight && label.includes(highlight);
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full min-w-0">
            {showValues && (
              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                {value > 0 ? formatCell(value) : ''}
              </span>
            )}
            <div
              className={`w-full max-w-8 rounded-t-md bg-gradient-to-t from-primary-600 to-primary-400 ${isHit ? 'ai-hit-pulse' : ''}`}
              style={{ height }}
            />
            <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate w-full text-center">
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const BotAvatar: React.FC = () => (
  <div className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-violet-600 text-white flex items-center justify-center shadow-sm">
    <Bot size={16} />
  </div>
);

const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const t = usePageT(D);
  const intentLabels = getIntentLabels(t);
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-md bg-gradient-to-br from-primary-600 to-primary-700 text-white text-sm shadow-md whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <BotAvatar />
      <div className="max-w-[85%] space-y-3">
        <div
          className={`px-4 py-3 rounded-2xl rounded-tl-md text-sm text-slate-800 dark:text-gray-100 ${
            message.error
              ? 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50'
              : 'bg-white/80 dark:bg-gray-800/70 border border-black/[0.04] dark:border-white/[0.06]'
          }`}
        >
          {message.intent && !message.error && (
            <span className="inline-block mb-1.5 text-[11px] font-medium text-primary-600 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 rounded-full px-2 py-0.5">
              {intentLabels[message.intent] || message.intent}
            </span>
          )}
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>

        {message.chartType && message.data && message.data.length > 0 && (
          <div className="p-3 rounded-2xl bg-white/70 dark:bg-gray-800/50 border border-black/[0.04] dark:border-white/[0.06]">
            <ChartBlock data={message.data} type={message.chartType} highlight={message.highlight} />
          </div>
        )}

        {message.suggestion && !message.error && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-700/40">
            <Lightbulb size={15} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-200">{message.suggestion}</p>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * AIChat — 自然语言 BI 助手页面。
 *
 * 基于店铺真实数据回答问题，展示 answer_text + 数据表格/柱状图 + 运营建议，
 * 兼容暗色模式。后端端点：POST /api/v1/workspaces/{slug}/ai/chat。
 */
export const AIChat: React.FC = () => {
  const t = usePageT(D);
  const quickPrompts = getQuickPrompts(t);
  usePageTitle(t('page_title'));
  const { currentWorkspace } = useWorkspace();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const msgIdRef = useRef(0);

  // Auto-scroll to the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (text?: string) => {
    const question = (text ?? input).trim();
    if (!question || loading || !currentWorkspace) return;
    setInput('');
    setMessages((prev) => [...prev, { id: ++msgIdRef.current, role: 'user', content: question }]);
    setLoading(true);

    try {
      // 携带最近 6 条历史消息，实现多轮对话记忆
      const history = messages
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await aiService.chat(currentWorkspace.slug, question, history);
      setMessages((prev) => [
        ...prev,
        {
          id: ++msgIdRef.current,
          role: 'assistant',
          content: res.answer_text,
          data: res.data,
          chartType: res.chart_type,
          suggestion: res.suggestion,
          intent: res.intent,
          highlight: extractHighlight(res.answer_text || '', res.data),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: ++msgIdRef.current,
          role: 'assistant',
          content: `${t('ai_error_prefix')}${extractErrorMessage(err)}`,
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl flex flex-col h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-1 pb-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-lg shadow-primary-500/30">
          <Sparkles size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-gray-100">{t('title')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('subtitle')}
          </p>
        </div>
      </div>

      {/* Chat body */}
      <div className="flex-1 min-h-0 flex flex-col bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border border-white/50 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden">
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && !loading && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-10">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-violet-600 text-white flex items-center justify-center shadow-lg">
                <Bot size={28} />
              </div>
              <p className="text-slate-700 dark:text-gray-200 font-medium">
                {t('welcome')}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                {t('welcome_desc')}
              </p>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}

          {loading && (
            <div className="flex items-start gap-3">
              <BotAvatar />
              <div className="glass-card px-4 py-3 rounded-2xl rounded-tl-md">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary-400 animate-bounce" />
                  <span className="w-2 h-2 rounded-full bg-primary-400 animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-primary-400 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick question chips */}
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {quickPrompts.map((q) => (
            <button
              key={q}
              type="button"
              disabled={loading || !currentWorkspace}
              onClick={() => handleSend(q)}
              className="px-3 py-1.5 rounded-full text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800 hover:bg-primary-100 dark:hover:bg-primary-800/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="px-4 pb-4">
          <div className="flex items-end gap-2 bg-white/80 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 focus-within:border-primary-400 dark:focus-within:border-primary-500 transition-colors">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={t('input_placeholder')}
              className="flex-1 resize-none bg-transparent outline-none text-sm text-slate-900 dark:text-gray-100 placeholder:text-gray-400 max-h-28"
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={loading || !currentWorkspace || !input.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-br from-primary-600 to-primary-700 text-white text-sm font-medium hover:from-primary-700 hover:to-primary-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Send size={15} />
              {t('send')}
            </button>
          </div>
          {!currentWorkspace && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertCircle size={13} /> {t('no_workspace')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
