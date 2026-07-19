import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface PlatformRevenueChartProps {
  data: { name: string; value: number; count: number }[];
}

export const PlatformRevenueChart: React.FC<PlatformRevenueChartProps> = ({ data }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts>();

  useEffect(() => {
    if (!chartRef.current) return;
    chartInstance.current = echarts.init(chartRef.current);
    const isDark = document.documentElement.classList.contains('dark');
    const labelColor = isDark ? '#f3f4f6' : '#111827';

    const rich = {
      total: { color: labelColor, fontSize: 14, fontWeight: 600, lineHeight: 30 },
      a: { color: labelColor, fontSize: 12, lineHeight: 20 },
    };

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'item',
        backgroundColor: isDark ? 'rgba(17,24,39,0.95)' : 'rgba(255,255,255,0.95)',
        borderColor: isDark ? '#374151' : '#e5e7eb',
        textStyle: { color: isDark ? '#f3f4f6' : '#111827' },
        formatter: (p: any) => `${p.marker} ${p.name}<br/>¥${(p.value / 10000).toFixed(2)}万 (${p.percent}%)<br/>${p.data.count} 笔订单`,
      },
      legend: {
        orient: 'vertical', right: 10, top: 'center',
        textStyle: { color: labelColor },
      },
      color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
      series: [
        {
          name: '平台销售',
          type: 'pie',
          radius: ['50%', '75%'],
          center: ['38%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: isDark ? '#1f2937' : '#fff', borderWidth: 2 },
          label: {
            show: true,
            position: 'center',
            formatter: (p: any) => `{total|总销售}\n{a|¥${(p.value || 0).toLocaleString()}}`,
            rich,
          },
          emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' }, scaleSize: 8 },
          data: data.map(d => ({ ...d })),
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
