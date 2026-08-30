import React, { useMemo } from 'react';
import echarts from '@/lib/echarts';
import type { EChartsOption } from 'echarts';
import { useEChart } from '@/hooks/useEChart';
import { useChartPalette } from '@/hooks/useChartPalette';

interface TopProductsChartProps {
  data: { name: string; revenue: number; units: number }[];
}

export const TopProductsChart: React.FC<TopProductsChartProps> = ({ data }) => {
    const palette = useChartPalette();
const option = useMemo<EChartsOption>(() => {
    const top = data.slice(0, 8);
    const names = top
      .map(d => (d.name.length > 14 ? d.name.slice(0, 14) + '…' : d.name))
      .reverse();
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '8%', bottom: '3%', top: '3%', containLabel: true },
      xAxis: {
        type: 'value',
        name: '销售额(¥)',
        axisLabel: {
          formatter: (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(0)}万` : `${v}`),
        },
      },
      yAxis: {
        type: 'category',
        data: names,
        axisLabel: { fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          name: '销售额',
          type: 'bar',
          data: top.map(d => d.revenue).reverse(),
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: palette.series[1] },
              { offset: 1, color: palette.primary },
            ]),
            borderRadius: [0, 6, 6, 0],
          },
          label: {
            show: true,
            position: 'right',
            fontSize: 10,
            formatter: (p: any) => `¥${(p.value / 10000).toFixed(1)}万`,
          },
        },
      ],
    };
  }, [data]);

  const ref = useEChart(option, [data]);

  return <div ref={ref} style={{ width: '100%', height: '320px' }} />;
};
