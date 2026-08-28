import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Coins, AlertTriangle, Package, Wallet, Percent } from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { StatCard } from '@/components/ui/StatCard';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import api from '@/services/api';

const translations = {
  zh: {
    title: '利润分析',
    subtitle: '毛利是生意的真相——营收减成本，看真实赚了多少',
    revenue: '总营收',
    cost: '总成本',
    profit: '总毛利',
    margin: '毛利率',
    top_title: 'TOP 利润商品',
    top_sub: '按毛利额排序（售价 × 销量 - 成本）',
    cat_title: '分类毛利',
    cat_sub: '按商品分类聚合的营收与毛利',
    warn_title: '低毛利预警',
    warn_sub: '毛利率低于 10% 的商品，建议调价或优化成本',
    missing_cost: '未设置成本价的商品',
    name: '商品',
    qty: '销量',
    margin_col: '毛利率',
    refresh: '刷新',
    no_warnings: '暂无低毛利商品，利润结构健康',
    cost_hint: '成本来自商品「成本价」字段；未设置的按 0 计（请在商品管理中补全成本价）',
  },
  en: {
    title: 'Profit Analysis',
    subtitle: 'Margin is the truth of business — revenue minus cost',
    revenue: 'Revenue',
    cost: 'Cost',
    profit: 'Profit',
    margin: 'Margin',
    top_title: 'Top Profit Products',
    top_sub: 'Sorted by gross profit (price × qty - cost)',
    cat_title: 'Margin by Category',
    cat_sub: 'Revenue and profit aggregated by category',
    warn_title: 'Low Margin Alerts',
    warn_sub: 'Products below 10% margin — consider repricing',
    missing_cost: 'products without cost price',
    name: 'Product',
    qty: 'Qty',
    margin_col: 'Margin',
    refresh: 'Refresh',
    no_warnings: 'No low-margin products. Healthy profit structure.',
    cost_hint: 'Cost comes from product cost_price; missing ones count as 0 (fill cost price in Products)',
  },
};

export const Profit: React.FC = () => {
  const { currentWorkspace } = useWorkspace();
  const { lang } = useI18n();
  const t = translations[lang === 'zh' ? 'zh' : 'en'];
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const res: any = await api.get(`/workspaces/${currentWorkspace.slug}/reports/profit-analysis`);
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fmt = (n: number | undefined) =>
    `¥${(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#111827] dark:text-gray-100">{t.title}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t.subtitle}</p>
        </div>
        <Button variant="outline" size="sm" leftIcon={<TrendingUp size={14} />} onClick={fetchData} isLoading={loading}>
          {t.refresh}
        </Button>
      </div>

      {/* 4 张利润卡 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Wallet size={20} />}
          label={t.revenue}
          value={fmt(data?.revenue)}
          subtext={`${data?.order_items_count ?? 0} 条订单明细`}
          gradientIcon
          iconGradient="from-emerald-500 to-teal-600 shadow-emerald-500/20"
        />
        <StatCard
          icon={<Package size={20} />}
          label={t.cost}
          value={fmt(data?.cost)}
          subtext={t.cost_hint.split('；')[0]}
          gradientIcon
          iconGradient="from-gray-500 to-slate-600 shadow-gray-500/20"
        />
        <StatCard
          icon={<Coins size={20} />}
          label={t.profit}
          value={fmt(data?.profit)}
          subtext={t.missing_cost}
          gradientIcon
          iconGradient="from-amber-500 to-orange-600 shadow-amber-500/20"
        />
        <StatCard
          icon={<Percent size={20} />}
          label={t.margin}
          value={`${data?.margin ?? 0}%`}
          subtext="毛利 ÷ 营收"
          gradientIcon
          iconGradient="from-violet-500 to-purple-600 shadow-violet-500/20"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* TOP 利润商品 */}
        <Card title={t.top_title} subtitle={t.top_sub}>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {(data?.top_products ?? []).map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-[#EB9D2A] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-gray-100 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">×{p.qty} · 毛利率 {p.margin}%</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">+{fmt(p.profit)}</p>
                  <p className="text-[11px] text-gray-400 tabular-nums">{fmt(p.revenue)}</p>
                </div>
              </div>
            ))}
            {(data?.top_products ?? []).length === 0 && !loading && (
              <p className="py-8 text-center text-sm text-gray-400">暂无数据</p>
            )}
          </div>
        </Card>

        {/* 低毛利预警 */}
        <Card title={t.warn_title} subtitle={t.warn_sub}>
          {(data?.low_margin_warnings ?? []).length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-3">
                <TrendingUp size={20} className="text-emerald-500" />
              </div>
              <p className="text-sm text-gray-500">{t.no_warnings}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(data.low_margin_warnings as any[]).map((w: any, i: number) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-red-50/60 dark:bg-red-900/10 px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                    <span className="text-sm text-slate-800 dark:text-gray-200 truncate">{w.name}</span>
                  </div>
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400 tabular-nums flex-shrink-0">
                    毛利 {w.margin}% · {fmt(w.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-[11px] text-gray-400">{t.cost_hint}</p>
        </Card>
      </div>

      {/* 分类毛利表 */}
      <Card title={t.cat_title} subtitle={t.cat_sub}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="text-left font-semibold py-2.5">{t.name}</th>
                <th className="text-right font-semibold py-2.5">营收</th>
                <th className="text-right font-semibold py-2.5">成本</th>
                <th className="text-right font-semibold py-2.5">毛利</th>
                <th className="text-right font-semibold py-2.5">{t.margin_col}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {(data?.categories ?? []).map((c: any, i: number) => (
                <tr key={i} className="hover:bg-[#F7F8F2] dark:hover:bg-gray-800/40 transition-colors">
                  <td className="py-3 font-medium text-slate-900 dark:text-gray-100">{c.name}</td>
                  <td className="py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{fmt(c.revenue)}</td>
                  <td className="py-3 text-right tabular-nums text-gray-400">{fmt(c.cost)}</td>
                  <td className={`py-3 text-right font-semibold tabular-nums ${c.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}`}>
                    {c.profit >= 0 ? '+' : ''}{fmt(c.profit)}
                  </td>
                  <td className="py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{c.margin}%</td>
                </tr>
              ))}
              {(data?.categories ?? []).length === 0 && !loading && (
                <tr><td colSpan={5} className="py-8 text-center text-gray-400">暂无数据</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
