import React, { useEffect, useState, useRef } from 'react';
import {
  ShoppingCart, Users, Package, DollarSign, RefreshCw, AlertTriangle,
  TrendingUp, TrendingDown, Activity, Target, Award, Zap,
  BarChart3, PieChart, Eye, Calendar, FileText, Download, Crown,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonStatCard, StatCard } from '@/components/ui/StatCard';
import { SalesTrendChart } from '@/components/charts/SalesTrendChart';
import { OrderStatusChart } from '@/components/charts/OrderStatusChart';
import { CustomerInsightChart } from '@/components/charts/CustomerInsightChart';
import { CohortRetentionChart } from '@/components/charts/CohortRetentionChart';
import { HourlyDistributionChart } from '@/components/charts/HourlyDistributionChart';
import { TopProductsChart } from '@/components/charts/TopProductsChart';
import { PlatformRevenueChart } from '@/components/charts/PlatformRevenueChart';
import { EnterpriseForecastChart } from '@/components/charts/EnterpriseForecastChart';
import { EnterpriseHeatmapChart } from '@/components/charts/EnterpriseHeatmapChart';
import { AovTrendChart } from '@/components/charts/AovTrendChart';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePlan } from '@/hooks/usePlan';
import { UpgradeCTA } from '@/components/UpgradeCTA';
import { useToast } from '@/components/ui/Toast';
import { workspaceService } from '@/services/workspace';
import api from '@/services/api';
import { usePageT, type Lang } from '@/i18n';

