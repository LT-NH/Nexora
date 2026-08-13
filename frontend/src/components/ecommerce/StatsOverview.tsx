import React from 'react';
import { TrendingUp, ShoppingCart, UserPlus, DollarSign } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import type { OrderStats } from '@/types/ecommerce';
import { usePageT, type Lang } from '@/i18n';

interface StatsOverviewProps {
  stats: OrderStats | null;
  isLoading: boolean;
}

// ============================================================
// i18n 组件字典
// ============================================================

const D = {
  zh: {
    no_stats: '暂无统计数据',
    today_sales: '今日销售额',
    order_count: '{n} 笔订单',
    week_orders: '本周订单',
    revenue_prefix: '销售额 ',
    month_sales: '本月销售',
    total_orders: '总订单数',
    total_revenue_prefix: '总销售额 ',
    sales_trend: '销售趋势',
    unit_wan: '万',
  },
  en: {
    no_stats: 'No stats available',
    today_sales: "Today's sales",
    order_count: '{n} orders',
    week_orders: 'Weekly orders',
    revenue_prefix: 'Revenue ',
    month_sales: 'Monthly sales',
    total_orders: 'Total orders',
    total_revenue_prefix: 'Total revenue ',
    sales_trend: 'Sales trend',
    unit_wan: 'w',
  },
} as Record<Lang, Record<string, string>>;

/** 迷你趋势图 - 纯 CSS 模拟 */
const MiniTrend: React.FC<{ data: { date: string; revenue: number }[] }> = ({ data }) => {
  if (!data || data.length === 0) return null;

  const values = data.map((d) => d.revenue);
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${100 - ((v - min) / range) * 80}`)
    .join(' ');

  return (
    <svg viewBox="0 0 100 100" className="w-full h-16" preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgb(99, 102, 241)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="rgb(99, 102, 241)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,100 ${points} 100,100`}
        fill="url(#trendGradient)"
      />
      <polyline
        points={points}
        fill="none"
        stroke="rgb(99, 102, 241)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const StatsOverview: React.FC<StatsOverviewProps> = ({ stats, isLoading }) => {
  const t = usePageT(D);
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 bg-gray-100 rounded-xl shimmer animate-fade-in" />
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        {t('no_stats')}
      </div>
    );
  }

  const formatCurrency = (val: number) => {
    if (val >= 10000) return `¥${(val / 10000).toFixed(1)}${t('unit_wan')}`;
    return `¥${val.toLocaleString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<TrendingUp size={20} className="text-primary-600" />}
          label={t('today_sales')}
          value={formatCurrency(stats.today_revenue)}
          subtext={t('order_count').replace('{n}', String(stats.today_orders))}
        />
        <StatCard
          icon={<ShoppingCart size={20} className="text-primary-600" />}
          label={t('week_orders')}
          value={`${stats.week_orders}`}
          subtext={`${t('revenue_prefix')}${formatCurrency(stats.week_revenue)}`}
        />
        <StatCard
          icon={<UserPlus size={20} className="text-primary-600" />}
          label={t('month_sales')}
          value={formatCurrency(stats.month_revenue)}
          subtext={t('order_count').replace('{n}', String(stats.month_orders))}
        />
        <StatCard
          icon={<DollarSign size={20} className="text-primary-600" />}
          label={t('total_orders')}
          value={`${stats.total_orders}`}
          subtext={`${t('total_revenue_prefix')}${formatCurrency(stats.total_revenue)}`}
        />
      </div>

      {stats.trend.length > 0 && (
        <Card title={t('sales_trend')} padding>
          <MiniTrend data={stats.trend} />
        </Card>
      )}
    </div>
  );
};
