import React, { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { useEChart } from '@/hooks/useEChart';
import { useChartPalette } from '@/hooks/useChartPalette';

interface OrderStatusChartProps {
  data: { name: string; value: number; color?: string }[];
}

export const OrderStatusChart: React.FC<OrderStatusChartProps> = ({ data }) => {
    const palette = useChartPalette();
const option = useMemo<EChartsOption>(() => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, left: 'center' },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
        data: data.map(d => ({
          name: d.name,
          value: d.value,
          itemStyle: { color: d.color || palette.primary },
        })),
      },
    ],
  }), [data]);

  const ref = useEChart(option, [data]);

  return <div ref={ref} style={{ width: '100%', height: '280px' }} />;
};