const D = {
  zh: {
    page_title: '数据分析',
    analytics_title: '数据分析',
    load_failed_title: '加载分析数据失败',
    load_analytics_failed: '加载分析数据失败',
    btn_retry: '重试',
    unit_wan: '万',
    forecast_prefix: '预测+',
    alert_growth: '订单量持续增长趋势，建议保持当前运营策略',
    alert_decline: '销售呈下降趋势，建议排查竞品动态或调整定价',
    alert_surge_prefix: '今日订单量异常活跃，高于周均 ',
    alert_surge_suffix: '%以上',
    alert_analyzed_prefix: '累计分析 ',
    alert_analyzed_suffix: ' 笔订单，置信度: ',
    conf_low: '低',
    conf_medium: '中',
    vs_yesterday: '昨日',
    vs_week_avg: '本周均值',
    export_failed: '导出失败',
    no_workspace: '未找到当前工作空间',
    export_success: '导出成功',
    retry_or_contact: '请稍后重试或联系管理员',
    header_subtitle: '· 多视角数据洞察 · AI 智能解读',
    period_aria: '时间范围选择',
    period_7d: '近 7 天',
    period_30d: '近 30 天',
    period_90d: '近 90 天',
    btn_refresh: '刷新',
    ent_analytics_badge: '专属企业分析',
    ent_advanced_title: '企业专属 · 高级分析',
    ai_forecast_title: 'AI 营收预测',
    ai_forecast_subtitle: '基于真实销售数据的未来7天预测',
    ai_forecast_aria: 'AI 营收预测图表',
    no_forecast_data: '暂无数据支持AI预测',
    no_forecast_data_desc: '积累更多订单数据后将生成AI预测',
    heatmap_title: '时段客流热力图',
    heatmap_subtitle: '24小时×7天订单密度分布',
    heatmap_aria: '时段客流热力图',
    smart_alerts_title: '智能预警',
    no_smart_alerts: '数据不足，积累更多订单后将生成智能预警',
    stat_total_revenue: '总销售额',
    stat_total_orders: '订单总数',
    aov_label: '客单价',
    stat_total_customers: '客户总数',
    vip_share: 'VIP 占比',
    stat_total_products: '商品总数',
    conversion_rate: '转化率',
    today: '今日',
    week: '本周',
    month: '本月',
    sales_suffix: '销售',
    orders_unit: '笔订单',
    sales_trend_title: '销售趋势',
    sales_trend_subtitle: '每日销售额与订单量趋势',
    sales_trend_aria: '销售趋势图表',
    no_sales_data: '暂无销售数据',
    no_sales_data_desc: '还没有销售趋势数据',
    hourly_title: '订单时段分布',
    hourly_subtitle: '24小时订单高峰分析（识别最佳运营时段）',
    hourly_aria: '订单时段分布图表',
    order_status_title: '订单状态分布',
    order_status_subtitle: '实时订单流转状态',
    order_status_aria: '订单状态分布图表',
    no_order_data: '暂无订单数据',
    no_order_data_desc: '还没有订单数据',
    platform_title: '平台销售占比',
    platform_subtitle: '各电商渠道贡献度',
    advanced_analytics: '高级分析',
    top_products_title: '商品销售排行',
    top_products_subtitle: 'Top 8 销售额最高商品',
    no_product_data: '暂无商品数据',
    customer_segments_title: '客户价值分群',
    customer_segments_subtitle: '基于 RFM 模型的客户分层运营',
    no_customer_data: '暂无客户数据',
    cohort_title: 'Cohort 留存分析',
    cohort_subtitle: '按首购月份分群 · 各月留存率（%）',
    ai_insights_title: 'AI 智能洞察',
    ai_insights_subtitle: '基于您近期销售数据的多维度解读',
    trend_up: '增长趋势',
    trend_down: '下降趋势',
    trend_stable: '稳定趋势',
    forecast_label: '趋势预测',
    forecast_7d_prefix: '未来 7 天预期（置信度 ',
    forecast_7d_suffix: '）',
    peak_day_title: '高峰日',
    peak_day_desc: '建议提前备货和安排客服',
    analysis_sample_title: '分析样本',
    orders_analyzed: '笔订单参与分析',
    ai_recommendations_title: 'AI 建议',
    top_performers_title: '销售冠军',
    top_performers_subtitle: '表现最好的商品',
    units_sold: '件已售',
    comprehensive_title: '综合解读',
    comprehensive_subtitle: '多维度数据洞察与建议',
    insight_sales_performance: '销售表现',
    sales_insight_orders_prefix: '共完成',
    sales_insight_orders_suffix: ' 笔订单，',
    sales_insight_rev_prefix: '总营收 ',
    sales_insight_aov_prefix: '，客单价 ',
    sales_insight_champion_prefix: '。销售冠军贡献了 ',
    sales_insight_champion_suffix: ' 的营收。',
    insight_customer_structure: '客户结构',
    cust_insight_prefix: '累计',
    cust_insight_mid: ' 名客户，RFM 分群为',
    cust_insight_suffix: ' 类。',
    cust_insight_largest: '最大群体',
    cust_insight_paren_open: '（',
    cust_insight_people: '人',
    cust_insight_paren_close: '）。',
    insight_product_health: '商品健康度',
    prod_health_prefix: '共有',
    prod_health_mid: ' 个商品在售。头部 8 个商品贡献了总营收的 ',
    prod_health_suffix: '，呈现典型的"长尾分布"。',
    insight_operations: '运营建议',
    ops_prefix: '订单高峰集中在',
    ops_suffix: ' 时段。建议在高峰前 1-2 小时安排客服值班、提前推送优惠活动，并对 VIP 客户做定向复购召回。',
    aov_trend_title: '客单价趋势',
    aov_trend_subtitle: '每日平均客单价变化曲线',
    aov_trend_aria: '客单价趋势图表',
    btn_export_report: '导出报表',
    export_formats: '支持 CSV / Excel / PDF 格式',
    ai_deep_title: 'AI 深度洞察',
    ai_deep_subtitle: '企业级专属预测与优化建议',
    demand_forecast: '需求预测',
    df_prefix: '未来 7 天预估营收',
    df_conf: '，置信度: ',
    df_end: '。',
    df_trend_down: '当前呈下降趋势，建议加强促销力度。',
    df_trend_up: '当前呈增长趋势，建议保持运营节奏。',
    df_trend_stable: '趋势稳定，可维持现有策略。',
    pricing_optimization: '定价优化',
    po_prefix: '当前客单价为',
    po_mid: '，已分析',
    po_suffix: '笔订单。',
    po_low_prefix: '建议设置满 ',
    po_low_suffix: ' 元包邮以提升客单价。',
    po_high_aov: '建议对高价值客户推送组合优惠包，提升复购率。',
    platform_manual: '手动',
    unknown: '未知',
    unknown_product: '未知商品',
    st_pending: '待确认',
    st_confirmed: '已确认',
    st_processing: '处理中',
    st_shipped: '已发货',
    st_delivered: '已签收',
    st_cancelled: '已取消',
    st_refunded: '已退款',
  },
  en: {
    page_title: 'Analytics',
    analytics_title: 'Analytics',
    load_failed_title: 'Failed to load analytics data',
    load_analytics_failed: 'Failed to load analytics data',
    btn_retry: 'Retry',
    unit_wan: 'k',
    forecast_prefix: 'Fcst+',
    alert_growth: 'Order volume keeps growing — keep your current strategy',
    alert_decline: 'Sales are declining — check competitors or adjust pricing',
    alert_surge_prefix: 'Unusually high order volume today, ',
    alert_surge_suffix: '% above weekly average',
    alert_analyzed_prefix: 'Analyzed ',
    alert_analyzed_suffix: ' orders, confidence: ',
    conf_low: 'Low',
    conf_medium: 'Medium',
    vs_yesterday: 'yesterday',
    vs_week_avg: 'weekly avg',
    export_failed: 'Export failed',
    no_workspace: 'No workspace found',
    export_success: 'Export successful',
    retry_or_contact: 'Please retry later or contact an admin',
    header_subtitle: '· multi-angle insights · AI analysis',
    period_aria: 'Time range selection',
    period_7d: 'Last 7 days',
    period_30d: 'Last 30 days',
    period_90d: 'Last 90 days',
    btn_refresh: 'Refresh',
    ent_analytics_badge: 'Enterprise Analytics',
    ent_advanced_title: 'Enterprise · Advanced Analytics',
    ai_forecast_title: 'AI Revenue Forecast',
    ai_forecast_subtitle: '7-day forecast based on real sales data',
    ai_forecast_aria: 'AI revenue forecast chart',
    no_forecast_data: 'Not enough data for AI forecast',
    no_forecast_data_desc: 'AI forecast appears once more order data is collected',
    heatmap_title: 'Traffic Heatmap',
    heatmap_subtitle: '24h × 7d order density',
    heatmap_aria: 'Traffic heatmap',
    smart_alerts_title: 'Smart Alerts',
    no_smart_alerts: 'Not enough data — alerts appear once more orders are collected',
    stat_total_revenue: 'Total revenue',
    stat_total_orders: 'Total orders',
    aov_label: 'AOV',
    stat_total_customers: 'Total customers',
    vip_share: 'VIP share',
    stat_total_products: 'Total products',
    conversion_rate: 'Conversion',
    today: 'Today',
    week: 'Week',
    month: 'Month',
    sales_suffix: ' sales',
    orders_unit: 'orders',
    sales_trend_title: 'Sales trend',
    sales_trend_subtitle: 'Daily sales and order trend',
    sales_trend_aria: 'Sales trend chart',
    no_sales_data: 'No sales data',
    no_sales_data_desc: 'No sales trend data yet',
    hourly_title: 'Orders by hour',
    hourly_subtitle: '24h order peak analysis (find the best operating hours)',
    hourly_aria: 'Orders by hour chart',
    order_status_title: 'Order status distribution',
    order_status_subtitle: 'Real-time order flow status',
    order_status_aria: 'Order status distribution chart',
    no_order_data: 'No order data',
    no_order_data_desc: 'No order data yet',
    platform_title: 'Revenue by platform',
    platform_subtitle: 'Contribution by sales channel',
    advanced_analytics: 'Advanced Analytics',
    top_products_title: 'Top products',
    top_products_subtitle: 'Top 8 products by revenue',
    no_product_data: 'No product data',
    customer_segments_title: 'Customer segments',
    customer_segments_subtitle: 'RFM-based customer tiering',
    no_customer_data: 'No customer data',
    cohort_title: 'Cohort retention',
    cohort_subtitle: 'By first-purchase month · retention %',
    ai_insights_title: 'AI Insights',
    ai_insights_subtitle: 'Multi-dimensional analysis of your recent sales data',
    trend_up: 'Uptrend',
    trend_down: 'Downtrend',
    trend_stable: 'Stable',
    forecast_label: 'Forecast',
    forecast_7d_prefix: 'Next 7 days forecast (confidence: ',
    forecast_7d_suffix: ')',
    peak_day_title: 'Peak day',
    peak_day_desc: 'Stock up in advance and schedule support',
    analysis_sample_title: 'Analyzed',
    orders_analyzed: 'orders analyzed',
    ai_recommendations_title: 'AI Suggestions',
    top_performers_title: 'Top performers',
    top_performers_subtitle: 'Best performing products',
    units_sold: 'units sold',
    comprehensive_title: 'Summary',
    comprehensive_subtitle: 'Multi-dimensional insights and advice',
    insight_sales_performance: 'Sales performance',
    sales_insight_orders_prefix: 'Completed',
    sales_insight_orders_suffix: ' orders, ',
    sales_insight_rev_prefix: 'total revenue ',
    sales_insight_aov_prefix: ', AOV ',
    sales_insight_champion_prefix: '. The top performer contributed ',
    sales_insight_champion_suffix: '% of total revenue.',
    insight_customer_structure: 'Customer structure',
    cust_insight_prefix: 'Total',
    cust_insight_mid: ' customers, grouped into',
    cust_insight_suffix: ' RFM segments.',
    cust_insight_largest: 'Largest segment',
    cust_insight_paren_open: ' (',
    cust_insight_people: 'people',
    cust_insight_paren_close: ').',
    insight_product_health: 'Product health',
    prod_health_prefix: 'There are',
    prod_health_mid: ' products on sale. The top 8 contribute',
    prod_health_suffix: '% of total revenue, a classic "long-tail" distribution.',
    insight_operations: 'Operations advice',
    ops_prefix: 'Order peaks cluster around',
    ops_suffix: '. Schedule support 1-2 hours before peak, push promotions early, and run targeted win-back campaigns for VIP customers.',
    aov_trend_title: 'AOV trend',
    aov_trend_subtitle: 'Daily average order value curve',
    aov_trend_aria: 'AOV trend chart',
    btn_export_report: 'Export report',
    export_formats: 'Supports CSV / Excel / PDF',
    ai_deep_title: 'AI Deep Insights',
    ai_deep_subtitle: 'Enterprise-grade forecasting and optimization advice',
    demand_forecast: 'Demand forecast',
    df_prefix: 'Estimated revenue for the next 7 days',
    df_conf: ', confidence: ',
    df_end: '.',
    df_trend_down: 'Currently declining — boost promotions.',
    df_trend_up: 'Currently growing — keep the pace.',
    df_trend_stable: 'Trend is stable — maintain current strategy.',
    pricing_optimization: 'Pricing optimization',
    po_prefix: 'Current AOV is',
    po_mid: ', analyzed',
    po_suffix: ' orders.',
    po_low_prefix: 'Suggest free shipping over ¥',
    po_low_suffix: ' to increase AOV.',
    po_high_aov: 'Suggest bundle offers for high-value customers to boost repeat purchases.',
    platform_manual: 'Manual',
    unknown: 'Unknown',
    unknown_product: 'Unknown product',
    st_pending: 'Pending',
    st_confirmed: 'Confirmed',
    st_processing: 'Processing',
    st_shipped: 'Shipped',
    st_delivered: 'Delivered',
    st_cancelled: 'Cancelled',
    st_refunded: 'Refunded',
  },
} as Record<Lang, Record<string, string>>;

