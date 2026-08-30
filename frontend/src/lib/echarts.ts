/**
 * ECharts 按需引入（全项目唯一运行时入口）。
 *
 * 规则：任何文件都不要直接 `import ... from 'echarts'`（运行时部分），
 * 统一从本模块导入默认导出的 echarts。原因：
 * 1. 体积：只注册实际用到的图表（line/bar/pie/heatmap）与组件，
 *    相比全量包构建体积减少 60% 以上；
 * 2. 稳定：echarts.use 在此只执行一次，避免多入口重复注册
 *    触发 "CartesianAxisPointer exists" 之类的崩溃。
 *
 * 类型（EChartsOption / EChartsType）仍可 `import type { ... } from 'echarts'`
 * ——类型在构建时擦除，不产生任何运行时代价。
 */
import * as echarts from 'echarts/core';
import { LineChart, BarChart, PieChart, HeatmapChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DatasetComponent,
  VisualMapComponent,
} from 'echarts/components';
import { SVGRenderer, CanvasRenderer } from 'echarts/renderers';

let registered = false;

function register() {
  if (registered) return;
  registered = true;
  echarts.use([
    // 图表类型（项目实际使用：SalesTrend/Aov/Forecast=line, Hourly/TopProducts/CustomerInsight=bar+line,
    // OrderStatus/PlatformRevenue=pie, Cohort/EnterpriseHeatmap=heatmap）
    LineChart,
    BarChart,
    PieChart,
    HeatmapChart,
    // 组件
    GridComponent,
    TooltipComponent,
    LegendComponent,
    TitleComponent,
    DatasetComponent,
    VisualMapComponent,
    // 渲染器（useEChart 用 svg；保留 canvas 以防直接 init 的场景）
    SVGRenderer,
    CanvasRenderer,
  ]);
}

register();

export default echarts;
export type { EChartsOption } from 'echarts';
