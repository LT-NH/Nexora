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

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/**
 * HealthRadarChart —— 经营健康六维雷达图（v7 升级版）。
 * - 顶点直读：每个维度轴标签直接显示分数，按健康等级着色，凹陷即薄弱一眼可见
 * - 上期叠影：传入 previous 时叠加灰色虚线多边形，直观对比本期 vs 上期
 * - 点击联动：selectedKey 维度顶点放大强调（配合卡片维度条/归因高亮）
 * - tooltip：六维完整清单 + 本期/上期/环比增量，按等级着色
 */
export const HealthRadarChart: React.FC<{
  dimensions: HealthDimension[];
  previous?: HealthDimension[] | null;
  selectedKey?: string | null;
}> = ({ dimensions, previous, selectedKey }) => {
  const dims = dimensions.length > 0 ? dimensions : [];
  const option = useMemo<EChartsOption>(() => {
    const names = dims.map((d) => d.name);
    const values = dims.map((d) => clamp(d.score));
    const selectedIdx = selectedKey ? dims.findIndex((d) => d.key === selectedKey) : -1;

    // 上期数据按 key 对齐（防止维度顺序变化导致错位）
    const prevByKey: Record<string, number> = {};
    (previous ?? []).forEach((d) => { prevByKey[d.key] = clamp(d.score); });
    const hasPrev = (previous ?? []).length > 0;
    const prevValues = hasPrev ? dims.map((d) => prevByKey[d.key] ?? clamp(d.score)) : null;

    // 轴标签富文本：维度名（灰）+ 顶点分数（按等级着色）
    const rich: Record<string, any> = {
      n: { color: '#6b7280', fontSize: 12, fontWeight: 600, align: 'center' as const, lineHeight: 17 },
    };
    names.forEach((_, i) => {
      rich[`s${i}`] = {
        color: LEVEL_COLOR[dims[i]?.level] ?? '#8b5cf6',
        fontSize: 14,
        fontWeight: 800,
        align: 'center' as const,
        lineHeight: 17,
      };
    });

    const seriesData: any[] = [];
    if (hasPrev && prevValues) {
      seriesData.push({
        value: prevValues,
        name: '上期',
        symbol: 'circle',
        symbolSize: 3,
        lineStyle: { color: 'rgba(107,114,128,0.6)', width: 1.5, type: 'dashed' },
        itemStyle: { color: 'rgba(107,114,128,0.6)' },
        areaStyle: { color: 'rgba(107,114,128,0.04)' },
        emphasis: { disabled: true },
      });
    }
    seriesData.push({
      value: values,
      name: '本期',
      symbol: 'circle',
      // 选中维度的顶点放大，形成"点击联动"的视觉锚点
      symbolSize: (_val: unknown, params: any) => (params.dataIndex === selectedIdx ? 10 : 5),
      areaStyle: { color: 'rgba(139,92,246,0.22)' },
      lineStyle: { color: '#8b5cf6', width: 2.5 },
      itemStyle: {
        color: (params: any) => LEVEL_COLOR[dims[params.dataIndex]?.level] ?? '#8b5cf6',
      },
    });

    return {
      backgroundColor: 'transparent',
      legend: hasPrev
        ? {
            data: ['本期', '上期'],
            bottom: 0,
            icon: 'roundRect',
            itemWidth: 14,
            itemHeight: 4,
            textStyle: { color: '#6b7280', fontSize: 11 },
          }
        : undefined,
      tooltip: {
        trigger: 'item',
        formatter: () => {
          const rows = dims
            .map((d, i) => {
              const lv = d.level === 'green' ? '健康' : d.level === 'yellow' ? '需关注' : '需干预';
              const color = LEVEL_COLOR[d.level] ?? '#8b5cf6';
              const prev = prevValues ? prevValues[i] : null;
              const delta = prev !== null ? d.score - prev : null;
              const deltaHtml =
                delta === null
                  ? ''
                  : delta > 0
                    ? `<span style="color:#10b981;font-size:11px">+${delta}</span>`
                    : delta < 0
                      ? `<span style="color:#ef4444;font-size:11px">${delta}</span>`
                      : `<span style="color:#9ca3af;font-size:11px">±0</span>`;
              const prevHtml =
                prev !== null
                  ? `<span style="color:#9ca3af;font-size:11px">上期 ${prev}</span> ${deltaHtml}`
                  : '';
              return `<div style="display:flex;justify-content:space-between;gap:16px;align-items:baseline;line-height:1.9;">
                <span>${d.name}</span>
                <span><b style="color:${color};font-variant-numeric:tabular-nums">${d.score}</b>
                <span style="color:${color};font-size:11px">${lv}</span>
                <span style="margin-left:8px">${prevHtml}</span></span></div>`;
            })
            .join('');
          return `<div style="font-size:12px;min-width:200px">${rows}</div>`;
        },
      },
      radar: {
        indicator: names.map((n) => ({ name: n, max: 100 })),
        radius: '66%',
        center: ['50%', '50%'],
        splitNumber: 4,
        shape: 'polygon',
        axisName: {
          formatter: (name?: string) => {
            const n = name ?? '';
            const i = names.indexOf(n);
            if (i < 0) return n;
            return `{n|${n}}\n{s${i}|${values[i]}}`;
          },
          rich,
        },
        axisLine: { lineStyle: { color: 'rgba(107,114,128,0.25)' } },
        splitLine: { lineStyle: { color: 'rgba(107,114,128,0.2)' } },
        splitArea: {
          areaStyle: { color: ['rgba(139,92,246,0.02)', 'rgba(139,92,246,0.05)'] },
        },
      },
      series: [{ type: 'radar', data: seriesData }],
    };
  }, [dims, previous, selectedKey]);

  const ref = useEChart(option, [dims, previous, selectedKey]);

  return <div ref={ref} style={{ width: '100%', height: '420px' }} />;
};
