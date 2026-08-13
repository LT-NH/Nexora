import React, { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { useEChart } from '@/hooks/useEChart';
import { useChartPalette } from '@/hooks/useChartPalette';

interface SalesTrendChartProps {
  data: { date: string; amount: number; orders: number }[];
  /** 是否叠加未来 7 天预测（线性外推，默认开启） */
  showForecast?: boolean;
}

/** 基于最后 n 天做最小二乘线性外推，返回未来 days 天的金额预测 */
function linearForecast(
  data: { date: string; amount: number }[],
  days = 7,
  lookback = 14
): { date: string; amount: number }[] {
  if (data.length < 4) return [];
  const base = data.slice(-lookback);
  const n = base.length;
  const xs = base.map((_, i) => i);
  const ys = base.map((d) => d.amount);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) * (xs[i] - mx);
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  const last = base[n - 1].date;
  const lastDate = last ? new Date(last) : new Date();
  const out: { date: string; amount: number }[] = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const v = Math.max(0, Math.round(intercept + slope * (n - 1 + i)));
    out.push({ date: iso, amount: v });
  }
  return out;
}

export const SalesTrendChart: React.FC<SalesTrendChartProps> = ({ data, showForecast = true }) => {
  const palette = useChartPalette();

  const option = useMemo<EChartsOption>(() => {
    const forecast = showForecast ? linearForecast(data) : [];
    const xData = [...data.map((d) => d.date), ...forecast.map((f) => f.date)];
    const histAmount = data.map((d) => d.amount);
    const amountSeries = [...histAmount, ...Array(forecast.length).fill(null)];
    const forecastSeries = forecast.length
      ? [...Array(data.length).fill(null), ...forecast.map((f) => f.amount)]
      : [];
    // 置信带上限（预测值 +12%），作为半透明面积
    const bandSeries = forecast.length
      ? [...Array(data.length).fill(null), ...forecast.map((f) => f.amount * 1.12)]
      : [];

    const series: EChartsOption['series'] = [
      {
        name: '销售额',
        type: 'line',
        smooth: true,
        data: amountSeries,
        itemStyle: { color: palette.primary },
        areaStyle: { color: palette.area },
      },
    ];
    if (forecast.length) {
      series.push(
        {
          name: '预测(未来7天)',
          type: 'line',
          smooth: true,
          data: forecastSeries,
          lineStyle: { color: palette.neutral, type: 'dashed', width: 2 },
          itemStyle: { color: palette.neutral },
          symbol: 'circle',
          symbolSize: 5,
        },
        {
          name: '预测置信带',
          type: 'line',
          smooth: true,
          data: bandSeries,
          lineStyle: { opacity: 0 },
          symbol: 'none',
          tooltip: { show: false },
          areaStyle: { color: palette.area, opacity: 0.35 },
          legendHoverLink: false,
        }
      );
    }
    series.push({
      name: '订单数',
      type: 'bar',
      yAxisIndex: 1,
      data: data.map((d) => d.orders),
      itemStyle: { color: '#10b981', opacity: 0.6 },
    });

    return {
      backgroundColor: 'transparent',
      animationDuration: 900,
      animationEasing: 'cubicOut',
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v: unknown) => (typeof v === 'number' ? `¥${v.toLocaleString('en-US')}` : String(v ?? '')),
      },
      legend: { data: ['销售额', '订单数', '预测(未来7天)'], bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '10%', top: '5%', containLabel: true },
      xAxis: {
        type: 'category',
        data: xData,
        axisLabel: { rotate: 45, fontSize: 10 },
      },
      yAxis: [
        {
          type: 'value',
          name: '销售额(¥)',
          position: 'left',
          axisLabel: { formatter: (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)) },
        },
        { type: 'value', name: '订单数', position: 'right' },
      ],
      series,
    };
  }, [data, showForecast, palette]);

  const ref = useEChart(option, [data, showForecast, palette]);

  return <div ref={ref} style={{ width: '100%', height: '300px' }} />;
};
