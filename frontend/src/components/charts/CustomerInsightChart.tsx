import React, { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { useEChart } from '@/hooks/useEChart';
import { useChartPalette } from '@/hooks/useChartPalette';

interface CustomerInsightChartProps {
  data: { segment: string; count: number; avgValue: number }[];
}

export const CustomerInsightChart: React.FC<CustomerInsightChartProps> = ({ data }) => {
    const palette = useChartPalette();
const option = useMemo<EChartsOption>(() => {
    const colors = ['#ef4444', '#f59e0b', '#10b981', ...palette.series.slice(2, 5)];
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['客户数', '平均消费(¥)'], bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '10%', top: '5%', containLabel: true },
      xAxis: {
        type: 'category',
        data: data.map(d => d.segment),
        axisLabel: { fontSize: 11 },
      },
      yAxis: [
        { type: 'value', name: '客户数', position: 'left' },
        { type: 'value', name: '平均消费(¥)', position: 'right' },
      ],
      series: [
        {
          name: '客户数',
          type: 'bar',
          data: data.map((d, i) => ({ value: d.count, itemStyle: { color: colors[i % colors.length] } })),
          barWidth: '40%',
        },
        {
          name: '平均消费(¥)',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: data.map(d => d.avgValue),
          itemStyle: { color: '#f59e0b' },
        },
      ],
    };
  }, [data]);

  const ref = useEChart(option, [data]);

  return <div ref={ref} style={{ width: '100%', height: '300px' }} />;
};
