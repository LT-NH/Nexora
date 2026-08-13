import React, { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { useEChart } from '@/hooks/useEChart';
import { useChartPalette } from '@/hooks/useChartPalette';

interface ForecastData {
  date: string;
  actual: number | null;
  forecast: number | null;
}

export const EnterpriseForecastChart: React.FC<{ data: ForecastData[] }> = ({ data }) => {
    const palette = useChartPalette();
const option = useMemo<EChartsOption>(() => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { data: ['历史营收', 'AI预测'], bottom: 0 },
    grid: { left: '3%', right: '4%', bottom: '12%', top: '5%', containLabel: true },
    xAxis: { type: 'category', data: data.map(d => d.date), axisLabel: { rotate: 30, fontSize: 10 } },
    yAxis: { type: 'value', name: '营收(¥)' },
    series: [
      {
        name: '历史营收',
        type: 'line',
        smooth: true,
        data: data.map(d => d.actual),
        itemStyle: { color: palette.primary },
        areaStyle: { color: palette.area },
      },
      {
        name: 'AI预测',
        type: 'line',
        smooth: true,
        data: data.map(d => d.forecast),
        itemStyle: { color: '#f59e0b' },
        lineStyle: { type: 'dashed' },
        symbol: 'diamond',
        symbolSize: 8,
        areaStyle: { color: 'rgba(245,158,11,0.08)' },
      },
    ],
  }), [data]);

  const ref = useEChart(option, [data]);

  return <div ref={ref} style={{ width: '100%', height: '320px' }} />;
};
