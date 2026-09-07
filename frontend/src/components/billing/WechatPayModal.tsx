import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { usePageT } from '@/i18n';
import api from '@/services/api';

const D = {
  zh: {
    title: '微信扫码支付',
    scanning: '请使用微信扫码完成支付',
    waiting: '等待支付确认…',
    paid: '支付成功',
    paid_msg: '订阅已激活，感谢支持！',
    sandbox_tag: '沙箱模式（未配置微信商户凭据）',
    sandbox_btn: '模拟支付成功',
    failed: '支付流程出错',
    expired: '订单已超时，请重新发起',
  },
  en: {
    title: 'WeChat Scan to Pay',
    scanning: 'Scan with WeChat to complete payment',
    waiting: 'Waiting for payment confirmation…',
    paid: 'Payment successful',
    paid_msg: 'Subscription activated. Thank you!',
    sandbox_tag: 'Sandbox mode (WeChat merchant credentials not configured)',
    sandbox_btn: 'Simulate payment success',
    failed: 'Payment flow error',
    expired: 'Order expired, please retry',
  },
};

interface CheckoutResult {
  order_id: string;
  code_url: string;
  sandbox: boolean;
  amount: number;
  plan: { slug: string; name: string };
  period: string;
}

/**
 * WechatPayModal —— 微信 Native 扫码支付弹窗。
 * 打开即发起 checkout（生成动态 code_url 二维码），轮询订单状态；
 * sandbox 模式（未配置 WXPAY_* 凭据）提供「模拟支付成功」按钮走通全流程演示。
 */
export const WechatPayModal: React.FC<{
  slug: string;
  planSlug: string;
  planName: string;
  period: 'month' | 'year';
  onClose: () => void;
  onSuccess: () => void;
}> = ({ slug, planSlug, planName, period, onClose, onSuccess }) => {
  const t = usePageT(D);
  const { addToast } = useToast();
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [status, setStatus] = useState<'pending' | 'paid' | 'failed'>('pending');
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.post<CheckoutResult>(
          `/workspaces/${slug}/billing/checkout`,
          { plan_slug: planSlug, period },
          { timeout: 30000 },
        );
        if (cancelled) return;
        setCheckout(res.data);
        setQrDataUrl(await QRCode.toDataURL(res.data.code_url, { width: 240, margin: 1 }));
      } catch (e: unknown) {
        if (cancelled) return;
        const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        addToast('error', t('failed'), detail || '');
        setStatus('failed');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, planSlug, period]);

  // 轮询订单状态（3s × 40 次 ≈ 2 分钟）
  useEffect(() => {
    if (!checkout) return;
    let n = 0;
    pollRef.current = setInterval(async () => {
      n += 1;
      if (n > 40) { pollRef.current && clearInterval(pollRef.current); return; }
      try {
        const res = await api.get(`/workspaces/${slug}/billing/order/${checkout.order_id}`, { timeout: 8000 });
        if (res.data.status === 'paid') {
          pollRef.current && clearInterval(pollRef.current);
          setStatus('paid');
          addToast('success', t('paid'), t('paid_msg'));
          timerRef.current = setTimeout(() => onSuccess(), 1200);
        } else if (res.data.status === 'expired') {
          pollRef.current && clearInterval(pollRef.current);
          addToast('error', t('expired'), '');
          setStatus('failed');
        }
      } catch { /* 轮询失败静默重试 */ }
    }, 3000);
    return () => { pollRef.current && clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout]);

  useEffect(() => () => { timerRef.current && clearTimeout(timerRef.current); }, []);

  const sandboxConfirm = async () => {
    if (!checkout) return;
    setConfirming(true);
    try {
      await api.post(`/workspaces/${slug}/billing/sandbox-confirm/${checkout.order_id}`, {}, { timeout: 15000 });
      pollRef.current && clearInterval(pollRef.current);
      setStatus('paid');
      addToast('success', t('paid'), t('paid_msg'));
      timerRef.current = setTimeout(() => onSuccess(), 1000);
    } catch {
      addToast('error', t('failed'), '');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={t('title')}>
      <div className="flex flex-col items-center gap-4 py-4">
        {status === 'paid' ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 size={52} className="text-emerald-500" />
            <p className="text-lg font-bold text-slate-900 dark:text-gray-100">{t('paid')}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('paid_msg')}</p>
          </div>
        ) : !checkout ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 size={32} className="animate-spin text-violet-500" />
            <p className="text-sm text-gray-500">{t('waiting')}</p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-gray-100 dark:border-gray-700 p-3 bg-white relative">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="wxpay qrcode" className="w-[240px] h-[240px]" />
              ) : (
                <div className="w-[240px] h-[240px] flex items-center justify-center">
                  <Loader2 size={28} className="animate-spin text-gray-300" />
                </div>
              )}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">{t('scanning')}</p>
            <p className="text-xl font-bold text-violet-600 dark:text-violet-400 tabular-nums">
              ¥{checkout.amount.toFixed(2)} · {checkout.plan.name} · {checkout.period === 'year' ? '年付' : '月付'}
            </p>
            {checkout.sandbox && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/[0.07] px-4 py-2.5 flex flex-col items-center gap-2">
                <p className="text-[12px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <ShieldCheck size={13} />
                  {t('sandbox_tag')}
                </p>
                <Button size="sm" onClick={sandboxConfirm} disabled={confirming} className="bg-amber-500 hover:bg-amber-600 text-white">
                  {confirming ? <Loader2 size={13} className="animate-spin" /> : null}
                  {t('sandbox_btn')}
                </Button>
              </div>
            )}
            <p className="text-[12px] text-gray-400 flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" />
              {t('waiting')}
            </p>
          </>
        )}
      </div>
      <div className="flex justify-end px-1 pb-1">
        <Button variant="ghost" onClick={onClose}>{'关闭'}</Button>
      </div>
    </Modal>
  );
};
