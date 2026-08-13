import React, { useEffect, useState, useCallback } from 'react';
import { Plus, RefreshCw, Wallet, QrCode, CheckCircle2 } from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/components/ui/Toast';
import { usePageT, type Lang } from '@/i18n';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { paymentService } from '@/services/payments';
import type { Payment, PaymentCreateResponse, PaymentMethod } from '@/services/payments';
import { orderService } from '@/services/ecommerce';
import type { Order } from '@/types/ecommerce';
import { extractErrorMessage } from '@/services/api';

const D = {
  zh: {
    payments_page_title: '收款管理',
    status_pending: '待支付',
    status_paid: '已支付',
    status_failed: '已失败',
    status_refunded: '已退款',
    method_alipay: '支付宝',
    method_wechat: '微信',
    load_failed: '加载失败',
    load_orders_failed: '加载订单失败',
    select_order: '请选择订单',
    select_order_msg: '请先选择需要收款的订单',
    qr_generated: '收款码已生成',
    generate_failed: '生成失败',
    mock_paid: '模拟支付成功',
    paid_confirmed: '订单已确认，收款已到账',
    confirm_failed: '确认失败',
    payments_title: '收款管理',
    payments_subtitle: '支付宝 / 微信扫码收款（沙箱模拟）',
    refresh: '刷新',
    create_payment: '发起收款',
    col_trade_no: '交易号',
    col_order: '订单',
    col_method: '方式',
    col_amount: '金额',
    col_status: '状态',
    col_time: '时间',
    no_payments_title: '暂无收款记录',
    no_payments_desc: '点击「发起收款」生成收款二维码',
    payment_qr_title: '收款二维码',
    select_unpaid_order: '选择订单（未支付）',
    no_unpaid_orders: '暂无未支付的订单',
    payment_method: '收款方式',
    generate_qr: '生成收款码',
    qr_alt: '收款二维码',
    payment_qr_label: '{method}收款码',
    trade_no: '交易号：{no}',
    order: '订单',
    amount: '金额',
    mock_pay_success: '模拟支付成功',
  },
  en: {
    payments_page_title: 'Payments',
    status_pending: 'Pending',
    status_paid: 'Paid',
    status_failed: 'Failed',
    status_refunded: 'Refunded',
    method_alipay: 'Alipay',
    method_wechat: 'WeChat',
    load_failed: 'Load Failed',
    load_orders_failed: 'Failed to load orders',
    select_order: 'Select an Order',
    select_order_msg: 'Please select an unpaid order to collect payment',
    qr_generated: 'QR Code Generated',
    generate_failed: 'Generation Failed',
    mock_paid: 'Mock Payment Succeeded',
    paid_confirmed: 'Order confirmed and payment received',
    confirm_failed: 'Confirmation Failed',
    payments_title: 'Payments',
    payments_subtitle: 'Collect payments via Alipay / WeChat QR codes (sandbox simulation)',
    refresh: 'Refresh',
    create_payment: 'Create Payment',
    col_trade_no: 'Trade No.',
    col_order: 'Order',
    col_method: 'Method',
    col_amount: 'Amount',
    col_status: 'Status',
    col_time: 'Time',
    no_payments_title: 'No Payments Yet',
    no_payments_desc: 'Click "Create Payment" to generate a payment QR code',
    payment_qr_title: 'Payment QR Code',
    select_unpaid_order: 'Select Order (Unpaid)',
    no_unpaid_orders: 'No unpaid orders',
    payment_method: 'Payment Method',
    generate_qr: 'Generate QR Code',
    qr_alt: 'Payment QR Code',
    payment_qr_label: '{method} QR code',
    trade_no: 'Trade No: {no}',
    order: 'Order',
    amount: 'Amount',
    mock_pay_success: 'Mock Payment Success',
  },
} as Record<Lang, Record<string, string>>;

const getStatusLabels = (t: (key: string, fallback?: string) => string) => ({
  pending: t('status_pending'),
  paid: t('status_paid'),
  failed: t('status_failed'),
  refunded: t('status_refunded'),
});

const getMethodLabels = (t: (key: string, fallback?: string) => string) => ({
  alipay: t('method_alipay'),
  wechat: t('method_wechat'),
});

const statusBadgeClass: Record<Payment['status'], string> = {
  pending:
    'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
  paid: 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
  failed: 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
  refunded:
    'bg-gray-50 text-gray-600 border border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
};

const methodBadgeClass: Record<PaymentMethod, string> = {
  alipay: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
  wechat: 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
};

