import React, { useState, useEffect, useRef } from 'react';
import { X, QrCode, CheckCircle, AlertCircle, Clock, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmPayment: () => void;
  planName: string;
  amount: number;
  qrCodeUrl: string;
  isLoading: boolean;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  onConfirmPayment,
  planName,
  amount,
  qrCodeUrl,
  isLoading,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(900); // 15 minutes

  // Keyboard escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen) {
      setCountdown(900);
      return;
    }
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleCopyAmount = () => {
    navigator.clipboard.writeText(String(amount));
    setCopied(true);
    addToast('success', '已复制', `金额 ¥${amount} 已复制到剪贴板`);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current && !isLoading) onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <QrCode size={20} className="text-primary-600" />
            <h2 className="text-lg font-semibold text-slate-900">扫码支付</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
            aria-label="关闭"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Plan info */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div>
              <p className="text-sm font-medium text-slate-900">{planName} 方案</p>
              <p className="text-xs text-gray-500">月付订阅</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-primary-600">¥{amount}</p>
              <p className="text-xs text-gray-500">/月</p>
            </div>
          </div>

          {/* QR Code */}
          <div className="flex flex-col items-center">
            <div className="relative w-56 h-56 bg-white border-2 border-dashed border-gray-300 rounded-2xl flex items-center justify-center overflow-hidden">
              {qrCodeUrl ? (
                <img
                  src={qrCodeUrl}
                  alt="收款二维码"
                  className="w-full h-full object-contain p-2"
                />
              ) : (
                <div className="text-center p-4">
                  <QrCode size={48} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">收款码加载中...</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={handleCopyAmount}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
              >
                {copied ? (
                  <>
                    <CheckCircle size={14} />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    复制金额 ¥{amount}
                  </>
                )}
              </button>
            </div>

            {/* Countdown */}
            <div className="flex items-center gap-1.5 mt-3">
              <Clock size={14} className="text-amber-500" />
              <span className="text-xs text-gray-500">
                二维码有效期：{formatTime(countdown)}
              </span>
            </div>
          </div>

          {/* Instructions */}
          <div className="space-y-2 p-3 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-sm font-medium text-blue-800 flex items-center gap-1.5">
              <AlertCircle size={14} />
              支付说明
            </p>
            <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
              <li>使用微信/支付宝扫描上方二维码</li>
              <li>确认金额为 <strong>¥{amount}</strong> 后完成支付</li>
              <li>支付完成后点击下方"我已付款"按钮</li>
              <li>我们将在 1-3 分钟内确认到账</li>
            </ol>
          </div>

          {/* Confirm button */}
          <Button
            variant="primary"
            className="w-full"
            size="lg"
            onClick={onConfirmPayment}
            isLoading={isLoading}
          >
            {isLoading ? '确认中...' : `我已付款 ¥${amount}`}
          </Button>

          <p className="text-xs text-center text-gray-500">
            如有疑问，请联系客服
          </p>
        </div>
      </div>
    </div>
  );
};