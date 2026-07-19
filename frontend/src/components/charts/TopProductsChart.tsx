import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface TopProductsChartProps {
  data: { name: string; revenue: number; units: number }[];
}

export const TopProductsChart: React.FC<TopProductsChartProps> = ({ data }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts>();

  useEffect(() => {
    if (!chartRef.current) return;
    chartInstance.current = echarts.init(chartRef.current);
    const isDark = document.documentElement.classList.contains('dark');
    const labelColor = isDark ? '#d1d5db' : '#374151';

    // Top 8 products
    const top = data.slice(0, 8);
    const names = top.map(d => d.name.length > 14 ? d.name.slice(0, 14) + '…' : d.name);

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? 'rgba(17,24,39,0.95)' : 'rgba(255,255,255,0.95)',
        borderColor: isDark ? '#374151' : '#e5e7eb',
        textStyle: { color: isDark ? '#f3f4f6' : '#111827' },
        axisPointer: { type: 'shadow' },
      },
      grid: { left: '3%', right: '8%', bottom: '3%', top: '3%', containLabel: true },
      xAxis: {
        type: 'value', name: '销售额(¥)',
        axisLabel: { color: labelColor, formatter: (v: number) => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : `${v}` },
        splitLine: { lineStyle: { color: isDark ? '#374151' : '#f3f4f6' } },
      },
      yAxis: {
        type: 'category',
        data: names.reverse(),
        axisLabel: { color: labelColor, fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          name: '销售额', type: 'bar',
          data: top.map(d => d.revenue).reverse(),
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#06b6d4' },
              { offset: 1, color: '#8b5cf6' },
            ]),
            borderRadius: [0, 6, 6, 0],
          },
          label: {
            show: true, position: 'right',
            color: labelColor, fontSize: 10,
            formatter: (p: any) => `¥${(p.value / 10000).toFixed(1)}万`,
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

  return <div ref={chartRef} style={{ width: '100%', height: '320px' }} />;
};
