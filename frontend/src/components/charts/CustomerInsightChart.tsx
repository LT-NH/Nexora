import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface CustomerInsightChartProps {
  data: { segment: string; count: number; avgValue: number }[];
}

export const CustomerInsightChart: React.FC<CustomerInsightChartProps> = ({ data }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts>();

  useEffect(() => {
    if (!chartRef.current) return;
    chartInstance.current = echarts.init(chartRef.current);

    const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];
    
    const option: echarts.EChartsOption = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['客户数', '平均消费(¥)'], bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '10%', top: '5%', containLabel: true },
      xAxis: {
        type: 'category',
        data: data.map(d => d.segment),
        axisLabel: { fontSize: 11 }
      },
      yAxis: [
        { type: 'value', name: '客户数', position: 'left' },
        { type: 'value', name: '平均消费(¥)', position: 'right' }
      ],
      series: [
        {
          name: '客户数',
          type: 'bar',
          data: data.map((d, i) => ({ value: d.count, itemStyle: { color: colors[i % colors.length] } })),
          barWidth: '40%'
        },
        {
          name: '平均消费(¥)',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: data.map(d => d.avgValue),
          itemStyle: { color: '#f59e0b' }
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
