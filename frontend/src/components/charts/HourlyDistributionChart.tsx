import React, { useMemo } from 'react';
import * as echarts from 'echarts';
import { useEChart } from '@/hooks/useEChart';
import { useChartPalette } from '@/hooks/useChartPalette';

interface HourlyDistributionChartProps {
  data: { hour: number; orders: number; revenue: number }[];
}

export const HourlyDistributionChart: React.FC<HourlyDistributionChartProps> = ({ data }) => {
    const palette = useChartPalette();
const option = useMemo<echarts.EChartsOption>(() => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '8%', top: '8%', containLabel: true },
    xAxis: {
      type: 'category',
      data: data.map(d => `${d.hour}:00`),
      axisLabel: { fontSize: 10, interval: 2 },
    },
    yAxis: [
      { type: 'value', name: '订单数', position: 'left' },
      { type: 'value', name: '销售额(¥)', position: 'right', splitLine: { show: false } },
    ],
    series: [
      {
        name: '订单数',
        type: 'bar',
        data: data.map(d => d.orders),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: palette.primary },
            { offset: 1, color: palette.series[1] },
          ]),
          borderRadius: [4, 4, 0, 0],
        },
      },
      {
        name: '销售额',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: data.map(d => d.revenue),
        itemStyle: { color: '#06b6d4' },
        lineStyle: { width: 3 },
        symbol: 'circle',
        symbolSize: 6,
        areaStyle: { color: 'rgba(6, 182, 212, 0.1)' },
      },
    ],
  }), [data]);

  const ref = useEChart(option, [data]);

  return <div ref={ref} style={{ width: '100%', height: '280px' }} />;
};
