import api from './api';

// ============================================================
// 支付类型定义 (与后端 schemas/payment.py 对齐)
// ============================================================

export type PaymentMethod = 'alipay' | 'wechat';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface Payment {
  id: string;
  workspace_id: string;
  order_id: string;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  provider_trade_no: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentCreateRequest {
  order_id: string;
  method: PaymentMethod;
}

export interface PaymentCreateResponse extends Payment {
  /** Mock QR image URL (display via <img src={qr}>) */
  qr: string;
  /** Same as provider_trade_no — used by the confirm endpoint */
  trade_no: string;
}

/** Extract items from paginated response, or return data as-is if already an array. */
function extractItems<T>(data: unknown): T {
  if (Array.isArray(data)) return data as T;
  if (data && typeof data === 'object' && 'items' in data) {
    const items = (data as { items: unknown }).items;
    return (Array.isArray(items) ? items : []) as T;
  }
  return ([] as unknown) as T;
}

export const paymentService = {
  async listPayments(workspaceSlug: string): Promise<Payment[]> {
    const response = await api.get<Payment[]>(
      `/workspaces/${workspaceSlug}/payments`
    );
    return extractItems<Payment[]>(response.data);
  },

  async createPayment(
    workspaceSlug: string,
    data: PaymentCreateRequest
  ): Promise<PaymentCreateResponse> {
    const response = await api.post<PaymentCreateResponse>(
      `/workspaces/${workspaceSlug}/payments`,
      data
    );
    return response.data;
  },

  async confirmPayment(
    workspaceSlug: string,
    tradeNo: string
  ): Promise<Payment> {
    const response = await api.post<{ payment?: Payment } & Payment>(
      `/workspaces/${workspaceSlug}/payments/${tradeNo}/confirm`
    );
    return response.data.payment ?? response.data;
  },
};
