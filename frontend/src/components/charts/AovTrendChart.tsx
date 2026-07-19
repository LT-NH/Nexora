import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface AovTrendChartProps {
  data: { date: string; value: number }[];
}

export const AovTrendChart: React.FC<AovTrendChartProps> = ({ data }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts>();

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;
    chartInstance.current = echarts.init(chartRef.current);
    const isDark = document.documentElement.classList.contains('dark');
    const labelColor = isDark ? '#9ca3af' : '#6b7280';

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'axis',
        formatter: (p: any) => `${p[0].axisValue}<br/>客单价: ¥${p[0].value.toFixed(2)}`,
        backgroundColor: isDark ? 'rgba(17,24,39,0.95)' : 'rgba(255,255,255,0.95)',
        borderColor: isDark ? '#374151' : '#e5e7eb',
        textStyle: { color: isDark ? '#f3f4f6' : '#111827' },
      },
      grid: { left: '3%', right: '4%', bottom: '8%', top: '5%', containLabel: true },
      xAxis: {
        type: 'category',
        data: data.map(d => d.date),
        axisLabel: { rotate: 30, fontSize: 10, color: labelColor },
      },
      yAxis: {
        type: 'value',
        name: '客单价(¥)',
        axisLabel: { color: labelColor },
        splitLine: { lineStyle: { color: isDark ? '#374151' : '#f0f0f0' } },
      },
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
