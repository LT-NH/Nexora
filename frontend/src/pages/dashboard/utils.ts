/**
 * Dashboard 页面用到的纯函数（从 Dashboard.tsx 抽出）。
 */

/** Extract items from paginated response, or return data as-is if already an array.
 *  Falls back to an empty array when the response is not an array or a valid paginated object. */
export function extractItems<T>(data: unknown): T {
  if (Array.isArray(data)) return data as T;
  if (data && typeof data === 'object' && 'items' in data) {
    const items = (data as { items: unknown }).items;
    return (Array.isArray(items) ? items : []) as T;
  }
  return ([] as unknown) as T;
}

/** 按当前时间返回问候语（凌晨/早上/中午/下午/晚上） */
export const timeGreeting = (): string => {
  const h = new Date().getHours();
  if (h < 6) return '凌晨好';
  if (h < 11) return '早上好';
  if (h < 13) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
};

/** 实时事件（WebSocket 推来的原始消息）→ 中文摘要 */
export const eventSummary = (msg: any): { label: string; desc: string; tone: string } => {
  const evt = String(msg?.event || 'notification').toLowerCase();
  const d = msg?.data || {};
  if (evt.includes('order') || evt.includes('payment')) {
    return { label: '订单', desc: `新订单 ${d.order_number || d.id?.slice?.(0, 8) || ''} ￥${d.total ?? d.amount ?? '--'}`, tone: 'bg-emerald-500' };
  }
  if (evt.includes('refund')) {
    return { label: '退款', desc: `退款 ￥${d.amount ?? d.total ?? '--'}${d.reason ? ' · ' + String(d.reason).slice(0, 18) : ''}`, tone: 'bg-rose-500' };
  }
  if (evt.includes('stock') || evt.includes('inventory')) {
    return { label: '库存', desc: `库存告警 ${d.product_name || d.name || ''}`, tone: 'bg-amber-500' };
  }
  const text = typeof msg?.data === 'string' ? msg.data : (d?.message || d?.title || evt);
  return { label: '通知', desc: String(text).slice(0, 40), tone: 'bg-violet-500' };
};
