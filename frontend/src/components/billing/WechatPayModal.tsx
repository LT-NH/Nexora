import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, ShieldCheck, CheckCircle2, QrCode, CreditCard } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { usePageT } from '@/i18n';
import api from '@/services/api';

const D = {
  zh: {
    title: '套餐支付',
    choose_method: '选择支付方式',
    wechat: '微信扫码',
    alipay: '支付宝',
    scanning: '请使用微信扫码完成支付',
    alipay_jumping: '正在跳转支付宝收银台…',
    alipay_hint: '页面跳转支付宝完成付款，付款完成后自动回到本页确认',
    waiting: '等待支付确认…',
    paid: '支付成功',
    paid_msg: '订阅已激活，感谢支持！',
    sandbox_tag: '沙箱模式（商户凭据未配置）',
    sandbox_btn: '模拟支付成功',
    failed: '支付流程出错',
    expired: '订单已超时，请重新发起',
    wx_title: '微信支付',
    alipay_title: '支付宝支付',
  },
  en: {
    title: 'Checkout',
    choose_method: 'Pay with',
    wechat: 'WeChat',
    alipay: 'Alipay',
    scanning: 'Scan with WeChat to complete payment',
    alipay_jumping: 'Redirecting to Alipay checkout…',
    alipay_hint: 'Complete payment on Alipay, then you will return automatically',
    waiting: 'Waiting for payment confirmation…',
    paid: 'Payment successful',
    paid_msg: 'Subscription activated. Thank you!',
    sandbox_tag: 'Sandbox mode (merchant credentials not configured)',
    sandbox_btn: 'Simulate payment success',
    failed: 'Payment flow error',
    expired: 'Order expired, please retry',
    wx_title: 'WeChat Pay',
    alipay_title: 'Alipay',
  },
};

interface CheckoutResult {
  order_id: string;
  method: string;
  code_url?: string;
  form_html?: string | null;
  sandbox: boolean;
  amount: number;
  plan: { slug: string; name: string };
  period: string;
}

/**
 * WechatPayModal —— 套餐支付弹窗（微信 Native 扫码 / 支付宝电脑网站支付）。
 * 打开后先选择支付方式发起 checkout：微信 → 动态二维码 + 轮询；支付宝（真实凭据）→
 * 自动提交支付表单跳转支付宝收银台（异步通知激活后轮询命中）；无商户凭据时统一进入
 * sandbox 模式（「模拟支付成功」按钮走通全流程演示）。
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
  const [method, setMethod] = useState<'wechat' | 'alipay'>('wechat');
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [status, setStatus] = useState<'pending' | 'paid' | 'failed'>('pending');
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittedRef = useRef(false);

  const isAlipayReal = method === 'alipay' && checkout && !checkout.sandbox;

  useEffect(() => {
    let cancelled = false;
    setCheckout(null);
    setStatus('pending');
    setQrDataUrl('');
    submittedRef.current = false;
    (async () => {
      try {
        const res = await api.post<CheckoutResult>(
          `/workspaces/${slug}/billing/checkout`,
          { plan_slug: planSlug, period, method },
          { timeout: 30000 },
        );
        if (cancelled) return;
        setCheckout(res.data);
        if (res.data.method !== 'alipay_webpay') {
          setQrDataUrl(await QRCode.toDataURL(res.data.code_url || '', { width: 240, margin: 1 }));
        }
      } catch (e: unknown) {
        if (cancelled) return;
        const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        addToast('error', t('failed'), detail || '');
        setStatus('failed');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, planSlug, period, method]);

  // 支付宝真实凭据：自动提交支付表单（页面跳转支付宝收银台）
  useEffect(() => {
    if (isAlipayReal && checkout?.form_html && !submittedRef.current) {
      submittedRef.current = true;
      const div = document.createElement('div');
      div.innerHTML = checkout.form_html;
      document.body.appendChild(div);
      const form = document.getElementById('alipay_submit') as HTMLFormElement | null;
      if (form) {
        const timer = setTimeout(() => { try { form.submit(); } catch { /* noop */ } }, 400);
        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAlipayReal, checkout]);

  // 轮询订单状态（3s × 60 ≈ 3 分钟；支付宝付款后由异步通知激活）
  useEffect(() => {
    if (!checkout) return;
    let n = 0;
    pollRef.current = setInterval(async () => {
      n += 1;
      if (n > 60) { pollRef.current && clearInterval(pollRef.current); return; }
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

  const methodTab = (m: 'wechat' | 'alipay', label: string, Icon: typeof QrCode) => (
    <button
      key={m}
      onClick={() => setMethod(m)}
      disabled={status === 'paid'}
      className={`flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-lg border transition-colors ${
        method === m
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-300'
          : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'
      }`}
    >
      <Icon size={13} />
      {label}
    </button>
  );

  return (
    <Modal isOpen onClose={onClose} title={status === 'paid' ? t('paid') : t('title')}>
      <div className="flex flex-col items-center gap-4 py-4">
        {/* 支付方式选择 */}
        {status !== 'paid' && (
          <div className="flex items-center gap-2">
            {methodTab('wechat', t('wechat'), QrCode)}
            {methodTab('alipay', t('alipay'), CreditCard)}
          </div>
        )}

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
            {/* 金额摘要 */}
            <p className="text-xl font-bold text-violet-600 dark:text-violet-400 tabular-nums">
              ¥{checkout.amount.toFixed(2)} · {checkout.plan.name} · {checkout.period === 'year' ? '年付' : '月付'}
            </p>

            {checkout.method === 'alipay_webpay' && !checkout.sandbox ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <Loader2 size={34} className="animate-spin text-blue-500" />
                <p className="text-sm font-medium text-slate-700 dark:text-gray-200">{t('alipay_jumping')}</p>
                <p className="text-[12.5px] text-gray-400 max-w-[260px] text-center">{t('alipay_hint')}</p>
                <p className="text-[12px] text-gray-400 flex items-center gap-1.5">
                  <Loader2 size={11} className="animate-spin" />
                  {t('waiting')}
                </p>
              </div>
            ) : checkout.method === 'wechat_native' && !checkout.sandbox ? (
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
                <p className="text-[12px] text-gray-400 flex items-center gap-1.5">
                  <Loader2 size={11} className="animate-spin" />
                  {t('waiting')}
                </p>
              </>
            ) : (
              /* sandbox：两种方式统一模拟确认 */
              <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/[0.07] px-4 py-3 flex flex-col items-center gap-2 w-full max-w-[300px]">
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
          </>
        )}
      </div>
      <div className="flex justify-end px-1 pb-1">
        <Button variant="ghost" onClick={onClose}>{'关闭'}</Button>
      </div>
    </Modal>
  );
};
