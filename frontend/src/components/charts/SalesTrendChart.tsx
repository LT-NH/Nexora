import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface SalesTrendChartProps {
  data: { date: string; amount: number; orders: number }[];
}

export const SalesTrendChart: React.FC<SalesTrendChartProps> = ({ data }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts>();

  useEffect(() => {
    if (!chartRef.current) return;
    chartInstance.current = echarts.init(chartRef.current);
    
    const option: echarts.EChartsOption = {
      tooltip: { trigger: 'axis' },
      legend: { data: ['销售额', '订单数'], bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '10%', top: '5%', containLabel: true },
      xAxis: {
        type: 'category',
        data: data.map(d => d.date),
        axisLabel: { rotate: 45, fontSize: 10 }
      },
      yAxis: [
        { type: 'value', name: '销售额(¥)', position: 'left' },
        { type: 'value', name: '订单数', position: 'right' }
      ],
      series: [
        {
          name: '销售额',
          type: 'line',
          smooth: true,
          data: data.map(d => d.amount),
          itemStyle: { color: '#6366f1' },
          areaStyle: { color: 'rgba(99, 102, 241, 0.1)' }
        },
        {
          name: '订单数',
          type: 'bar',
          yAxisIndex: 1,
          data: data.map(d => d.orders),
          itemStyle: { color: '#10b981', opacity: 0.6 }
        }
      ]
    };
    chartInstance.current.setOption(option);

    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.current?.dispose();
    };
  }, [data]);

  return <div ref={chartRef} style={{ width: '100%', height: '300px' }} />;
};
