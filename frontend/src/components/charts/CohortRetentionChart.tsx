import React, { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { useEChart } from '@/hooks/useEChart';
import { useChartPalette } from '@/hooks/useChartPalette';

export interface CohortRow {
  month: string;
  size: number;
  retention: (number | null)[];
}

interface CohortRetentionChartProps {
  cohorts: CohortRow[];
  months: string[];
}

/** 短月份标签：2026-05 → 5月 */
const shortMonth = (m: string) => `${parseInt(m.slice(5), 10)}月`;

/**
 * CohortRetentionChart —— 留存热力图（首购月份 × 月份）。
 * 行 = 首购月份群，列 = 月份，色块 = 该群当月留存率（%）。
 */
export const CohortRetentionChart: React.FC<CohortRetentionChartProps> = ({ cohorts, months }) => {
  const palette = useChartPalette();

  const option = useMemo<EChartsOption>(() => {
    const heat: [number, number, number][] = [];
    cohorts.forEach((c, ci) => {
      c.retention.forEach((v, mi) => {
        if (v === null || v === undefined) return;
        heat.push([ci, mi, v]);
      });
    });

    return {
      backgroundColor: 'transparent',
      animationDuration: 900,
      tooltip: {
        position: 'top',
        formatter: (p: any) => {
          const c = cohorts[p.value[0]];
          if (!c) return '';
          const m = shortMonth(months[p.value[1]]);
          const offset = p.value[1];
          return `<b>${c.month} 首购群</b>（${c.size}人）<br/>第 ${offset} 个月留存：<b>${p.value[2]}%</b>`;
        },
      },
      grid: { left: '12%', right: '6%', top: '6%', bottom: '8%', containLabel: true },
      xAxis: {
        type: 'category',
        data: months.map(shortMonth),
        splitArea: { show: true },
        axisLabel: { fontSize: 10 },
      },
      yAxis: {
        type: 'category',
        data: cohorts.map((c) => `${shortMonth(c.month)}（${c.size}人）`),
        splitArea: { show: true },
        axisLabel: { fontSize: 10 },
      },
      visualMap: {
        min: 0,
        max: 100,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        text: ['100%', '0%'],
        inRange: {
          color: ['#f1f5f9', palette.primaryLight, palette.primary, palette.primaryDark],
        },
      },
      series: [
        {
          name: '留存率',
          type: 'heatmap',
          data: heat,
          label: {
            show: true,
            fontSize: 9,
            formatter: (p: any) => `${p.value[2]}%`,
          },
          emphasis: {
            itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' },
          },
        },
      ],
    };
  }, [cohorts, months, palette]);

  const ref = useEChart(option, [cohorts, months, palette]);

  return <div ref={ref} style={{ width: '100%', height: '320px' }} />;
};
