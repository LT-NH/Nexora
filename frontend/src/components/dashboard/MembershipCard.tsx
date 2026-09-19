/**
 * 会员等级分布卡片（原为 Dashboard.tsx 的内联组件）。
 * 读取会员接口后按等级画占比条；等级配色来自本文件的 levelColors。
 */

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { api } from '@/services/api';
import { usePageT } from '@/i18n';
import { D } from '@/pages/dashboard/dict';

// ─── Membership Distribution Card ─────────────────────────────────────────

const levelColors: Record<string, string> = {
  bronze: '#cd7f32',
  silver: '#a0a0a0',
  gold: '#d4a017',
  diamond: '#4da6ff',
};

export const MembershipCard: React.FC<{ slug: string }> = ({ slug }) => {
  const t = usePageT(D);
  const [levels, setLevels] = useState<{ level: string; label: string; count: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    api.get(`/workspaces/${slug}/membership`)
      .then((res) => {
        const data = res.data;
        setLevels(data.levels || []);
        setTotal(data.total_customers || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <Card className="" title={t('membership_title')} subtitle={t('membership_subtitle')}>
        <div className="h-[120px] flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">{t('loading')}</div>
      </Card>
    );
  }

  if (total === 0) {
    return (
      <Card className="" title={t('membership_title')} subtitle={t('membership_subtitle')}>
        <div className="h-[120px] flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">{t('no_customer_data')}</div>
      </Card>
    );
  }

  const maxCount = Math.max(...levels.map((l) => l.count), 1);

  return (
    <Card className="" title={t('membership_title')} subtitle={`${t('membership_total_prefix')}${total}${t('membership_total_suffix')}`}>
      <div className="space-y-3 py-2">
        {levels.map((lvl) => {
          const pct = Math.round((lvl.count / maxCount) * 100);
          return (
            <div key={lvl.level} className="flex items-center gap-3">
              <div className="w-16 text-sm font-medium text-gray-700 dark:text-gray-300 flex-shrink-0">
                {lvl.label}
              </div>
              <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: levelColors[lvl.level] || '#888',
                  }}
                />
              </div>
              <div className="w-10 text-sm font-semibold text-gray-600 dark:text-gray-400 text-right">
                {lvl.count}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
