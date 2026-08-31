import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { TrendingUp, Banknote, Percent, Users as UsersIcon, RefreshCw, AlertTriangle, CreditCard } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';
import { useEChart } from '@/hooks/useEChart';
import type { EChartsOption } from 'echarts';

interface RevenueResp {
  mrr: number;
  arr: number;
  active_subscriptions: number;
  trial_subscriptions: number;
  pay_rate: number;
  monthly_trend: { month: string; amount: number }[];
  churn_risk: { workspace_name: string; plan: string; days_left: number; current_period_end: string | null }[];
  plan_distribution: { plan: string; count: number }[];
}

export const AdminRevenue: React.FC = () => {
  const [data, setData] = useState<RevenueResp | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/admin/revenue');
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const trendOption = useMemo<EChartsOption>(() => {
    const months = data?.monthly_trend ?? [];
    return {
      tooltip: { trigger: 'axis', valueFormatter: (v) => `¥${Number(v).toLocaleString()}` },
      grid: { left: 8, right: 16, top: 30, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: months.map((m) => m.month.slice(5)), axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(1)}w` : String(v)) } },
      series: [
        {
          name: '已支付收入',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          data: months.map((m) => m.amount),
          lineStyle: { width: 3, color: '#0071E3' },
          itemStyle: { color: '#0071E3' },
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(0,113,227,0.25)' },
                { offset: 1, color: 'rgba(0,113,227,0.02)' },
              ],
            },
          },
        },
      ],
    };
  }, [data]);

  const pieOption = useMemo<EChartsOption>(() => {
    const dist = data?.plan_distribution ?? [];
    const palette = ['#0071E3', '#EB9D2A', '#10b981', '#8b5cf6', '#f43f5e', '#64748b'];
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} 个 ({d}%)' },
      legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 10 } },
      series: [
        {
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['50%', '45%'],
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          data: dist.map((d, i) => ({ name: d.plan, value: d.count, itemStyle: { color: palette[i % palette.length] } })),
        },
      ],
    };
  }, [data]);

  const trendRef = useEChart(trendOption, [data]);
  const pieRef = useEChart(pieOption, [data]);

  const stat = (icon: React.ReactNode, label: string, value: string, sub?: string, cls = 'text-slate-900 dark:text-gray-100') => (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-[#E4E6DC] dark:border-gray-700 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className={`mt-1.5 text-3xl font-extrabold tabular-nums ${cls}`}>{value}</p>
          {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-lg bg-[#F6F7F1] dark:bg-gray-700 flex items-center justify-center text-gray-500">{icon}</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#111827] dark:text-gray-100">营收看板</h1>
          <p className="mt-1 text-sm text-gray-500">平台订阅收入（MRR / ARR）· 月度支付趋势 · 流失预警</p>
        </div>
        <Button variant="outline" size="sm" leftIcon={<RefreshCw size={14} />} onClick={fetchData} isLoading={loading}>
          刷新
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stat(<Banknote size={18} />, 'MRR 月度经常性收入', data ? `¥${data.mrr.toLocaleString()}` : '—', '活跃订阅 × 月费')}
        {stat(<TrendingUp size={18} />, 'ARR 年度经常性收入', data ? `¥${data.arr.toLocaleString()}` : '—', 'MRR × 12')}
        {stat(<Percent size={18} />, '付费率', data ? `${data.pay_rate}%` : '—', '活跃订阅 / 商户数')}
        {stat(
          <CreditCard size={18} />,
          '订阅状态',
          data ? `${data.active_subscriptions} / ${data.trial_subscriptions}` : '—',
          '活跃 / 试用',
          'text-[#0071E3]',
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3">
          <Card title="月度支付收入趋势" subtitle="近 12 个月已支付流水（¥）">
            <div ref={trendRef} className="h-[300px]" />
          </Card>
        </div>
        <div className="xl:col-span-2">
          <Card title="套餐分布" subtitle="全平台订阅套餐占比">
            <div ref={pieRef} className="h-[300px]" />
          </Card>
        </div>
      </div>

      <Card title="流失预警" subtitle="活跃订阅将在 14 天内到期的工作空间">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="text-left font-semibold py-3 pl-4">工作空间</th>
                <th className="text-left font-semibold py-3">套餐</th>
                <th className="text-left font-semibold py-3">剩余天数</th>
                <th className="text-left font-semibold py-3">到期时间</th>
                <th className="text-right font-semibold py-3 pr-4">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {(data?.churn_risk ?? []).map((r, i) => (
                <tr key={i} className="hover:bg-[#F7F8F2] dark:hover:bg-gray-800/40 transition-colors">
                  <td className="py-3 pl-4 font-medium text-slate-900 dark:text-gray-100">{r.workspace_name}</td>
                  <td className="py-3 text-xs text-gray-500">{r.plan}</td>
                  <td className="py-3">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      r.days_left <= 3 ? 'bg-red-50 text-red-600 dark:bg-red-900/20' : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20'
                    }`}>
                      {r.days_left} 天
                    </span>
                  </td>
                  <td className="py-3 text-xs text-gray-500 tabular-nums">
                    {r.current_period_end ? new Date(String(r.current_period_end).replace('+00:00', 'Z')).toLocaleString('zh-CN') : '—'}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                      <AlertTriangle size={12} /> 需跟进
                    </span>
                  </td>
                </tr>
              ))}
              {(!data?.churn_risk || data.churn_risk.length === 0) && (
                <tr><td colSpan={5} className="py-10 text-center text-gray-400">14 天内无到期订阅</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
