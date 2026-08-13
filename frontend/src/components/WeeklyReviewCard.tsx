import React, { useEffect, useState } from 'react';
import { ArrowDownToLine, CalendarRange, CheckCircle2, ChevronDown, ChevronUp, Download, Sparkles, TrendingUp, XCircle } from 'lucide-react';
import api from '@/services/api';
import { usePageT } from '@/i18n';

interface ChangeItem {
  tone: string;
  title: string;
  detail: string;
}

interface NextAction {
  type: string;
  title: string;
  impact: string;
}

interface WeeklyReviewData {
  summary: string;
  week_start: string;
  week_end: string;
  changes: ChangeItem[];
  next_actions: NextAction[];
  forecast: { amount: number; confidence: string; base_revenue: number };
}

const D = {
  zh: {
    weekly_title: '经营周会',
    weekly_subtitle: '每周一页经营结论 · 发给合伙人只需 3 秒',
    key_changes: '本周关键变化',
    next_actions: '下周 3 件事',
    forecast: '下周营收预测',
    export: '导出周报',
    exported: '周报已导出',
    confidence_high: '高置信',
    confidence_medium: '中置信',
    week_range: '{s} ~ {e}',
  },
  en: {
    weekly_title: 'Weekly review',
    weekly_subtitle: 'One-page business review · share with partners in 3s',
    key_changes: 'Key changes',
    next_actions: 'Next week: 3 things',
    forecast: 'Next week forecast',
    export: 'Export',
    exported: 'Weekly report exported',
    confidence_high: 'High confidence',
    confidence_medium: 'Medium confidence',
    week_range: '{s} ~ {e}',
  },
};

export const WeeklyReviewCard: React.FC<{ slug: string }> = ({ slug }) => {
  const t = usePageT(D);
  const [data, setData] = useState<WeeklyReviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/workspaces/${slug}/health/weekly-review`)
      .then((res: any) => {
        setData(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

  const exportTxt = () => {
    if (!data) return;
    const lines = [
      `NEXORA 经营周会（${t('week_range').replace('{s}', data.week_start).replace('{e}', data.week_end)}）`,
      '='.repeat(36),
      '',
      `【总结】${data.summary}`,
      '',
      '【本周关键变化】',
      ...data.changes.map((c) => `- [${c.tone === 'good' ? '好' : '警示'}] ${c.title}：${c.detail}`),
      '',
      '【下周 3 件事】',
      ...data.next_actions.map((a) => `- ${a.title}（${a.impact}）`),
      '',
      `【下周营收预测】¥${data.forecast.amount.toLocaleString('en-US')}（${t('confidence_' + data.forecast.confidence)}）`,
      '',
      '由 Nexora 经营健康引擎自动生成',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nexora-weekly-${data.week_end}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading) {
    return (
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl" />
          <div className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-5">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-gray-100 flex items-center gap-2">
            <CalendarRange size={18} className="text-primary-500" />
            {t('weekly_title')}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('weekly_subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400 hidden sm:inline">
            {t('week_range').replace('{s}', data.week_start).replace('{e}', data.week_end)}
          </span>
          <button
            onClick={exportTxt}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
          >
            <ArrowDownToLine size={13} />
            {t('export')}
          </button>
        </div>
      </div>

      <div className="p-6 pt-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Summary */}
        <div className="rounded-xl bg-gradient-to-br from-primary-50 to-violet-50 dark:from-primary-900/20 dark:to-violet-900/20 border border-primary-100 dark:border-primary-800/40 p-4">
          <p className="text-xs font-medium text-primary-600 dark:text-primary-300 mb-2 flex items-center gap-1.5">
            <Sparkles size={13} />
            {t('weekly_title')}
          </p>
          <p className="text-sm text-slate-700 dark:text-gray-200 leading-relaxed whitespace-pre-line">{data.summary}</p>
        </div>

        {/* Key changes */}
        <div>
          <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">{t('key_changes')}</p>
          <div className="space-y-2">
            {data.changes.map((c, i) => (
              <div key={i} className="flex items-start gap-2.5">
                {c.tone === 'good' ? (
                  <CheckCircle2 size={15} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <XCircle size={15} className="text-rose-500 mt-0.5 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-700 dark:text-gray-200">{c.title}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{c.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Next actions + forecast */}
        <div>
          <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">{t('next_actions')}</p>
          <div className="space-y-1.5">
            {data.next_actions.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-slate-700 dark:text-gray-200">
                <span className="w-4 h-4 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 text-[10px] flex items-center justify-center font-medium flex-shrink-0">
                  {i + 1}
                </span>
                <span className="truncate">{a.title}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 px-3.5 py-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                <TrendingUp size={12} />
                {t('forecast')}
              </p>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                {t('confidence_' + data.forecast.confidence)}
              </span>
            </div>
            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums mt-1">
              ¥{data.forecast.amount.toLocaleString('en-US')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
