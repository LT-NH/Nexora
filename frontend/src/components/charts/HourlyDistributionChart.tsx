import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface HourlyDistributionChartProps {
  data: { hour: number; orders: number; revenue: number }[];
}

export const HourlyDistributionChart: React.FC<HourlyDistributionChartProps> = ({ data }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts>();

  useEffect(() => {
    if (!chartRef.current) return;
    chartInstance.current = echarts.init(chartRef.current);
    const isDark = document.documentElement.classList.contains('dark');
    const labelColor = isDark ? '#9ca3af' : '#6b7280';

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? 'rgba(17,24,39,0.95)' : 'rgba(255,255,255,0.95)',
        borderColor: isDark ? '#374151' : '#e5e7eb',
        textStyle: { color: isDark ? '#f3f4f6' : '#111827' },
      },
      grid: { left: '3%', right: '4%', bottom: '8%', top: '8%', containLabel: true },
      xAxis: {
        type: 'category',
        data: data.map(d => `${d.hour}:00`),
        axisLabel: { fontSize: 10, color: labelColor, interval: 2 },
        axisLine: { lineStyle: { color: labelColor } },
      },
      yAxis: [
        {
          type: 'value', name: '订单数', position: 'left',
          axisLabel: { color: labelColor },
          splitLine: { lineStyle: { color: isDark ? '#374151' : '#f3f4f6' } },
        },
        {
          type: 'value', name: '销售额(¥)', position: 'right',
          axisLabel: { color: labelColor },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '订单数', type: 'bar',
          data: data.map(d => d.orders),
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#6366f1' },
              { offset: 1, color: '#8b5cf6' },
            ]),
            borderRadius: [4, 4, 0, 0],
          },
        },
        {
          name: '销售额', type: 'line', yAxisIndex: 1, smooth: true,
          data: data.map(d => d.revenue),
          itemStyle: { color: '#06b6d4' },
          lineStyle: { width: 3 },
          symbol: 'circle', symbolSize: 6,
          areaStyle: { color: 'rgba(6, 182, 212, 0.1)' },
        },
      ],
    };
    chartInstance.current.setOption(option);
    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.current?.dispose();
    };
  }, [data]);

  return <div ref={chartRef} style={{ width: '100%', height: '280px' }} />;
};
