import React, { useState, useEffect } from 'react';
import { useI18n } from '@/i18n';
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const getSteps = (tt: (k: any) => string) => [
  { title: tt('ob_step1_title'), desc: tt('ob_step1_desc'), icon: '\u{1F4E6}', path: '/products' },
  { title: tt('ob_step2_title'), desc: tt('ob_step2_desc'), icon: '\u{1F4CB}', path: '/orders' },
  { title: tt('ob_step3_title'), desc: tt('ob_step3_desc'), icon: '\u{1F4CA}', path: '/dashboard' },
];

export const OnboardingWizard: React.FC = () => {

  const { t: tt } = useI18n();
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // demo 演示账号不弹引导，避免演示时被全屏遮罩打断
    if (user?.email === 'demo@nexora.com') {
      localStorage.setItem('onboarding_seen', 'true');
      return;
    }
    const seen = localStorage.getItem('onboarding_seen');
    if (!seen) setShow(true);
  }, [user?.email]);

  const dismiss = () => { setShow(false); localStorage.setItem('onboarding_seen', 'true'); };
  const complete = () => { setShow(false); localStorage.setItem('onboarding_seen', 'true'); localStorage.setItem('onboarding_completed', 'true'); };

  if (!show || dismissed) return null;

  
  return (
    // 遮罩背景点击即关闭引导（不再全屏拦截页面操作，避免"按钮点不动"）
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={dismiss}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scale-in relative">
        <button onClick={dismiss} className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">{getSteps(tt)[step].icon}</div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">{getSteps(tt)[step].title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{getSteps(tt)[step].desc}</p>
        </div>
        <div className="flex justify-center gap-2 mb-5">
          {getSteps(tt).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors duration-200 ${
                i === step
                  ? 'bg-primary-600'
                  : i < step
                  ? 'bg-primary-300'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}
            />
          ))}
        </div>
        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex-1 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <span className="flex items-center justify-center gap-1">
                <ChevronLeft size={16} />
                上一步
              </span>
            </button>
          )}
          {step < getSteps(tt).length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="flex-1 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors flex items-center justify-center gap-1"
            >
              下一步
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={complete}
              className="flex-1 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors flex items-center justify-center gap-1"
            >
              <Check size={16} />
              开始使用
            </button>
          )}
        </div>
        <button
          onClick={dismiss}
          className="w-full mt-3 text-xs text-gray-400 hover:text-gray-500 transition-colors"
        >
          跳过引导
        </button>
      </div>
    </div>
  );
};
