import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface ForecastData {
  date: string; actual: number | null; forecast: number | null; 
}

export const EnterpriseForecastChart: React.FC<{ data: ForecastData[] }> = ({ data }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    const isDark = document.documentElement.classList.contains('dark');
    chart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['历史营收', 'AI预测'], bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '12%', top: '5%', containLabel: true },
      xAxis: { type: 'category', data: data.map(d => d.date), axisLabel: { rotate: 30, fontSize: 10 } },
      yAxis: { type: 'value', name: '营收(¥)' },
      series: [
        { name: '历史营收', type: 'line', smooth: true, data: data.map(d => d.actual), itemStyle: { color: '#2560eb' }, areaStyle: { color: 'rgba(37,96,235,0.1)' } },
        { name: 'AI预测', type: 'line', smooth: true, data: data.map(d => d.forecast), itemStyle: { color: '#f59e0b' }, lineStyle: { type: 'dashed' }, symbol: 'diamond', symbolSize: 8, areaStyle: { color: 'rgba(245,158,11,0.08)' } },
      ],
    });
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); chart.dispose(); };
  }, [data]);
  return <div ref={chartRef} style={{ width: '100%', height: '320px' }} />;
};
