import React, { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { useEChart } from '@/hooks/useEChart';
import { useChartPalette } from '@/hooks/useChartPalette';

interface PlatformRevenueChartProps {
  data: { name: string; value: number; count: number }[];
}

export const PlatformRevenueChart: React.FC<PlatformRevenueChartProps> = ({ data }) => {
    const palette = useChartPalette();
const option = useMemo<EChartsOption>(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (p: any) =>
        `${p.marker} ${p.name}<br/>¥${(p.value / 10000).toFixed(2)}万 (${p.percent}%)<br/>${p.data.count} 笔订单`,
    },
    legend: { orient: 'vertical', right: 10, top: 'center' },
    color: [...palette.series, '#10b981', '#f59e0b', '#ef4444'],
    series: [
      {
        name: '平台销售',
        type: 'pie',
        radius: ['50%', '75%'],
        center: ['38%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: {
          show: true,
          position: 'center',
          formatter: (p: any) => `{total|总销售}\n{a|¥${(p.value || 0).toLocaleString()}}`,
          rich: {
            total: { fontSize: 14, fontWeight: 600, lineHeight: 30 },
            a: { fontSize: 12, lineHeight: 20 },
          },
        },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' }, scaleSize: 8 },
        data: data.map(d => ({ ...d })),
      },
    ],
  }), [data]);

  const ref = useEChart(option, [data]);

  return <div ref={ref} style={{ width: '100%', height: '320px' }} />;
};
