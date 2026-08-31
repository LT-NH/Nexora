import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, TrendingDown, PackageX, Users as UsersIcon, ShieldAlert } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';
import { useEChart } from '@/hooks/useEChart';
import type { EChartsOption } from 'echarts';

interface TenantHealth {
  workspace_id: string;
  name: string;
  slug: string;
  status: string;
  score: number;
  level: string;
  dimensions: { key: string; name: string; score: number; level: string }[];
  metrics: {
    refund_rate: number;
    growth: number;
    revenue_7d: number;
    stockout_count: number;
    overstock_count: number;
    churn_count: number;
    repeat_rate: number;
  };
}

interface HealthResp {
  total: number;
  average_score: number;
  red_count: number;
  yellow_count: number;
  green_count: number;
  tenants: TenantHealth[];
}

const levelColor: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
  yellow: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
  red: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
};

const levelBar: Record<string, string> = {
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
};

export const AdminHealth: React.FC = () => {
  const [data, setData] = useState<HealthResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/admin/tenant-health');
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

  const chartOption = useMemo<EChartsOption>(() => {
    if (!data || !data.tenants.length) return {};
    const sorted = [...data.tenants].sort((a, b) => a.score - b.score);
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 8, right: 40, top: 10, bottom: 8, containLabel: true },
      xAxis: { type: 'value', min: 0, max: 100, axisLabel: { fontSize: 11 } },
      yAxis: {
        type: 'category',
        data: sorted.map((t) => t.name),
        axisLabel: { fontSize: 11, width: 90, overflow: 'truncate' },
      },
      series: [
        {
          type: 'bar',
          data: sorted.map((t) => ({
            value: t.score,
            itemStyle: { color: levelBar[t.level], borderRadius: [0, 6, 6, 0] },
          })),
          barWidth: 14,
          label: { show: true, position: 'right', fontSize: 11, fontWeight: 700 },
        },
      ],
    };
  }, [data]);

  const chartRef = useEChart(chartOption, [data]);

  const stat = (icon: React.ReactNode, label: string, value: string | number, cls: string, sub?: string) => (
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
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#111827] dark:text-gray-100">租户健康雷达</h1>
          <p className="mt-1 text-sm text-gray-500">全平台商户经营健康评分（5 维加权）· 红灯预警实时定位</p>
        </div>
        <Button variant="outline" size="sm" leftIcon={<RefreshCw size={14} />} onClick={fetchData} isLoading={loading}>
          刷新
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {stat(<Activity size={18} />, '商户总数', data?.total ?? '—', 'text-slate-900 dark:text-gray-100')}
        {stat(<Activity size={18} />, '平均健康分', data?.average_score ?? '—', 'text-[#0071E3]', '满分 100')}
        {stat(<AlertTriangle size={18} />, '红灯预警', data?.red_count ?? '—', 'text-red-600')}
        {stat(<ShieldAlert size={18} />, '黄灯关注', data?.yellow_count ?? '—', 'text-amber-600')}
        {stat(<CheckCircle2 size={18} />, '健康商户', data?.green_count ?? '—', 'text-emerald-600')}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* 评分榜 */}
        <div className="xl:col-span-3 space-y-6">
          <Card title="商户健康评分榜" subtitle="按分数升序（红灯优先）">
            <div ref={chartRef} className="h-[320px]" />
          </Card>

          {/* 红灯预警列表 */}
          <Card title="红灯 / 黄灯预警" subtitle="健康分 < 80 的商户，展开查看 5 维明细">
            <div className="space-y-3">
              {(data?.tenants ?? [])
                .filter((t) => t.level !== 'green')
                .map((t) => (
                  <div key={t.workspace_id} className="border border-[#E4E6DC] dark:border-gray-700 rounded-xl overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#F7F8F2] dark:hover:bg-gray-800/50 transition-colors text-left"
                      onClick={() => setExpanded(expanded === t.workspace_id ? null : t.workspace_id)}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${levelColor[t.level]}`}>
                          {t.level === 'red' ? '红灯' : '黄灯'} {t.score}
                        </span>
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-gray-100">{t.name}</p>
                          <p className="text-xs text-gray-400">
                            近 7 天营收 ¥{(t.metrics.revenue_7d ?? 0).toLocaleString()} · 退款率 {t.metrics.refund_rate}% · 环比 {t.metrics.growth > 0 ? '+' : ''}{t.metrics.growth}%
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        {t.metrics.stockout_count > 0 && (
                          <span className="inline-flex items-center gap-1"><PackageX size={12} />断货 {t.metrics.stockout_count}</span>
                        )}
                        {t.metrics.churn_count > 0 && (
                          <span className="inline-flex items-center gap-1"><UsersIcon size={12} />流失 {t.metrics.churn_count}</span>
                        )}
                        <span className="text-gray-300">▾</span>
                      </div>
                    </button>
                    {expanded === t.workspace_id && (
                      <div className="px-4 pb-4 border-t border-[#E4E6DC] dark:border-gray-700 bg-[#FAFAF6] dark:bg-gray-800/40">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-4">
                          {t.dimensions.map((d) => (
                            <div key={d.key} className="bg-white dark:bg-gray-800 rounded-lg border border-[#E4E6DC] dark:border-gray-700 p-3">
                              <p className="text-xs text-gray-400">{d.name}</p>
                              <p className={`mt-1 text-lg font-extrabold tabular-nums ${d.level === 'red' ? 'text-red-600' : d.level === 'yellow' ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {d.score}
                              </p>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${levelColor[d.level]}`}>
                                {d.level === 'red' ? '红灯' : d.level === 'yellow' ? '黄灯' : '绿'}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2 pt-3">
                          {t.metrics.overstock_count > 0 && (
                            <span className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-900/20">
                              <TrendingDown size={11} /> 滞销 SKU {t.metrics.overstock_count}
                            </span>
                          )}
                          {t.metrics.repeat_rate > 0 && (
                            <span className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20">
                              复购率 {t.metrics.repeat_rate}%
                            </span>
                          )}
                          {t.status === 'suspended' && (
                            <span className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700">
                              已暂停
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              {(!data?.tenants || data.tenants.filter((t) => t.level !== 'green').length === 0) && (
                <div className="py-8 text-center text-gray-400 flex flex-col items-center gap-2">
                  <CheckCircle2 size={28} className="text-emerald-400" />
                  所有商户经营健康，无预警
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* 右侧：维度分布总览 */}
        <div className="xl:col-span-2 space-y-6">
          <Card title="平台健康分布" subtitle="当前商户的健康等级构成">
            <div className="space-y-4 pt-2">
              {[
                { label: '健康（≥80）', color: 'bg-emerald-500', count: data?.green_count ?? 0 },
                { label: '黄灯（60-79）', color: 'bg-amber-500', count: data?.yellow_count ?? 0 },
                { label: '红灯（<60）', color: 'bg-red-500', count: data?.red_count ?? 0 },
              ].map((row) => {
                const pct = data?.total ? (row.count / data.total) * 100 : 0;
                return (
                  <div key={row.label}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="text-gray-500">{row.label}</span>
                      <span className="font-bold tabular-nums text-slate-900 dark:text-gray-100">{row.count} · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2.5 bg-[#F0F1EA] dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full ${row.color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="关于评分" subtitle="口径与业务端经营健康引擎一致">
            <ul className="space-y-2.5 text-sm text-gray-500 pt-1">
              <li className="flex gap-2"><span className="text-[#0071E3] font-bold">·</span>现金流 25% — 退款率与营收环比</li>
              <li className="flex gap-2"><span className="text-[#0071E3] font-bold">·</span>库存 25% — 滞销 / 断货 SKU 占比</li>
              <li className="flex gap-2"><span className="text-[#0071E3] font-bold">·</span>客户 20% — 复购率与流失率</li>
              <li className="flex gap-2"><span className="text-[#0071E3] font-bold">·</span>渠道 15% — 集中度与渠道环比</li>
              <li className="flex gap-2"><span className="text-[#0071E3] font-bold">·</span>增长 15% — 近 7 天营收环比</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
};