export const Payments: React.FC = () => {
  const t = usePageT(D);
  usePageTitle(t('payments_page_title'));

  const { currentWorkspace } = useWorkspace();
  const slug = currentWorkspace?.slug || '';
  const { addToast } = useToast();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal state
  const [showModal, setShowModal] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('alipay');
  const [creating, setCreating] = useState(false);

  // QR stage state
  const [qrPayload, setQrPayload] = useState<PaymentCreateResponse | null>(null);
  const [confirming, setConfirming] = useState(false);

  const statusLabels = getStatusLabels(t);
  const methodLabels = getMethodLabels(t);

  const fetchPayments = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const result = await paymentService.listPayments(slug);
      setPayments(result);
    } catch (err) {
      addToast('error', t('load_failed'), extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [slug, addToast]);

  const fetchUnpaidOrders = useCallback(async () => {
    if (!slug) return;
    setOrdersLoading(true);
    try {
      const result = await orderService.getOrders(slug, { page_size: '50' });
      // Only unpaid orders can receive a new payment
      const unpaid = result.filter((o) => o.payment_status === 'unpaid');
      setOrders(unpaid);
      if (unpaid.length > 0 && !selectedOrderId) {
        setSelectedOrderId(unpaid[0].id);
      }
    } catch (err) {
      addToast('error', t('load_orders_failed'), extractErrorMessage(err));
    } finally {
      setOrdersLoading(false);
    }
  }, [slug, addToast, selectedOrderId]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const openCreateModal = () => {
    setQrPayload(null);
    setSelectedOrderId('');
    setMethod('alipay');
    setShowModal(true);
    fetchUnpaidOrders();
  };

  const handleCreate = async () => {
    if (!selectedOrderId) {
      addToast('warning', t('select_order'), t('select_order_msg'));
      return;
    }
    setCreating(true);
    try {
      const result = await paymentService.createPayment(slug, {
        order_id: selectedOrderId,
        method,
      });
      setQrPayload(result);
      addToast('success', t('qr_generated'));
    } catch (err) {
      addToast('error', t('generate_failed'), extractErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const handleConfirm = async () => {
    if (!qrPayload) return;
    setConfirming(true);
    try {
      await paymentService.confirmPayment(slug, qrPayload.trade_no);
      addToast('success', t('mock_paid'), t('paid_confirmed'));
      setShowModal(false);
      setQrPayload(null);
      fetchPayments();
    } catch (err) {
      addToast('error', t('confirm_failed'), extractErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  };

  const formatPrice = (price: number) => `¥${price.toFixed(2)}`;
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-gray-100">{t('payments_title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('payments_subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchPayments}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={t('refresh')}
            aria-label={t('refresh')}
          >
            <RefreshCw size={16} />
          </button>
          <Button variant="primary" leftIcon={<Plus size={16} />} onClick={openCreateModal}>
            {t('create_payment')}
          </Button>
        </div>
      </div>

      {/* Payment list */}
      <Card>
        {loading ? (
          <div className="overflow-x-auto animate-fade-in">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 text-left">
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_trade_no')}</th>
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_order')}</th>
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_method')}</th>
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_amount')}</th>
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_status')}</th>
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_time')}</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50 dark:border-gray-800">
                    <td className="py-3 px-4"><div className="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></td>
                    <td className="py-3 px-4"><div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></td>
                    <td className="py-3 px-4"><div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" /></td>
                    <td className="py-3 px-4"><div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></td>
                    <td className="py-3 px-4"><div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" /></td>
                    <td className="py-3 px-4"><div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : payments.length === 0 ? (
          <EmptyState
            icon={<Wallet size={40} />}
            title={t('no_payments_title')}
            description={t('no_payments_desc')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 text-left">
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_trade_no')}</th>
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_order')}</th>
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_method')}</th>
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_amount')}</th>
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_status')}</th>
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_time')}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-3 px-4 font-mono text-xs text-gray-600 dark:text-gray-400">
                      {payment.provider_trade_no}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-gray-500">
                      {payment.order_id?.slice(0, 8)}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${methodBadgeClass[payment.method] || methodBadgeClass.alipay}`}>
                        {methodLabels[payment.method] || payment.method}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-gray-100">
                      {formatPrice(payment.amount)}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass[payment.status] || statusBadgeClass.pending}`}>
                        {statusLabels[payment.status] || payment.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-400 text-xs">
                      {payment.paid_at ? formatDate(payment.paid_at) : formatDate(payment.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create payment modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={qrPayload ? t('payment_qr_title') : t('create_payment')}
        size="md"
      >
        {!qrPayload ? (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('select_unpaid_order')}
              </label>
              {ordersLoading ? (
                <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
              ) : orders.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">{t('no_unpaid_orders')}</p>
              ) : (
                <select
                  value={selectedOrderId}
                  onChange={(e) => setSelectedOrderId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-slate-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-200"
                >
                  {orders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.order_number} — ¥{Number(order.total || 0).toFixed(2)}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('payment_method')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(['alipay', 'wechat'] as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
                      method === m
                        ? m === 'alipay'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                          : 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    {methodLabels[m]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleCreate} isLoading={creating} leftIcon={<QrCode size={16} />}>
                {t('generate_qr')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col items-center">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                <img
                  src={qrPayload.qr}
                  alt={t('qr_alt')}
                  width={200}
                  height={200}
                  className="w-[200px] h-[200px] object-contain"
                  onError={(e) => {
                    // Fallback: hide broken image, trade_no text below remains visible
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                {t('payment_qr_label').replace('{method}', methodLabels[qrPayload.method])}
              </p>
              <p className="mt-1 font-mono text-xs text-gray-400 select-all">
                {t('trade_no').replace('{no}', qrPayload.trade_no)}
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{t('order')}</span>
                <span className="font-mono text-xs">{qrPayload.order_id?.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t('amount')}</span>
                <span className="font-medium text-slate-900 dark:text-gray-100">
                  {formatPrice(qrPayload.amount)}
                </span>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="primary"
                onClick={handleConfirm}
                isLoading={confirming}
                leftIcon={<CheckCircle2 size={16} />}
                className="!bg-gradient-to-r !from-green-600 !to-green-700 hover:!from-green-700 hover:!to-green-800"
              >
                {t('mock_pay_success')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
