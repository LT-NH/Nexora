/**
 * 批量打单打印视图（原为 Orders.tsx 内联的 ~35 行区块）。
 *
 * 抽成独立组件的两个理由：
 *  1) 它是**全屏浮层**，与订单列表的交互无关，混在 2000 行的页面里很难定位；
 *  2) `print-area` / `print-card` 这套打印样式需要跟窗口打印行为一起维护。
 *
 * ⚠️ 必须走 Portal：Orders 页根节点是 `space-y-6`，会给子元素强加 margin-top，
 * 把 `fixed inset-0` 的打印区挤成 y=24 / 少 24px 高，打印内容会错位。
 */

import React from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Portal } from '@/components/ui/Portal';

interface OrderPrintSheetProps {
  open: boolean;
  orders: any[];
  t: (key: string) => string;
  onClose: () => void;
}

export const OrderPrintSheet: React.FC<OrderPrintSheetProps> = ({ open, orders, t, onClose }) => {
  if (!open) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 bg-white dark:bg-gray-900 overflow-y-auto print-area"
        onClick={onClose}
      >
        <div
          className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 z-10 px-6 py-3 flex items-center justify-between print:hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-base font-bold text-slate-900 dark:text-gray-100">
            {t('batch_print')}（{orders.length} 单）
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => window.print()} leftIcon={<Printer size={13} />}>
              {t('print')}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>{t('close')}</Button>
          </div>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4" onClick={(e) => e.stopPropagation()}>
          {orders.map((o: any, idx: number) => (
            <div key={o.id} className="rounded-xl border border-gray-300 dark:border-gray-600 p-4 print-card">
              <div className="flex items-center justify-between border-b border-dashed border-gray-300 dark:border-gray-600 pb-2 mb-2">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-gray-100">Nexora</p>
                  <p className="text-[10px] text-gray-400">{t('print_card')} #{idx + 1}</p>
                </div>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{o.order_number}</span>
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-300 space-y-0.5">
                <p><b>{t('print_receiver')}：</b>{o.customer_name || '-'}　{o.customer_phone || (o.shipping_address?.phone || '')}</p>
                <p><b>{t('print_address')}：</b>{o.shipping_address ? [o.shipping_address.province, o.shipping_address.city, o.shipping_address.detail].filter(Boolean).join(' ') : '-'}</p>
                <p className="mt-1"><b>{t('print_items')}：</b>{Array.isArray(o.items) ? o.items.map((i: any) => `${i.product_name}×${i.quantity}`).join('、') : '-'}</p>
                <p><b>{t('print_total')}：</b>￥{Number(o.total || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}　<b>{t('print_date')}：</b>{o.created_at ? new Date(o.created_at.replace('+00:00', 'Z')).toLocaleDateString('zh-CN') : '-'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Portal>
  );
};
