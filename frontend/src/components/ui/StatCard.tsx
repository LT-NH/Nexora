import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Skeleton } from './Skeleton';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
  trend?: number;
  className?: string;
  /** Whether to show gradient icon background */
  gradientIcon?: boolean;
  /** Custom gradient classes for the icon background, e.g. "from-primary-500 to-purple-500 shadow-primary-500/20".
   *  When provided, takes precedence over `gradientIcon`. */
  iconGradient?: string;
  /** Label shown after the trend percentage. Defaults to "较上周". */
  trendLabel?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  icon,
  label,
  value,
  subtext,
  trend,
  className = '',
  gradientIcon = true,
  iconGradient,
  trendLabel = '较上周',
}) => (
  <div
    className={`group bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 hover:shadow-lg hover:shadow-slate-900/10 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 card-lift spotlight-card spotlight-soft ${className}`}
    onMouseMove={(e) => {
      const r = e.currentTarget.getBoundingClientRect();
      e.currentTarget.style.setProperty('--sx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      e.currentTarget.style.setProperty('--sy', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    }}
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[13px] font-semibold text-[#6B7280] dark:text-gray-400">{label}</p>
        <p className="mt-2 text-[26px] font-extrabold tracking-tight text-[#111827] dark:text-gray-100 tabular-nums animate-number">{value}</p>
        {subtext && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtext}</p>
        )}
      </div>
      <div
        className={
          iconGradient
            ? `w-12 h-12 rounded-xl bg-gradient-to-br ${iconGradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`
            : gradientIcon
              ? 'w-12 h-12 rounded-xl bg-gradient-to-br from-primary-50 to-purple-50 dark:from-primary-900/30 dark:to-purple-900/30 flex items-center justify-center group-hover:scale-110 transition-transform duration-300'
              : 'w-12 h-12 rounded-xl bg-gray-50 dark:bg-gray-700 flex items-center justify-center'
        }
      >
        {icon}
      </div>
    </div>
    {trend !== undefined && (
      <div className="mt-3 flex items-center gap-1">
        {trend >= 0 ? (
          <TrendingUp size={14} className="text-green-500" />
        ) : (
          <TrendingDown size={14} className="text-red-500" />
        )}
        <span className={`text-xs font-medium ${trend >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
        </span>
        <span className="text-xs text-gray-400">{trendLabel}</span>
      </div>
    )}
  </div>
);

/** Loading skeleton variant of StatCard */
export const SkeletonStatCard: React.FC = () => (
  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 animate-fade-in">
    <div className="flex items-center justify-between">
      <div className="space-y-3 flex-1">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <Skeleton className="w-12 h-12 rounded-xl" />
    </div>
  </div>
);