type Period = '7d' | '30d' | '90d';

/**
 * Deterministic fallback heatmap profile (24h × 7d).
 * Used ONLY when no real order data is available — work hours (9-18) are higher,
 * night hours are lower, weekends slightly busier. Contains no randomness so the
 * heatmap stays stable across renders.
 */
const HEATMAP_HOURLY_PROFILE = [3, 2, 1, 1, 2, 3, 5, 8, 12, 18, 22, 25, 20, 15, 12, 10, 8, 6, 5, 7, 10, 8, 5, 3];
const HEATMAP_DAY_FACTOR = [1.0, 1.05, 1.0, 1.05, 1.1, 1.25, 1.2]; // Mon..Sun
const FALLBACK_HEATMAP: [number, number, number][] = (() => {
  const arr: [number, number, number][] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      arr.push([h, d, Math.round(HEATMAP_HOURLY_PROFILE[h] * HEATMAP_DAY_FACTOR[d])]);
    }
  }
  return arr;
})();

export const Analytics: React.FC = () => {
  const t = usePageT(D);
  usePageTitle(t('page_title'));
  const plan = usePlan();
  const { currentWorkspace } = useWorkspace();
  const { addToast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('30d');
  const [exporting, setExporting] = useState(false);

  const [stats, setStats] = useState<any>(null);
  const [salesTrend, setSalesTrend] = useState<any[]>([]);
  const [orderStatus, setOrderStatus] = useState<any[]>([]);
  const [customerInsight, setCustomerInsight] = useState<any[]>([]);
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [cohortMonths, setCohortMonths] = useState<string[]>([]);
  const [hourly, setHourly] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [platformRevenue, setPlatformRevenue] = useState<any[]>([]);
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [ranking, setRanking] = useState<{ top: any[]; bottom: any[] }>({ top: [], bottom: [] });
  // 24h × 7d order density, aggregated from REAL orders (empty until data loads)
  const [heatmap, setHeatmap] = useState<[number, number, number][]>([]);

  // Ref to the data-loading function so the error-retry button can re-fetch
  // without a full page reload.
  const fetchDataRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let cancelled = false;
    const fetchAnalytics = async (slugOverride?: string) => {
      const slug = slugOverride || currentWorkspace?.slug;
      if (!slug) {
        try {
          const ws = await workspaceService.getWorkspaces();
          if (ws && ws.length > 0 && !cancelled) {
            localStorage.setItem('current_workspace_id', ws[0].id);
            return fetchAnalytics(ws[0].slug);
          }
        } catch {}
        if (!cancelled) setIsLoading(false);
        return;
      }
      if (!cancelled) {
        setIsLoading(true);
        setError(null);
      }
      try {
        const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;

        // Parallel fetch: 6 endpoints
        const [statsResp, rfmResp, productsResp, customersResp, ordersResp, salesAIResp] = await Promise.all([
          api.get(`/workspaces/${slug}/orders/stats`).catch(() => ({ data: {} })),
          api.get(`/workspaces/${slug}/customers/rfm-analysis`).catch(() => ({ data: null })),
          api.get(`/workspaces/${slug}/products?page=1&page_size=200`).catch(() => ({ data: { items: [] } })),
          api.get(`/workspaces/${slug}/customers?page=1&page_size=200`).catch(() => ({ data: { items: [] } })),
          api.get(`/workspaces/${slug}/orders?page=1&page_size=200`).catch(() => ({ data: { items: [] } })),
          api.post(`/workspaces/${slug}/ai/analyze-sales`, { period: period }).catch(() => ({ data: null })),
        ]);
        if (cancelled) return;
        const allOrders = ordersResp.data?.items || [];
        if (cancelled) return;

        const os = statsResp.data || {};
        const products = productsResp.data?.items || [];
        const customers = customersResp.data?.items || [];

        // ── 1. Summary stats ──
        const totalRev = os.total_revenue || 0;
        const totalOrd = os.total_orders || 0;
        const aov = totalOrd > 0 ? totalRev / totalOrd : 0;

        setStats({
          total_revenue: totalRev,
          total_orders: totalOrd,
          today_revenue: os.today_revenue || 0,
          today_orders: os.today_orders || 0,
          yesterday_revenue: os.yesterday_revenue,
          week_revenue: os.week_revenue || 0,
          week_orders: os.week_orders || 0,
          month_revenue: os.month_revenue || 0,
          month_orders: os.month_orders || 0,
          total_customers: customersResp.data?.total || customers.length,
          total_products: productsResp.data?.total || products.length,
          aov: aov,
        });

        // ── 2. Sales trend ──
        const trend: any[] = Array.isArray(os.trend) ? os.trend : [];
        setSalesTrend(trend.map((d: any) => ({
          date: (d.date || '').slice(5), // strip year
          amount: d.revenue || 0,
          orders: d.orders || 0,
        })));

        // ── 3. Order status distribution ──
        const sb = os.status_breakdown || {};
        const colors: Record<string, string> = {
          pending: '#f59e0b', confirmed: '#3b82f6', processing: '#8b5cf6',
          shipped: '#06b6d4', delivered: '#10b981', cancelled: '#ef4444', refunded: '#6b7280',
        };
        const labels: Record<string, string> = {
          pending: 'st_pending', confirmed: 'st_confirmed', processing: 'st_processing',
          shipped: 'st_shipped', delivered: 'st_delivered', cancelled: 'st_cancelled', refunded: 'st_refunded',
        };
        setOrderStatus(
          Object.keys(sb)
            .filter(k => sb[k] > 0)
            .map(k => ({ name: labels[k] || k, value: sb[k], color: colors[k] }))
        );

        // ── 4. Customer RFM segments ──
        const rfm = rfmResp.data;
        const rfmSegments: any[] = Array.isArray(rfm) ? rfm : (rfm?.segments || []);
        setCustomerInsight(rfmSegments.map((r: any) => ({
          segment: r.segment || r.label || t('unknown'),
          count: r.customer_count || r.count || 0,
          avgValue: r.average_total_spent || r.avg_value || r.average_value || 0,
        })));

        // ── 5. Hourly distribution (computed from real orders) ──
        const hourlyAgg: Record<number, { orders: number; revenue: number }> = {};
        for (let h = 0; h < 24; h++) hourlyAgg[h] = { orders: 0, revenue: 0 };
        allOrders.forEach((order: any) => {
          const t = order.created_at || order.order_date;
          if (!t) return;
          const hour = new Date(t).getHours();
          hourlyAgg[hour].orders += 1;
          hourlyAgg[hour].revenue += parseFloat(order.total || 0);
        });
        const hourlyData = Array.from({ length: 24 }, (_, h) => ({
          hour: h,
          orders: hourlyAgg[h].orders,
          revenue: Math.round(hourlyAgg[h].revenue * 100) / 100,
        }));
        setHourly(hourlyData);

        // ── 5b. Enterprise heatmap (24h × 7d), aggregated from REAL orders ──
        const heatAgg: Record<string, number> = {};
        allOrders.forEach((order: any) => {
          const t = order.created_at || order.order_date;
          if (!t) return;
          const d = new Date(t);
          const hour = d.getHours();
          const jsDay = d.getDay(); // 0=Sun..6=Sat
          const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1; // map to 0=Mon..6=Sun
          const key = `${hour}-${dayOfWeek}`;
          heatAgg[key] = (heatAgg[key] || 0) + 1;
        });
        const heatmapArr: [number, number, number][] = [];
        for (let day = 0; day < 7; day++) {
          for (let hr = 0; hr < 24; hr++) {
            heatmapArr.push([hr, day, heatAgg[`${hr}-${day}`] || 0]);
          }
        }
        setHeatmap(heatmapArr);

        // ── 6. Top products by revenue (from real orders) ──
        const productSales: Record<string, { name: string; price: number; units: number; revenue: number }> = {};
        allOrders.forEach((order: any) => {
          const items = order.items || [];
          items.forEach((item: any) => {
            // 兜底：product_id 缺失时用商品名聚合（旧数据也能出排行）
            const pid = item.product_id || item.productId || item.product_name || item.productName || 'unknown';
            if (!pid) return;
            if (!productSales[pid]) {
              productSales[pid] = {
                name: item.product_name || item.productName || t('unknown_product'),
                price: item.unit_price || 0,
                units: 0,
                revenue: 0,
              };
            }
            productSales[pid].units += item.quantity || 1;
            productSales[pid].revenue += item.total_price || (item.quantity * item.unit_price) || 0;
          });
        });
        const topProds = Object.values(productSales)
          .filter(p => p.revenue > 0)
          .sort((a, b) => b.revenue - a.revenue);
        setTopProducts(topProds.slice(0, 8));

        // ── 7. Platform revenue (from real orders) ──
        const platformMap: Record<string, { revenue: number; count: number }> = {};
        allOrders.forEach((order: any) => {
          const platform = order.platform || 'manual';
          if (!platformMap[platform]) platformMap[platform] = { revenue: 0, count: 0 };
          platformMap[platform].revenue += order.total || 0;
          platformMap[platform].count += 1;
        });
        if (Object.keys(platformMap).length === 0) {
          platformMap['manual'] = { revenue: totalRev, count: totalOrd };
        }
        setPlatformRevenue(
          Object.keys(platformMap).map(name => ({
            name: name === 'manual' ? t('platform_manual') : name === 'shopify' ? 'Shopify' : name === 'douyin' ? '抖音' : name,
            value: platformMap[name].revenue,
            count: platformMap[name].count,
          }))
        );

        // ── 8. AI insights ──
        if (salesAIResp.data) {
          setAiInsights(salesAIResp.data);
        }

        // ── 9. Top/Bottom products ranking ──
        setRanking({
          top: topProds.slice(0, 5),
          bottom: topProds.slice(-3).reverse(),
        });
      } catch (err: any) {
        if (!cancelled) setError(err?.response?.data?.detail || t('load_analytics_failed'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchDataRef.current = fetchAnalytics;
    fetchAnalytics();
    return () => { cancelled = true; };
  }, [currentWorkspace, period]);

  // Cohort 留存分析（独立请求，失败静默）
  useEffect(() => {
    if (!currentWorkspace?.slug) return;
    let cancelled = false;
    api.get(`/workspaces/${currentWorkspace.slug}/customers/cohort-retention`)
      .then((res: any) => {
        if (cancelled) return;
        setCohorts(res.data?.cohorts || []);
        setCohortMonths(res.data?.months || []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentWorkspace]);

  const formatCurrency = (v: number) => {
    if (v >= 100000) return `¥${(v / 10000).toFixed(1)}${t('unit_wan')}`;
    if (v >= 10000) return `¥${(v / 10000).toFixed(2)}${t('unit_wan')}`;
    return `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // ── Enterprise: forecast data (A) ──
  const forecastData = (() => {
    const historical = salesTrend.slice(-9).map((d: any) => ({
      date: d.date,
      actual: d.amount,
      forecast: null as number | null,
    }));
    if (aiInsights?.forecast?.next_7_days) {
      const avgDaily = Math.round(aiInsights.forecast.next_7_days / 7 * 100) / 100;
      for (let i = 1; i <= 7; i++) {
        historical.push({ date: `${t('forecast_prefix')}${i}`, actual: null as number | null, forecast: avgDaily });
      }
    }
    return historical;
  })();

  // ── Enterprise: smart alerts (B) ──
  const smartAlerts: { text: string; variant: 'warning' | 'success' | 'info' }[] = [];
  if (aiInsights?.trend === 'upward') {
    smartAlerts.push({ text: t('alert_growth'), variant: 'success' });
  } else if (aiInsights?.trend === 'downward') {
    smartAlerts.push({ text: t('alert_decline'), variant: 'warning' });
  }
  const weekAvg = (stats?.week_revenue || 0) / 7;
  if (stats?.today_revenue > weekAvg * 1.5 && weekAvg > 0) {
    const pct = Math.round(((stats.today_revenue / weekAvg) - 1) * 100);
    smartAlerts.push({ text: `${t('alert_surge_prefix')}${pct}${t('alert_surge_suffix')}`, variant: 'warning' });
  }
  if (aiInsights?.total_orders_analyzed) {
    const confidenceLabel = aiInsights.forecast?.confidence === 'low' ? t('conf_low') : t('conf_medium');
    smartAlerts.push({ text: `${t('alert_analyzed_prefix')}${aiInsights.total_orders_analyzed}${t('alert_analyzed_suffix')}${confidenceLabel}`, variant: 'info' });
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded skeleton-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-[320px] bg-gray-100 dark:bg-gray-800 rounded-xl skeleton-pulse" />
          <div className="h-[320px] bg-gray-100 dark:bg-gray-800 rounded-xl skeleton-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">{t('load_failed_title')}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => fetchDataRef.current()}>
          {t('btn_retry')}
        </Button>
      </div>
    );
  }

  // Calculate growth rates.
  // Prefer the backend-provided "yesterday" revenue for an accurate day-over-day
  // comparison. When it is unavailable, fall back to the weekly average and label
  // the comparison accordingly (the old code subtracted today from the whole week,
  // which actually yielded the sum of the other 6 days, not yesterday).
  const todayRev = stats?.today_revenue || 0;
  const yesterdayRev = stats?.yesterday_revenue;
  const hasYesterday = typeof yesterdayRev === 'number';
  const weekAvgRev = (stats?.week_revenue || 0) / 7;
  const compareBase = hasYesterday ? (yesterdayRev as number) : weekAvgRev;
  const compareLabel = hasYesterday ? t('vs_yesterday') : t('vs_week_avg');
  const todayGrowth = compareBase > 0 ? ((todayRev - compareBase) / compareBase) * 100 : 0;

  // Standard conversion rate: orders / customers * 100 (0% when no customers).
  const conversionRate = (stats?.total_customers || 0) > 0
    ? ((stats?.total_orders || 0) / (stats?.total_customers || 1)) * 100
    : 0;

  // VIP share derived from RFM segments (high-value / Champions).
  const vipCount =
    customerInsight.find((s: any) => s.segment?.includes('高价值') || s.segment?.includes('Champions'))?.count || 0;
  const vipPct =
    customerInsight.length > 0
      ? Math.round((vipCount / Math.max(stats?.total_customers || 1, 1)) * 100)
      : 0;

  const handleExport = async () => {
    const slug = currentWorkspace?.slug;
    if (!slug) {
      addToast('error', t('export_failed'), t('no_workspace'));
      return;
    }
    setExporting(true);
    try {
      const res = await api.get(`/workspaces/${slug}/orders/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orders_${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      addToast('success', t('export_success'));
    } catch (e) {
      addToast('error', t('export_failed'), t('retry_or_contact'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in relative">
      {/* Tech dots background */}
      <div className="absolute inset-0 bg-tech-dots opacity-30 pointer-events-none -z-10" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold gradient-text">{t('analytics_title')}</h2>
            <span className="glow-dot" />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            <span className="font-medium text-gray-700 dark:text-gray-300">{currentWorkspace?.name}</span>
            {' '}{t('header_subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="inline-flex p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg" role="radiogroup" aria-label={t('period_aria')}>
            {(['7d', '30d', '90d'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                  period === p
                    ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
                role="radio"
                aria-checked={period === p}
              >
                {p === '7d' ? t('period_7d') : p === '30d' ? t('period_30d') : t('period_90d')}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw size={16} />}
            onClick={() => fetchDataRef.current()}
            className="magnetic"
          >
            {t('btn_refresh')}
          </Button>
        </div>
      </div>

      {/* Enterprise badge */}
      {plan === 'enterprise' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/30 dark:to-yellow-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
          <Award size={18} className="text-amber-500" />
          <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">{t('ent_analytics_badge')}</span>
        </div>
      )}

      {/* ── Enterprise Exclusive: Advanced Analytics ── */}
      {plan === 'enterprise' && (
        <>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
              <Crown size={16} className="text-white" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-gray-100">{t('ent_advanced_title')}</h3>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card title={t('ai_forecast_title')} subtitle={t('ai_forecast_subtitle')} className="animated-border border-amber-200 dark:border-amber-800" aria-label={t('ai_forecast_aria')} role="img">
              {salesTrend.length > 0 ? (
                <EnterpriseForecastChart data={forecastData} />
              ) : (
                <EmptyState title={t('no_forecast_data')} description={t('no_forecast_data_desc')} />
              )}
            </Card>
            <Card title={t('heatmap_title')} subtitle={t('heatmap_subtitle')} className="animated-border border-amber-200 dark:border-amber-800" aria-label={t('heatmap_aria')} role="img">
              <EnterpriseHeatmapChart data={
                heatmap.length > 0 && heatmap.some(([, , v]) => v > 0)
                  ? heatmap
                  : FALLBACK_HEATMAP
              } />
            </Card>
          </div>

          {/* Smart Alert */}
          <Card className="animated-border border-amber-200 dark:border-amber-800 mb-6 bg-gradient-to-r from-amber-50/50 to-orange-50/50 dark:from-amber-900/10 dark:to-orange-900/10">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                <Zap size={20} className="text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t('smart_alerts_title')}</h4>
                {aiInsights && aiInsights.total_orders_analyzed > 0 && smartAlerts.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {smartAlerts.map((alert, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                        <span className={`w-2 h-2 rounded-full ${
                          alert.variant === 'success' ? 'bg-emerald-500' :
                          alert.variant === 'warning' ? 'bg-amber-500 animate-pulse' :
                          'bg-blue-500'
                        }`} />
                        {alert.text}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                    {t('no_smart_alerts')}
                  </p>
                )}
              </div>
            </div>
          </Card>
        </>
      )}

      {/* ── Hero stat cards (4) — unified via StatCard ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<DollarSign size={22} className="text-white" />}
          iconGradient="from-primary-500 to-indigo-500 shadow-primary-500/20"
          label={t('stat_total_revenue')}
          value={formatCurrency(stats?.total_revenue || 0)}
          trend={todayGrowth}
          trendLabel={`vs ${compareLabel}`}
        />

        <StatCard
          icon={<ShoppingCart size={22} className="text-white" />}
          iconGradient="from-cyan-500 to-blue-500 shadow-cyan-500/20"
          label={t('stat_total_orders')}
          value={(stats?.total_orders || 0).toLocaleString()}
          subtext={<>{t('aov_label')} <b className="text-gray-700 dark:text-gray-300">{formatCurrency(stats?.aov || 0)}</b></>}
        />

        <StatCard
          icon={<Users size={22} className="text-white" />}
          iconGradient="from-purple-500 to-pink-500 shadow-purple-500/20"
          label={t('stat_total_customers')}
          value={(stats?.total_customers || 0).toLocaleString()}
          subtext={<>{t('vip_share')} <b className="text-purple-600 dark:text-purple-400">{vipPct}%</b></>}
        />

        <StatCard
          icon={<Package size={22} className="text-white" />}
          iconGradient="from-amber-500 to-orange-500 shadow-amber-500/20"
          label={t('stat_total_products')}
          value={(stats?.total_products || 0).toLocaleString()}
          subtext={<>{t('conversion_rate')} <b className="text-amber-600 dark:text-amber-400">{conversionRate.toFixed(1)}%</b></>}
        />
      </div>

      {/* ── Period comparison cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: t('today'), value: stats?.today_revenue, orders: stats?.today_orders, gradient: 'from-rose-500 to-pink-500', icon: Zap },
          { label: t('week'), value: stats?.week_revenue, orders: stats?.week_orders, gradient: 'from-violet-500 to-purple-500', icon: Calendar },
          { label: t('month'), value: stats?.month_revenue, orders: stats?.month_orders, gradient: 'from-emerald-500 to-teal-500', icon: Target },
        ].map((p, idx) => {
          const Icon = p.icon;
          return (
            <div key={idx} className="glass-card p-5 magnetic">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{p.label}{t('sales_suffix')}</p>
                  <p className="mt-2 text-xl font-bold text-slate-900 dark:text-gray-100 animate-number">
                    {formatCurrency(p.value || 0)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{p.orders || 0} {t('orders_unit')}</p>
                </div>
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${p.gradient} flex items-center justify-center`}>
                  <Icon size={18} className="text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Row 1: Sales trend + Hourly distribution (Pro+) ── */}
      {plan !== 'free' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title={t('sales_trend_title')} subtitle={t('sales_trend_subtitle')} className="animated-border" aria-label={t('sales_trend_aria')} role="img">
          {salesTrend.length > 0 ? (
            <SalesTrendChart data={salesTrend} />
          ) : (
            <EmptyState title={t('no_sales_data')} description={t('no_sales_data_desc')} />
          )}
        </Card>

        <Card title={t('hourly_title')} subtitle={t('hourly_subtitle')} className="animated-border" aria-label={t('hourly_aria')} role="img">
          <HourlyDistributionChart data={hourly} />
        </Card>
      </div>
      )}

      {/* ── Row 2: Order status (all tiers) + Platform revenue (Pro+) ── */
      /* For Free tier, order status shown as standalone card */ }
      {plan === 'free' ? (
        <Card title={t('order_status_title')} subtitle={t('order_status_subtitle')} className="animated-border">
          {orderStatus.length > 0 ? (
            <OrderStatusChart data={orderStatus.map((s) => ({ ...s, name: t(s.name) }))} />
          ) : (
            <EmptyState title={t('no_order_data')} description={t('no_order_data_desc')} />
          )}
        </Card>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title={t('order_status_title')} subtitle={t('order_status_subtitle')} className="animated-border" aria-label={t('order_status_aria')} role="img">
          {orderStatus.length > 0 ? (
            <OrderStatusChart data={orderStatus.map((s) => ({ ...s, name: t(s.name) }))} />
          ) : (
            <EmptyState title={t('no_order_data')} description={t('no_order_data_desc')} />
          )}
        </Card>

        <Card title={t('platform_title')} subtitle={t('platform_subtitle')} className="animated-border">
          <PlatformRevenueChart data={platformRevenue} />
        </Card>
      </div>
      )}

      {/* ── Free tier: Upgrade CTA ── */}
      {plan === 'free' && (
        <UpgradeCTA feature={t('advanced_analytics')} />
      )}

      {/* ── Row 3: Top products + Customer segments (Pro+) ── */}
      {plan !== 'free' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title={t('top_products_title')} subtitle={t('top_products_subtitle')} className="animated-border">
          {topProducts.length > 0 ? (
            <TopProductsChart data={topProducts} />
          ) : (
            <div className="h-[320px] flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
              {t('no_product_data')}
            </div>
          )}
        </Card>

        <Card title={t('customer_segments_title')} subtitle={t('customer_segments_subtitle')} className="animated-border">
          {customerInsight.length > 0 ? (
            <CustomerInsightChart data={customerInsight} />
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
              {t('no_customer_data')}
            </div>
          )}
        </Card>

        <Card title={t('cohort_title')} subtitle={t('cohort_subtitle')} className="animated-border">
          {cohorts.length > 0 ? (
            <CohortRetentionChart cohorts={cohorts} months={cohortMonths} />
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
              {t('no_customer_data')}
            </div>
          )}
        </Card>
      </div>
      )}

      {/* ── AI insights section ── */}
      {aiInsights && (
        <Card className="animated-border overflow-hidden">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-500 to-purple-500 flex items-center justify-center shadow-lg shadow-primary-500/20">
              <Zap size={20} className="text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">{t('ai_insights_title')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('ai_insights_subtitle')}</p>
            </div>
            {aiInsights.trend && (
              <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                aiInsights.trend === 'upward' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                aiInsights.trend === 'downward' ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}>
                {aiInsights.trend === 'upward' ? <TrendingUp size={12} /> :
                 aiInsights.trend === 'downward' ? <TrendingDown size={12} /> :
                 <Activity size={12} />}
                {aiInsights.trend === 'upward' ? t('trend_up') :
                 aiInsights.trend === 'downward' ? t('trend_down') :
                 t('trend_stable')}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Trend insight */}
            <div className="p-4 rounded-lg bg-gradient-to-br from-primary-50 to-indigo-50 dark:from-primary-900/20 dark:to-indigo-900/20 border border-primary-100 dark:border-primary-800">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 size={16} className="text-primary-600 dark:text-primary-400" />
                <p className="text-sm font-semibold text-primary-900 dark:text-primary-300">{t('forecast_label')}</p>
              </div>
              <p className="text-2xl font-bold text-primary-700 dark:text-primary-300">
                ¥{((aiInsights.forecast?.next_7_days || 0) / 10000).toFixed(1)}{t('unit_wan')}
              </p>
              <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
                {t('forecast_7d_prefix')}{aiInsights.forecast?.confidence === 'low' ? t('conf_low') : t('conf_medium')}{t('forecast_7d_suffix')}
              </p>
            </div>

            {/* Peak day */}
            <div className="p-4 rounded-lg bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-100 dark:border-amber-800">
              <div className="flex items-center gap-2 mb-2">
                <Award size={16} className="text-amber-600 dark:text-amber-400" />
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">{t('peak_day_title')}</p>
              </div>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                {aiInsights.peak_days?.[0]?.slice(5) || '—'}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{t('peak_day_desc')}</p>
            </div>

            {/* Analyzed orders */}
            <div className="p-4 rounded-lg bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-100 dark:border-emerald-800">
              <div className="flex items-center gap-2 mb-2">
                <Eye size={16} className="text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-300">{t('analysis_sample_title')}</p>
              </div>
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                {aiInsights.total_orders_analyzed || 0}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">{t('orders_analyzed')}</p>
            </div>
          </div>

          {/* AI Recommendations */}
          {aiInsights.recommendations && aiInsights.recommendations.length > 0 && (
            <div className="mt-4 p-4 rounded-lg bg-gradient-to-r from-primary-50/50 to-purple-50/50 dark:from-primary-900/10 dark:to-purple-900/10 border border-primary-100/50 dark:border-primary-800/30">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={16} className="text-primary-600 dark:text-primary-400" />
                <p className="text-sm font-semibold text-primary-900 dark:text-primary-300">{t('ai_recommendations_title')}</p>
              </div>
              <ul className="space-y-2">
                {aiInsights.recommendations.map((rec: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <span className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* ── Bottom: Top/Bottom performers table (Pro+) ── */}
      {plan !== 'free' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title={t('top_performers_title')} subtitle={t('top_performers_subtitle')} className="animated-border">
          <div className="space-y-2">
            {ranking.top.map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                  i === 0 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' :
                  i === 1 ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300' :
                  i === 2 ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400' :
                  'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-gray-100 truncate">{p.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{p.units} {t('units_sold')}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-primary-600 dark:text-primary-400">{formatCurrency(p.revenue)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title={t('comprehensive_title')} subtitle={t('comprehensive_subtitle')} className="animated-border">
          <div className="space-y-3">
            {/* Insight items */}
            <div className="p-3 rounded-lg bg-gradient-to-r from-emerald-50 to-cyan-50 dark:from-emerald-900/20 dark:to-cyan-900/20 border border-emerald-100 dark:border-emerald-800/30">
              <div className="flex items-start gap-2">
                <TrendingUp size={16} className="text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-300">{t('insight_sales_performance')}</p>
                  <p className="text-xs text-emerald-800 dark:text-emerald-400 mt-1">
                    {t('sales_insight_orders_prefix')} <b className="text-emerald-700 dark:text-emerald-200">{stats?.total_orders || 0}</b>{t('sales_insight_orders_suffix')}
                    {t('sales_insight_rev_prefix')} <b className="text-emerald-700 dark:text-emerald-200">{formatCurrency(stats?.total_revenue || 0)}</b>{t('sales_insight_aov_prefix')} <b className="text-emerald-700 dark:text-emerald-200">{formatCurrency(stats?.aov || 0)}</b>
                    {t('sales_insight_champion_prefix')} <b className="text-emerald-700 dark:text-emerald-200">
                      {ranking.top[0] ? ((ranking.top[0].revenue / Math.max(stats?.total_revenue || 1, 1)) * 100).toFixed(1) : 0}%
                    </b>{t('sales_insight_champion_suffix')}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-100 dark:border-purple-800/30">
              <div className="flex items-start gap-2">
                <Users size={16} className="text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-purple-900 dark:text-purple-300">{t('insight_customer_structure')}</p>
                  <p className="text-xs text-purple-800 dark:text-purple-400 mt-1">
                    {t('cust_insight_prefix')} <b className="text-purple-700 dark:text-purple-200">{stats?.total_customers || 0}</b>{t('cust_insight_mid')} <b className="text-purple-700 dark:text-purple-200">{customerInsight.length}</b>{t('cust_insight_suffix')}
                    {customerInsight.length > 0 && (() => {
                      const top = customerInsight.reduce((a, b) => (b.count > a.count ? b : a), customerInsight[0]);
                      return <>{t('cust_insight_largest')} <b className="text-purple-700 dark:text-purple-200">{top.segment}</b>{t('cust_insight_paren_open')}{top.count} {t('cust_insight_people')}{t('cust_insight_paren_close')}</>;
                    })()}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-100 dark:border-amber-800/30">
              <div className="flex items-start gap-2">
                <Package size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">{t('insight_product_health')}</p>
                  <p className="text-xs text-amber-800 dark:text-amber-400 mt-1">
                    {t('prod_health_prefix')} <b className="text-amber-700 dark:text-amber-200">{stats?.total_products || 0}</b>{t('prod_health_mid')} <b className="text-amber-700 dark:text-amber-200">
                      {topProducts.length > 0 ? ((topProducts.reduce((s, p) => s + p.revenue, 0) / Math.max(stats?.total_revenue || 1, 1)) * 100).toFixed(0) : 0}%
                    </b>{t('prod_health_suffix')}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 border border-cyan-100 dark:border-cyan-800/30">
              <div className="flex items-start gap-2">
                <Target size={16} className="text-cyan-600 dark:text-cyan-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-cyan-900 dark:text-cyan-300">{t('insight_operations')}</p>
                  <p className="text-xs text-cyan-800 dark:text-cyan-400 mt-1">
                    {t('ops_prefix')} <b className="text-cyan-700 dark:text-cyan-200">14:00</b>{t('ops_suffix')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
      )}

      {/* ── Enterprise: Extra chart + export + deeper AI ── */}
      {plan === 'enterprise' && (
        <>
          <Card title={t('aov_trend_title')} subtitle={t('aov_trend_subtitle')} className="animated-border" aria-label={t('aov_trend_aria')} role="img">
            <AovTrendChart data={salesTrend.map((d: any) => ({
              date: d.date,
              value: d.orders > 0 ? d.amount / d.orders : 0,
            }))} />
          </Card>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              leftIcon={<Download size={16} />}
              isLoading={exporting}
              onClick={handleExport}
              className="w-full sm:w-auto"
            >
              {t('btn_export_report')}
            </Button>
            <span className="text-xs text-gray-400">{t('export_formats')}</span>
          </div>

          <Card className="animated-border overflow-hidden bg-gradient-to-br from-amber-50/50 to-yellow-50/50 dark:from-amber-900/20 dark:to-yellow-900/10 border-amber-200 dark:border-amber-700/30">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center">
                <Zap size={20} className="text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-200">{t('ai_deep_title')}</h3>
                <p className="text-sm text-amber-600 dark:text-amber-400">{t('ai_deep_subtitle')}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-white/60 dark:bg-black/20 border border-amber-100 dark:border-amber-800/30">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t('demand_forecast')}</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  {t('df_prefix')} <b className="text-amber-700 dark:text-amber-200">
                    {formatCurrency(aiInsights?.forecast?.next_7_days || 0)}
                  </b>{t('df_conf')} {aiInsights?.forecast?.confidence === 'low' ? t('conf_low') : t('conf_medium')}{t('df_end')}
                  {aiInsights?.trend === 'downward' ? t('df_trend_down') :
                   aiInsights?.trend === 'upward' ? t('df_trend_up') :
                   t('df_trend_stable')}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-white/60 dark:bg-black/20 border border-amber-100 dark:border-amber-800/30">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t('pricing_optimization')}</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  {t('po_prefix')} <b className="text-amber-700 dark:text-amber-200">{formatCurrency(stats?.aov || 0)}</b>{t('po_mid')} <b className="text-amber-700 dark:text-amber-200">{aiInsights?.total_orders_analyzed || '—'}</b>{t('po_suffix')}
                  {(stats?.aov || 0) > 0 && (stats?.aov || 0) < 100
                    ? `${t('po_low_prefix')}${Math.round((stats?.aov || 100) * 2)}${t('po_low_suffix')}`
                    : t('po_high_aov')}
                </p>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};
