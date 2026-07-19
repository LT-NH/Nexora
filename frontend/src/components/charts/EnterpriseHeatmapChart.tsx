import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface EnterpriseHeatmapChartProps {
  data: [number, number, number][]; // [hour, dayOfWeek, count]
}

export const EnterpriseHeatmapChart: React.FC<EnterpriseHeatmapChartProps> = ({ data }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    const hours = Array.from({length: 24}, (_, i) => `${i}:00`);
    const days = ['周一','周二','周三','周四','周五','周六','周日'];
    chart.setOption({
      tooltip: { position: 'top' },
      grid: { left: '8%', bottom: '8%', top: '3%', right: '5%' },
      xAxis: { type: 'category', data: hours, axisLabel: { fontSize: 10 }, splitArea: { show: true } },
      yAxis: { type: 'category', data: days, axisLabel: { fontSize: 10 }, splitArea: { show: true } },
      visualMap: { min: 0, max: 30, calculable: true, orient: 'horizontal', left: 'center', bottom: 0, inRange: { color: ['#e0f7fa','#80deea','#26c6da','#00838f','#006064'] } },
      series: [{ type: 'heatmap', data: data, label: { show: true, fontSize: 9 }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } } }],
    });
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); chart.dispose(); };
  }, [data]);
  return <div ref={chartRef} style={{ width: '100%', height: '320px' }} />;
};
