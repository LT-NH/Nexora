import api from '@/services/api';

export interface AIChatResult {
  intent: string;
  answer_text: string;
  data: Array<Record<string, unknown>>;
  chart_type: 'bar' | 'line' | 'number' | 'list' | null;
  suggestion?: string;
}

export interface AIWeeklySummary {
  summary: string;
  report_data: Record<string, unknown>;
}

export interface AIPricingItem {
  product_id: string;
  name: string;
  current_price: number;
  suggestion: string;
  reason: string;
}

/**
 * AI 智能助手服务。
 *
 * 注意：后端 AI 路由统一挂载在 `/workspaces/{slug}/ai` 前缀下（见
 * backend/app/api/ai.py 的 router 定义），因此这里需要传入工作区 slug，
 * 与仓库内其它 AI 端点（如 analyze-sales、chat/stream）的调用方式保持一致。
 */
export const aiService = {
  /** 自然语言 BI 问答（支持多轮历史上下文） */
  chat: async (
    workspaceSlug: string,
    question: string,
    history?: { role: 'user' | 'assistant'; content: string }[]
  ): Promise<AIChatResult> => {
    const res = await api.post<AIChatResult>(`/workspaces/${workspaceSlug}/ai/chat`, {
      question,
      history: history ?? [],
    });
    return res.data;
  },

  /** AI 周报摘要 */
  weeklySummary: async (workspaceSlug: string): Promise<AIWeeklySummary> => {
    const res = await api.get<AIWeeklySummary>(`/workspaces/${workspaceSlug}/ai/weekly-summary`);
    return res.data;
  },

  /** AI 定价建议 */
  pricing: async (workspaceSlug: string): Promise<{ items: AIPricingItem[] }> => {
    const res = await api.get<{ items: AIPricingItem[] }>(`/workspaces/${workspaceSlug}/ai/pricing`);
    return res.data;
  },
};
