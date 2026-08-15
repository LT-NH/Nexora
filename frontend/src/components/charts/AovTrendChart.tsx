import React, { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { useEChart } from '@/hooks/useEChart';

interface AovTrendChartProps {
  data: { date: string; value: number }[];
}

export const AovTrendChart: React.FC<AovTrendChartProps> = ({ data }) => {
  const option = useMemo<EChartsOption>(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (p: any) => `${p[0].axisValue}<br/>客单价: ¥${p[0].value.toFixed(2)}`,
    },
    grid: { left: '3%', right: '4%', bottom: '8%', top: '5%', containLabel: true },
    xAxis: {
      type: 'category',
      data: data.map(d => d.date),
      axisLabel: { rotate: 30, fontSize: 10 },
    },
    yAxis: { type: 'value', name: '客单价(¥)' },
    series: [
      {
        type: 'line',
        smooth: true,
        data: data.map(d => Math.round(d.value * 100) / 100),
        itemStyle: { color: '#f59e0b' },
        lineStyle: { width: 3, color: '#f59e0b' },
        symbol: 'circle',
        symbolSize: 8,
        areaStyle: { color: 'rgba(245,158,11,0.1)' },
        markLine: {
          data: [{ type: 'average', name: '均值' }],
          lineStyle: { color: '#ef4444', type: 'dashed' },
          label: { fontSize: 10, color: '#ef4444' },
        },
      },
    ],
  }), [data]);

  const ref = useEChart(option, [data]);

  return <div ref={ref} style={{ width: '100%', height: '280px' }} />;
};
