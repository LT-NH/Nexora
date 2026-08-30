import { useRef, useEffect } from 'react';
// ECharts 按需引入的唯一运行时入口（见 src/lib/echarts.ts 的说明）
import echarts from '@/lib/echarts';
import type { EChartsOption, EChartsType } from 'echarts';
import { useTheme } from './useTheme';

/**
 * useEChart —— 封装 ECharts 的初始化、主题响应、增量更新与 resize 监听，
 * 消除各图表组件中重复的 init / dispose / resize / addEventListener 样板代码。
 *
 * - 主题响应：resolvedTheme 变化时自动 dispose 并以对应主题（'dark' 或默认）重新 init。
 * - 增量更新：option 变化时调用 setOption({ notMerge: false })，而非整体重建实例。
 * - resize：自动监听 window resize 并触发 chart.resize()。
 *
 * @param option ECharts 配置项（建议在外部用 useMemo 包装）
 * @param deps   额外依赖，与 option 一并作为 setOption 的触发条件
 * @returns 绑定到图表容器的 ref
 */
export function useEChart(option: EChartsOption, deps: unknown[] = []) {
  const ref = useRef<HTMLDivElement>(null);
  type ChartInstance = ReturnType<typeof echarts.init>;
  const chartRef = useRef<ChartInstance | null>(null);
  const { resolvedTheme } = useTheme();

  // Init / dispose on theme change
  useEffect(() => {
    if (!ref.current) return;
    chartRef.current = echarts.init(
      ref.current,
      resolvedTheme === 'dark' ? 'dark' : null,
      { renderer: 'svg' }
    );
    const onResize = () => chartRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [resolvedTheme]);

  // Update option (incremental, not rebuild).
  // resolvedTheme 同样作为依赖：主题切换会触发上方的 dispose + init，
  // 此处需在重新初始化后再次 setOption，否则新实例会是空白。
  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option, ...deps, resolvedTheme]);

  return ref;
}
