import React, { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { MessageSquare, X, Star } from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';
import { Button } from '@/components/ui/Button';
import FloatingActionButton from '@/components/ui/FloatingActionButton';

const NPS_STORAGE_KEY = 'nexora_nps_last_shown';
const NPS_INTERVAL_DAYS = 30;

const FeedbackWidget: React.FC = () => {

  const { t: tt } = useI18n();  const { currentWorkspace } = useWorkspace();
  const { addToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'feedback' | 'nps' | null>(null);
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Show NPS modal once every 30 days
  useEffect(() => {
    if (!currentWorkspace) return;
    const lastShown = localStorage.getItem(`${NPS_STORAGE_KEY}_${currentWorkspace.id}`);
    if (lastShown) {
      const daysSince = (Date.now() - parseInt(lastShown)) / (1000 * 60 * 60 * 24);
      if (daysSince < NPS_INTERVAL_DAYS) return;
    }
    const timer = setTimeout(() => {
      setIsOpen(true);
      setMode('nps');
      localStorage.setItem(`${NPS_STORAGE_KEY}_${currentWorkspace.id}`, String(Date.now()));
    }, 5000);
    return () => clearTimeout(timer);
  }, [currentWorkspace?.id]);

  const handleSubmit = async () => {
    if (!currentWorkspace || submitting) return;
    setSubmitting(true);
    try {
      await api.post(`/workspaces/${currentWorkspace.slug}/feedback`, {
        type: mode,
        nps_score: mode === 'nps' ? npsScore : null,
        content: content.trim() || null,
      });
      addToast('success', '感谢您的反馈！');
      resetForm();
    } catch {
      addToast('error', tt('feedback_fail'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setIsOpen(false);
    setMode(null);
    setNpsScore(null);
    setContent('');
  };

  // Don't show floating button if no workspace
  if (!currentWorkspace) return null;

  const title = mode === 'nps' ? 'NPS 满意度评分' : tt('quick_feedback');

  return (
    <>
      {/* 触发按钮：走统一的浮动按钮簇规范（槽位 / 尺寸 / 配色由 FloatingActionButton 管） */}
      {!isOpen && (
        <FloatingActionButton
          slot="feedback"
          variant="brand"
          label={tt('quick_feedback')}
          icon={<MessageSquare size={20} />}
          onClick={() => { setIsOpen(true); setMode('feedback'); }}
        />
      )}

      {/*
        面板：锚定在浮动按钮簇上方（bottom-[84px] = 反馈槽位），
        z-[60] 高于浮动按钮（z-50）—— 否则 AI 助手按钮会压在面板上。
        窄屏铺满可用宽度，桌面 320px。
      */}
      {isOpen && (
        <div className="fixed bottom-[84px] left-4 right-4 sm:left-auto sm:right-6 sm:w-80 z-[60] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-gray-100">
              {title}
            </h3>
            <button
              onClick={resetForm}
              aria-label="关闭"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-3">
            {/* Mode switcher */}
            {mode && (
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1">
                <button
                  onClick={() => { setMode('feedback'); setNpsScore(null); }}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    mode === 'feedback'
                      ? 'bg-white dark:bg-gray-800 shadow-sm text-primary-600 dark:text-primary-300'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <MessageSquare size={12} className="inline mr-1" />
                  快速反馈
                </button>
                <button
                  onClick={() => setMode('nps')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    mode === 'nps'
                      ? 'bg-white dark:bg-gray-800 shadow-sm text-primary-600 dark:text-primary-300'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <Star size={12} className="inline mr-1" />
                  NPS 打分
                </button>
              </div>
            )}

            {/* NPS Score Buttons */}
            {mode === 'nps' && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  0 代表「非常不满意」，10 代表「非常满意」
                </p>
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: 11 }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => setNpsScore(i)}
                      className={`w-7 h-7 rounded-md text-xs font-medium transition-all ${
                        npsScore === i
                          ? 'bg-primary-600 text-white scale-110 shadow-md'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {i}
                    </button>
                  ))}
                </div>
                {npsScore !== null && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {npsScore >= 9 ? '推荐者 👍' : npsScore >= 7 ? '中立者 🙂' : '批评者 😞'}
                  </p>
                )}
              </div>
            )}

            {/* Feedback Content */}
            <div>
              <textarea
                className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-slate-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-800 focus:border-primary-500 transition-colors resize-none"
                rows={3}
                placeholder={
                  mode === 'nps'
                    ? '可选：补充说明您的评分原因...'
                    : '请分享您的想法、建议或遇到的问题...'
                }
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>

            <Button
              variant="primary"
              className="w-full"
              size="sm"
              isLoading={submitting}
              onClick={handleSubmit}
              disabled={mode === 'nps' && npsScore === null}
            >
              {submitting ? '提交中...' : '提交'}
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default FeedbackWidget;
