import React from 'react';
import { TrendingUp, ShoppingCart, UserPlus, DollarSign } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import type { OrderStats } from '@/types/ecommerce';

interface StatsOverviewProps {
  stats: OrderStats | null;
  isLoading: boolean;
}

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
        暂无统计数据
      </div>
    );
  }

  const formatCurrency = (val: number) => {
    if (val >= 10000) return `¥${(val / 10000).toFixed(1)}万`;
    return `¥${val.toLocaleString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<TrendingUp size={20} className="text-primary-600" />}
          label="今日销售额"
          value={formatCurrency(stats.today_revenue)}
          subtext={`${stats.today_orders} 笔订单`}
        />
        <StatCard
          icon={<ShoppingCart size={20} className="text-primary-600" />}
          label="本周订单"
          value={`${stats.week_orders}`}
          subtext={`销售额 ${formatCurrency(stats.week_revenue)}`}
        />
        <StatCard
          icon={<UserPlus size={20} className="text-primary-600" />}
          label="本月销售"
          value={formatCurrency(stats.month_revenue)}
          subtext={`${stats.month_orders} 笔订单`}
        />
        <StatCard
          icon={<DollarSign size={20} className="text-primary-600" />}
          label="总订单数"
          value={`${stats.total_orders}`}
          subtext={`总销售额 ${formatCurrency(stats.total_revenue)}`}
        />
      </div>

      {stats.trend.length > 0 && (
        <Card title="销售趋势" padding>
          <MiniTrend data={stats.trend} />
        </Card>
      )}
    </div>
  );
};