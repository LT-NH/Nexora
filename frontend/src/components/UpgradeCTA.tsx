import React from 'react';
import { Crown, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface UpgradeCTAProps {
  feature: string;
}

export const UpgradeCTA: React.FC<UpgradeCTAProps> = ({ feature }) => {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center bg-gradient-to-br from-primary-50 to-indigo-50 dark:from-primary-900/20 dark:to-indigo-900/20 rounded-2xl border border-primary-100 dark:border-primary-800/30">
      <Crown size={40} className="text-amber-500 mb-4" />
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
        升级解锁{feature}
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm">
        升级到 Pro 或 Enterprise 即可解锁{feature}，获取更深入的业务洞察。
      </p>
      <button
        onClick={() => { navigate('/'); setTimeout(() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }), 100); }}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-primary-500/25 transition-all active:scale-95"
      >
        查看方案 <ArrowRight size={16} />
      </button>
    </div>
  );
};
