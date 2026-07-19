import React, { useState, useEffect } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  Users,
  Building2,
  CreditCard,
  Activity,
  Award,
  UserCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { SkeletonStatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { AlertTriangle } from 'lucide-react';
import api from '@/services/api';
import type { AdminStats } from '@/types';

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  iconBg?: string;
  iconColor?: string;
}> = ({ icon, label, value, subtext, iconBg, iconColor }) => (
  <div className="bg-white rounded-xl border border-gray-300 shadow-sm p-6 hover:shadow-md hover:border-primary-200 transition-all duration-300">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
        {subtext && (
          <p className="mt-1 text-sm text-gray-500">{subtext}</p>
        )}
      </div>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconBg || 'bg-gradient-to-br from-primary-50 to-indigo-50'}`}>
        <span className={iconColor || 'text-primary-600'}>{icon}</span>
      </div>
    </div>
  </div>
);

export const AdminDashboard: React.FC = () => {
  usePageTitle('管理面板');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await api.get<AdminStats>('/admin/stats');
        setStats(response.data);
      } catch (err: any) {
        setError(err?.response?.data?.detail || '加载管理数据失败');
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <div className="h-8 w-48 bg-gray-200 rounded shimmer" />
          <div className="h-4 w-64 bg-gray-200 rounded shimmer mt-2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">加载管理数据失败</h3>
        <p className="text-sm text-gray-500 mt-1">{error}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">管理仪表板</h2>
        <p className="mt-1 text-sm text-gray-500">
          平台全局概览与管理
        </p>
      </div>

      {/* Stats Row 1 - Users & Workspaces */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          icon={<Users size={22} />}
          label="用户总数"
          value={stats?.users.total.toLocaleString() || 0}
          subtext="平台注册用户"
          iconBg="bg-gradient-to-br from-blue-50 to-indigo-50"
          iconColor="text-blue-600"
        />
        <StatCard
          icon={<UserCheck size={22} />}
          label="活跃用户"
          value={stats?.users.active.toLocaleString() || 0}
          subtext={`活跃率 ${stats?.users.total ? Math.round((stats.users.active / stats.users.total) * 100) : 0}%`}
          iconBg="bg-gradient-to-br from-green-50 to-emerald-50"
          iconColor="text-green-700"
        />
        <StatCard
          icon={<Building2 size={22} />}
          label="工作空间总数"
          value={stats?.workspaces.total.toLocaleString() || 0}
          subtext="已创建的工作空间"
          iconBg="bg-gradient-to-br from-purple-50 to-violet-50"
          iconColor="text-purple-600"
        />
      </div>

      {/* Stats Row 2 - Subscriptions & Plans */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          icon={<CreditCard size={22} />}
          label="活跃订阅"
          value={stats?.subscriptions.active.toLocaleString() || 0}
          subtext="付费订阅用户"
          iconBg="bg-gradient-to-br from-amber-50 to-orange-50"
          iconColor="text-amber-600"
        />
        <StatCard
          icon={<Activity size={22} />}
          label="试用中"
          value={stats?.subscriptions.trialing.toLocaleString() || 0}
          subtext="试用期用户"
          iconBg="bg-gradient-to-br from-cyan-50 to-sky-50"
          iconColor="text-cyan-600"
        />
        <StatCard
          icon={<Award size={22} />}
          label="订阅方案"
          value={stats?.plans.total.toLocaleString() || 0}
          subtext="可用方案数量"
          iconBg="bg-gradient-to-br from-rose-50 to-pink-50"
          iconColor="text-rose-600"
        />
      </div>

      {/* Platform Overview Card */}
      <Card title="平台概览" subtitle="关键指标汇总">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 py-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-slate-900">
              {stats?.memberships.total.toLocaleString() || 0}
            </p>
            <p className="text-sm text-gray-500 mt-1">成员关系总数</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-slate-900">
              {stats?.workspaces.total ? (stats.memberships.total / stats.workspaces.total).toFixed(1) : 0}
            </p>
            <p className="text-sm text-gray-500 mt-1">平均成员数/工作空间</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-green-700">
              {stats?.subscriptions.active && stats.users.total
                ? `${Math.round((stats.subscriptions.active / stats.users.total) * 100)}%`
                : '0%'}
            </p>
            <p className="text-sm text-gray-500 mt-1">付费转化率</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-blue-600">
              {stats?.subscriptions.trialing && stats.users.total
                ? `${Math.round((stats.subscriptions.trialing / stats.users.total) * 100)}%`
                : '0%'}
            </p>
            <p className="text-sm text-gray-500 mt-1">试用转化率</p>
          </div>
        </div>
      </Card>
    </div>
  );
};
