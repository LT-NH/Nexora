import React, { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { useEChart } from '@/hooks/useEChart';
import { useChartPalette } from '@/hooks/useChartPalette';

interface EnterpriseHeatmapChartProps {
  data: [number, number, number][]; // [hour, dayOfWeek, count]
}

export const EnterpriseHeatmapChart: React.FC<EnterpriseHeatmapChartProps> = ({ data }) => {
    const palette = useChartPalette();
const option = useMemo<EChartsOption>(() => {
    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    return {
      backgroundColor: 'transparent',
      tooltip: { position: 'top' },
      grid: { left: '8%', bottom: '8%', top: '3%', right: '5%' },
      xAxis: { type: 'category', data: hours, axisLabel: { fontSize: 10 }, splitArea: { show: true } },
      yAxis: { type: 'category', data: days, axisLabel: { fontSize: 10 }, splitArea: { show: true } },
      visualMap: {
        min: 0,
        max: 30,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        inRange: { color: [palette.primaryDark, palette.primary, palette.primaryLight] },
      },
      series: [
        {
          type: 'heatmap',
          data: data,
          label: { show: true, fontSize: 9 },
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } },
        },
      ],
    };
  }, [data]);

  const ref = useEChart(option, [data]);

  return <div ref={ref} style={{ width: '100%', height: '320px' }} />;
};
