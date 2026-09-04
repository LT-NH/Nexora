import React, { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { useEChart } from '@/hooks/useEChart';

interface HealthDimension {
  key: string;
  name: string;
  score: number;
  level: string;
}

const LEVEL_COLOR: Record<string, string> = {
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
};

/**
 * HealthRadarChart —— 经营健康六维雷达图。
 * 以多边形直观呈现各维度得分，轮廓一眼可见短板所在（凹陷即薄弱维度）。
 * - 面积：主品牌色紫渐变填充，弱化纯色噪音
 * - 端点：按维度健康等级着色（红/黄/绿），tooltip 给出分数与等级
 * - 网格 splitArea 淡色填充，满分参考圈为 100
 */
export const HealthRadarChart: React.FC<{ dimensions: HealthDimension[] }> = ({ dimensions }) => {
  const dims = dimensions.length > 0 ? dimensions : [];
  const option = useMemo<EChartsOption>(() => {
    const names = dims.map((d) => d.name);
    const values = dims.map((d) => Math.max(0, Math.min(100, d.score)));

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const idx = p.dataIndex ?? p.seriesIndex;
          const d = dims[idx];
          if (!d) return '';
          const lv = d.level === 'green' ? '健康' : d.level === 'yellow' ? '需关注' : '需干预';
          return `${d.name}<br/><b>${d.score}</b> 分 · ${lv}`;
        },
      },
      radar: {
        indicator: names.map((n) => ({ name: n, max: 100 })),
        radius: '62%',
        center: ['50%', '54%'],
        splitNumber: 4,
        shape: 'polygon',
        axisName: {
          color: '#6b7280',
          fontSize: 12,
          fontWeight: 600,
        },
        axisLine: { lineStyle: { color: 'rgba(107,114,128,0.25)' } },
        splitLine: { lineStyle: { color: 'rgba(107,114,128,0.2)' } },
        splitArea: {
          areaStyle: { color: ['rgba(139,92,246,0.02)', 'rgba(139,92,246,0.05)'] },
        },
      },
      series: [
        {
          type: 'radar',
          symbol: 'circle',
          symbolSize: 5,
          data: [
            {
              value: values,
              name: '健康分',
              areaStyle: {
                color: 'rgba(139,92,246,0.22)',
              },
              lineStyle: { color: '#8b5cf6', width: 2.5 },
              itemStyle: {
                color: (params: any) => LEVEL_COLOR[dims[params.dataIndex]?.level] ?? '#8b5cf6',
              },
            },
          ],
        },
      ],
    };
  }, [dims]);

  const ref = useEChart(option, [dims]);

  return <div ref={ref} style={{ width: '100%', height: '252px' }} />;
};
