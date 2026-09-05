import React, { useEffect, useState, useRef } from 'react';
import {
  Users,
  Key,
  CreditCard,
  Wallet,
  Coins,
  Percent,
  Calendar,
  Activity,
  Plus,
  Settings,
  UserPlus,
  BarChart3,
  AlertTriangle,
  Award,
  TrendingUp,
  TrendingDown,
  Target,
  AlertCircle,
  Package,
  Server,
  Timer,
  Gauge,
  Lightbulb,
  Mail,
  LayoutDashboard,
  PieChart,
  Wrench,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageTitle } from '@/hooks/usePageTitle';

/** 迷你趋势线：30 天数据压缩为 SVG 折线，随品牌色 */
const MiniSparkline: React.FC<{ data: number[]; color: string; height?: number }> = ({ data, color, height = 22 }) => {
  if (!data || data.length < 2) return <div style={{ height }} />;
  const w = 100, h = height;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 3) - 1.5;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full mt-1.5" preserveAspectRatio="none" style={{ height }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
};

/** 实时事件 → 中文摘要 */
const eventSummary = (msg: any): { label: string; desc: string; tone: string } => {
  const evt = String(msg?.event || 'notification').toLowerCase();
  const d = msg?.data || {};
  if (evt.includes('order') || evt.includes('payment')) {
    return { label: '订单', desc: `新订单 ${d.order_number || d.id?.slice?.(0, 8) || ''} ￥${d.total ?? d.amount ?? '--'}`, tone: 'bg-emerald-500' };
  }
  if (evt.includes('refund')) {
    return { label: '退款', desc: `退款 ￥${d.amount ?? d.total ?? '--'}${d.reason ? ' · ' + String(d.reason).slice(0, 18) : ''}`, tone: 'bg-rose-500' };
  }
  if (evt.includes('stock') || evt.includes('inventory')) {
    return { label: '库存', desc: `库存告警 ${d.product_name || d.name || ''}`, tone: 'bg-amber-500' };
  }
  const text = typeof msg?.data === 'string' ? msg.data : (d?.message || d?.title || evt);
  return { label: '通知', desc: String(text).slice(0, 40), tone: 'bg-violet-500' };
};

import { usePlan } from '@/hooks/usePlan';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonStatCard, StatCard } from '@/components/ui/StatCard';
import { CountUp } from '@/components/ui/CountUp';
import { useWebSocketNotifications } from '@/hooks/useWebSocketNotifications';
import { HealthScoreCard } from '@/components/HealthScoreCard';
import { AiDecisionPanel } from '@/components/AiDecisionPanel';
import { StoreAgentPanel } from '@/components/StoreAgentPanel';
import { WeeklyReviewCard } from '@/components/WeeklyReviewCard';
import { SalesTrendChart } from '@/components/charts/SalesTrendChart';
import { OrderStatusChart } from '@/components/charts/OrderStatusChart';
import { CustomerInsightChart } from '@/components/charts/CustomerInsightChart';
import { UpgradeCTA } from '@/components/UpgradeCTA';
import { workspaceService } from '@/services/workspace';
import { subscriptionService } from '@/services/subscription';
import { api } from '@/services/api';
import type { DashboardStats, WorkspaceMember, Subscription, ApiKey } from '@/types';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/Toast';
import { usePageT, type Lang } from '@/i18n';

const D = {
  zh: {
    page_title: '仪表盘',
    load_failed_title: '加载仪表板失败',
    load_failed_desc: '加载仪表板数据失败',
    btn_retry: '重试',
    welcome_back: '欢迎回来，',
    default_user: '用户',
    workspace_overview: '的工作空间概览',
    btn_invite_members: '邀请成员',
    btn_create_api_key: '创建 API 密钥',
    stat_total_members: '成员总数',
    stat_total_members_sub: '活跃工作空间成员',
    stat_active_api_keys: '活跃 API 密钥',
    stat_active_api_keys_sub: '正在使用的密钥',
    stat_subscription_status: '订阅状态',
    stat_subscription_sub: '当前方案状态',
    stat_days_remaining: '剩余天数',
    stat_days_remaining_sub: '当前计费周期内',
    tabs_aria: '仪表盘分区',
    tab_overview: '概览',
    tab_insights: '数据洞察',
    tab_operations: '运营管理',
    low_stock_title: '库存预警',
    low_stock_count: '个商品库存不足',
    low_stock_more_prefix: '还有',
    low_stock_more_suffix: '个商品...',
    rec_title: '为你推荐',
    rec_subtitle: '基于购买历史的智能推荐',
    weekly_report_title: '周报',
    weekly_report_subtitle: '过去7天运营数据快照',
    week_revenue: '7天营收',
    week_orders: '7天订单',
    aov: '客单价',
    low_stock: '库存预警',
    weekly_schedule_note: '每周一9点自动推送周报邮件',
    btn_send_weekly: '立即发送周报',
    toast_report_sent: '周报已发送',
    toast_report_sent_desc: '周报将发送到工作空间管理员的邮箱',
    toast_send_failed: '发送失败',
    smtp_not_configured: 'SMTP 邮件服务未配置',
    ent_badge_panel: '企业专属面板',
    ai_recommend: 'AI 推荐',
    restock_prefix: '补货 ',
    hot_products_30d: '近30天热销商品',
    no_rec_data: '暂无足够数据生成推荐',
    retention_plan: '召回计划',
    at_risk_customers: '位客户即将流失，建议发送优惠券',
    based_on_rfm: '基于 RFM 客户分层分析',
    optimization_advice: '优化建议',
    aov_value: '客单价',
    aov_unit: '元',
    aov_low_prefix: '，建议设置满',
    aov_low_suffix: '包邮提升客单价',
    aov_good: '，表现良好',
    based_on_sales_data: '基于实际销售数据分析',
    no_data: '暂无数据',
    ai_coverage_title: 'AI分析覆盖',
    orders_analyzed: '笔订单参与分析',
    trend_judgment_title: '趋势判断',
    trend_up: '销售呈上升趋势',
    trend_down: '销售呈下降趋势',
    trend_stable: '销售趋势稳定',
    trend_none: '暂无趋势数据',
    order_status_title: '订单状态分布',
    order_status_subtitle: '各状态订单数量占比',
    no_order_data: '暂无订单数据',
    live_events_title: '实时动态',
    live_events_sub: '实时推送中 · 订单 / 退款 / 库存事件',
    live_events_offline: '连接中…',
    live_events_empty: '暂无实时事件',
    live_events_empty_desc: '在收款页发起一笔支付，事件将实时出现在这里。',
    no_order_data_desc: '还没有订单数据，创建订单后即可查看',
    pro_dashboard: 'Pro 仪表盘',
    sales_trend_title: '销售趋势',
    sales_trend_subtitle: '最近30天销售数据',
    no_sales_data: '暂无销售数据',
    no_sales_data_desc: '还没有销售趋势数据',
    customer_value_title: '客户价值分析',
    customer_value_subtitle: '基于RFM模型的客户分层',
    no_customer_segments: '还没有客户分群数据',
    membership_title: '会员等级分布',
    membership_subtitle: '客户等级统计',
    membership_total_prefix: '共',
    membership_total_suffix: ' 位客户',
    loading: '加载中...',
    no_customer_data: '暂无客户数据',
    unknown: '未知',
    svc_perf_title: '服务性能',
    svc_perf_subtitle: '实时服务器资源使用情况',
    memory_usage: '内存使用',
    cpu_usage: 'CPU 使用率',
    active_connections: '活动连接',
    quick_actions_title: '快速操作',
    qa_invite: '邀请成员',
    qa_create_key: '创建 API 密钥',
    qa_workspace_settings: '工作空间设置',
    qa_view_analytics: '查看分析',
    recent_activity_title: '最近动态',
    recent_activity_subtitle: '工作空间中的最新操作',
    activity_by_prefix: '由',
    activity_by_suffix: ' 操作',
    no_recent_activity: '暂无最近动态。',
    st_active: '活跃',
    st_trialing: '试用中',
    st_past_due: '逾期',
    st_cancelled: '已取消',
    st_incomplete: '待支付',
    st_unknown: '未知',
    st_pending: '待确认',
    st_confirmed: '已确认',
    st_processing: '处理中',
    st_shipped: '已发货',
    st_delivered: '已签收',
    st_refunded: '已退款',
  },
  en: {
    page_title: 'Dashboard',
    load_failed_title: 'Failed to load dashboard',
    load_failed_desc: 'Failed to load dashboard data',
    btn_retry: 'Retry',
    welcome_back: 'Welcome back, ',
    default_user: 'user',
    workspace_overview: ' workspace overview',
    btn_invite_members: 'Invite members',
    btn_create_api_key: 'Create API key',
    stat_total_members: 'Total members',
    stat_total_members_sub: 'Active workspace members',
    stat_active_api_keys: 'Active API keys',
    stat_active_api_keys_sub: 'Keys in use',
    stat_subscription_status: 'Subscription',
    stat_subscription_sub: 'Current plan status',
    stat_days_remaining: 'Days remaining',
    stat_days_remaining_sub: 'In current billing period',
    tabs_aria: 'Dashboard sections',
    tab_overview: 'Overview',
    tab_insights: 'Insights',
    tab_operations: 'Operations',
    low_stock_title: 'Low stock alert',
    low_stock_count: 'products below threshold',
    low_stock_more_prefix: '+',
    low_stock_more_suffix: 'more items...',
    rec_title: 'Recommended for you',
    rec_subtitle: 'Smart recommendations based on purchase history',
    weekly_report_title: 'Weekly report',
    weekly_report_subtitle: 'Last 7 days operations snapshot',
    week_revenue: '7d revenue',
    week_orders: '7d orders',
    aov: 'AOV',
    low_stock: 'Low stock',
    weekly_schedule_note: 'Weekly report is emailed automatically every Monday at 8:00 AM',
    btn_send_weekly: 'Send now',
    toast_report_sent: 'Weekly report sent',
    toast_report_sent_desc: 'The report will be emailed to workspace admins',
    toast_send_failed: 'Send failed',
    smtp_not_configured: 'SMTP email service is not configured',
    ent_badge_panel: 'Enterprise Panel',
    ai_recommend: 'AI Recommend',
    restock_prefix: 'Restock ',
    hot_products_30d: 'Top seller in the last 30 days',
    no_rec_data: 'Not enough data to generate recommendations',
    retention_plan: 'Retention plan',
    at_risk_customers: 'customers are at risk of churning — send coupons',
    based_on_rfm: 'Based on RFM customer segmentation',
    optimization_advice: 'Optimization advice',
    aov_value: 'AOV ',
    aov_unit: '',
    aov_low_prefix: ', set free shipping at ¥',
    aov_low_suffix: ' to boost AOV',
    aov_good: ', performing well',
    based_on_sales_data: 'Based on actual sales data',
    no_data: 'No data',
    ai_coverage_title: 'AI Analysis Coverage',
    orders_analyzed: 'orders analyzed',
    trend_judgment_title: 'Trend',
    trend_up: 'Sales are trending upward',
    trend_down: 'Sales are trending downward',
    trend_stable: 'Sales trend is stable',
    trend_none: 'No trend data yet',
    order_status_title: 'Order status distribution',
    order_status_subtitle: 'Order share by status',
    no_order_data: 'No order data',
    live_events_title: 'Live events',
    live_events_sub: 'Streaming in real time · orders / refunds / stock',
    live_events_offline: 'Connecting…',
    live_events_empty: 'No live events yet',
    live_events_empty_desc: 'Start a payment on the Payments page and events will stream in here.',
    no_order_data_desc: 'No orders yet — create an order to see it here',
    pro_dashboard: 'Pro Dashboard',
    sales_trend_title: 'Sales trend',
    sales_trend_subtitle: 'Last 30 days sales data',
    no_sales_data: 'No sales data',
    no_sales_data_desc: 'No sales trend data yet',
    customer_value_title: 'Customer value analysis',
    customer_value_subtitle: 'RFM-based customer segments',
    no_customer_segments: 'No customer segment data yet',
    membership_title: 'Membership distribution',
    membership_subtitle: 'Customer level statistics',
    membership_total_prefix: 'Total ',
    membership_total_suffix: ' customers',
    loading: 'Loading...',
    no_customer_data: 'No customer data',
    unknown: 'Unknown',
    svc_perf_title: 'Service performance',
    svc_perf_subtitle: 'Real-time server resource usage',
    memory_usage: 'Memory usage',
    cpu_usage: 'CPU usage',
    active_connections: 'Active connections',
    quick_actions_title: 'Quick actions',
    qa_invite: 'Invite members',
    qa_create_key: 'Create API key',
    qa_workspace_settings: 'Workspace settings',
    qa_view_analytics: 'View analytics',
    recent_activity_title: 'Recent activity',
    recent_activity_subtitle: 'Latest actions in the workspace',
    activity_by_prefix: 'By',
    activity_by_suffix: '',
    no_recent_activity: 'No recent activity.',
    st_active: 'Active',
    st_trialing: 'Trialing',
    st_past_due: 'Past due',
    st_cancelled: 'Cancelled',
    st_incomplete: 'Incomplete',
    st_unknown: 'Unknown',
    st_pending: 'Pending',
    st_confirmed: 'Confirmed',
    st_processing: 'Processing',
    st_shipped: 'Shipped',
    st_delivered: 'Delivered',
    st_refunded: 'Refunded',
  },
} as Record<Lang, Record<string, string>>;

/** Extract items from paginated response, or return data as-is if already an array.
 *  Falls back to an empty array when the response is not an array or a valid paginated object. */
function extractItems<T>(data: unknown): T {
  if (Array.isArray(data)) return data as T;
  if (data && typeof data === 'object' && 'items' in data) {
    const items = (data as { items: unknown }).items;
    return (Array.isArray(items) ? items : []) as T;
  }
  return ([] as unknown) as T;
}

// ─── Membership Distribution Card ─────────────────────────────────────────

const levelColors: Record<string, string> = {
  bronze: '#cd7f32',
  silver: '#a0a0a0',
  gold: '#d4a017',
  diamond: '#4da6ff',
};

const MembershipCard: React.FC<{ slug: string }> = ({ slug }) => {
  const t = usePageT(D);
  const [levels, setLevels] = useState<{ level: string; label: string; count: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    api.get(`/workspaces/${slug}/membership`)
      .then((res) => {
        const data = res.data;
        setLevels(data.levels || []);
        setTotal(data.total_customers || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <Card className="" title={t('membership_title')} subtitle={t('membership_subtitle')}>
        <div className="h-[120px] flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">{t('loading')}</div>
      </Card>
    );
  }

  if (total === 0) {
    return (
      <Card className="" title={t('membership_title')} subtitle={t('membership_subtitle')}>
        <div className="h-[120px] flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">{t('no_customer_data')}</div>
      </Card>
    );
  }

  const maxCount = Math.max(...levels.map((l) => l.count), 1);

  return (
    <Card className="" title={t('membership_title')} subtitle={`${t('membership_total_prefix')}${total}${t('membership_total_suffix')}`}>
      <div className="space-y-3 py-2">
        {levels.map((lvl) => {
          const pct = Math.round((lvl.count / maxCount) * 100);
          return (
            <div key={lvl.level} className="flex items-center gap-3">
              <div className="w-16 text-sm font-medium text-gray-700 dark:text-gray-300 flex-shrink-0">
                {lvl.label}
              </div>
              <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: levelColors[lvl.level] || '#888',
                  }}
                />
              </div>
              <div className="w-10 text-sm font-semibold text-gray-600 dark:text-gray-400 text-right">
                {lvl.count}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

/** 按当前时间返回问候语（凌晨/早上/中午/下午/晚上） */
const timeGreeting = (): string => {
  const h = new Date().getHours();
  if (h < 6) return '凌晨好';
  if (h < 11) return '早上好';
  if (h < 13) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
};

export const Dashboard: React.FC = () => {
  const t = usePageT(D);
  usePageTitle(t('page_title'));
  const plan = usePlan();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [profitData, setProfitData] = useState<any>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salesTrend, setSalesTrend] = useState<{ date: string; amount: number; orders: number }[]>([]);
  // AI 销售分析结果（异步后置加载，不阻塞首屏）
  const [salesAnalysisResponse, setSalesAnalysisResponse] = useState<any>(null);
  // 实时事件流（订单/退款通知实时推送）
  const { notifications: liveEvents, connected: wsConnected } = useWebSocketNotifications();
  // 收到订单事件时，营收图尾部追加一点，体现"实时"
  useEffect(() => {
    if (liveEvents.length === 0) return;
    const latest = liveEvents[0];
    const evt = String(latest?.event || '').toLowerCase();
    const isOrder = evt.includes('order') || evt.includes('payment');
    if (isOrder) {
      setSalesTrend((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        return [...prev.slice(0, -1), { ...last, amount: last.amount + 1, orders: last.orders + 1 }];
      });
    }
  }, [liveEvents]);
  const [orderStatus, setOrderStatus] = useState<{ name: string; value: number; color?: string }[]>([]);
  const [customerInsight, setCustomerInsight] = useState<{ segment: string; count: number; avgValue: number }[]>([]);
  const [aiData, setAiData] = useState<any>(null);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [dashAov, setDashAov] = useState<number>(0);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [serverMetrics, setServerMetrics] = useState<{ memory_mb: number; cpu_percent: number; connections: number } | null>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [isSendingReport, setIsSendingReport] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'insights' | 'operations'>('overview');

  // Ref to the data-loading function so the error-retry button can re-fetch
  // without a full page reload.
  const loadDataRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let cancelled = false;
    const fetchDashboardData = async (slugOverride?: string) => {
      const slug = slugOverride || currentWorkspace?.slug;
      if (!slug) {
        // No workspace yet — try to load workspaces ourselves
        try {
          const ws = await workspaceService.getWorkspaces();
          if (ws && ws.length > 0 && !cancelled) {
            // Persist selection and re-run
            localStorage.setItem('current_workspace_id', ws[0].id);
            return fetchDashboardData(ws[0].slug);
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
        const [
          membersResponse,
          subscriptionResponse,
          apiKeysResponse,
          auditLogsResponse,
          ordersStatsResponse,
          rfmResponse,
          productsResp,
        ] = await Promise.all([
          workspaceService.getMembers(slug),
          subscriptionService.getSubscription(slug).catch((err) => {
            if (err?.response?.status === 404) return null;
            throw err;
          }),
          api.get(`/workspaces/${slug}/api-keys`).catch(() => ({ data: { items: [] } })),
          api.get(`/workspaces/${slug}/audit-logs?limit=20`).catch(() => ({ data: { items: [] } })),
          api.get(`/workspaces/${slug}/orders/stats`).catch(() => ({ data: {} })),
          api.get(`/workspaces/${slug}/customers/rfm-analysis`).catch(() => ({ data: null })),
          api.get(`/workspaces/${slug}/products?page=1&page_size=200`).catch(() => ({ data: { items: [] } })),
        ]);
        if (cancelled) return;

        // Fetch server metrics (non-critical, fire-and-forget)
        api.get('/metrics/process').then(res => {
          if (!cancelled) setServerMetrics(res.data);
        }).catch(() => {});

        // AI 销售分析（千问网络请求较慢，异步后置加载，不阻塞首屏）
        api.post(`/workspaces/${slug}/ai/analyze-sales`, { period: '7d' }).then(res => {
          if (!cancelled) setSalesAnalysisResponse(res);
        }).catch(() => {});

        // Fetch product recommendations
        api.get(`/workspaces/${slug}/products/recommendations`).then(res => {
          if (!cancelled) setRecommendations(res.data);
        }).catch(() => {});

        const members: WorkspaceMember[] = membersResponse;
        const subscription: Subscription | null = subscriptionResponse;
        const apiKeys: ApiKey[] = extractItems<ApiKey[]>(apiKeysResponse.data);
        const activeApiKeys = apiKeys.filter((k) => k.is_active).length;
        const auditLogs: any[] = extractItems<any[]>(auditLogsResponse.data);

        const now = new Date();
        const periodEnd = subscription?.current_period_end
          ? new Date(subscription.current_period_end)
          : now;
        const daysRemaining = subscription
          ? Math.max(
              0,
              Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            )
          : 0;

        api.get(`/workspaces/${slug}/reports/profit-analysis`, { timeout: 30000 })
          .then(res => { if (!cancelled) setProfitData(res.data); })
          .catch(() => {});
        setStats({
          total_members: members.length,
          active_api_keys: activeApiKeys,
          subscription_status: subscription?.status || 'incomplete',
          days_remaining: daysRemaining,
          recent_activity: auditLogs.map((log: any) => ({
            id: log.id,
            action: log.action,
            resource_type: log.resource_type || '',
            resource_id: log.resource_id || '',
            details: log.details || log.action,
            user: log.user?.full_name ? log.user : { full_name: 'System' },
            created_at: log.created_at,
          })),
        });

        // --- Charts data ---

        // Order status distribution (pie chart) — API returns status_breakdown dict
        const os = ordersStatsResponse.data || {};
        const sb = os.status_breakdown || {};
        const statusData = [
          { name: 'st_pending', value: sb.pending || 0, color: '#f59e0b' },
          { name: 'st_confirmed', value: sb.confirmed || 0, color: '#3b82f6' },
          { name: 'st_processing', value: sb.processing || 0, color: '#8b5cf6' },
          { name: 'st_shipped', value: sb.shipped || 0, color: '#06b6d4' },
          { name: 'st_delivered', value: sb.delivered || 0, color: '#10b981' },
          { name: 'st_cancelled', value: sb.cancelled || 0, color: '#ef4444' },
          { name: 'st_refunded', value: sb.refunded || 0, color: '#6b7280' },
        ].filter((d) => d.value > 0);
        setOrderStatus(statusData);

        // Sales trend (line + bar chart) — use trend from orders/stats (last 7 days)
        const osTrend = os.trend;
        if (Array.isArray(osTrend) && osTrend.length > 0) {
          setSalesTrend(
            osTrend.map((d: any) => ({
              date: d.date,
              amount: d.revenue || 0,
              orders: d.orders || 0,
            }))
          );
        } else {
          // Fallback: try AI sales analysis endpoint
          const salesData = salesAnalysisResponse.data;
          if (salesData?.daily_sales) {
            setSalesTrend(
              salesData.daily_sales.map((d: any) => ({
                date: d.date,
                amount: d.amount,
                orders: d.orders,
              }))
            );
          } else if (salesData?.sales_trend) {
            setSalesTrend(
              salesData.sales_trend.map((d: any) => ({
                date: d.date || d.period,
                amount: d.amount || d.sales || 0,
                orders: d.orders || d.count || 0,
              }))
            );
          } else {
            setSalesTrend([]);
          }
        }

        // Customer RFM insight (bar + line chart) — API returns { segments: [...] }
        const rfm = rfmResponse.data;
        let rfmSegments: any[] = [];
        if (Array.isArray(rfm)) {
          rfmSegments = rfm;
        } else if (rfm && Array.isArray(rfm.segments)) {
          rfmSegments = rfm.segments;
        }
        if (rfmSegments.length > 0) {
          setCustomerInsight(
            rfmSegments.map((r: any) => ({
              segment: r.segment || r.label || t('unknown'),
              count: r.customer_count || r.count || 0,
              avgValue: r.average_total_spent || r.avg_value || r.average_value || r.avg_monetary || 0,
            }))
          );
        }

        // AI analysis data for enterprise cards
        if (salesAnalysisResponse?.data) {
          setAiData(salesAnalysisResponse.data);
        }

        // Top products from products API
        const products = productsResp?.data?.items || [];
        setTopProducts(products.slice(0, 8));

        // Low stock products
        const lowStock = products.filter(
          (p: any) => (p.stock ?? 0) <= (p.low_stock_threshold ?? 10)
        );
        setLowStockProducts(lowStock);

        // Compute AOV from order stats
        const totalRev = os.total_revenue || 0;
        const totalOrd = os.total_orders || 0;
        setDashAov(totalOrd > 0 ? totalRev / totalOrd : 0);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.response?.data?.detail || t('load_failed_desc'));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadDataRef.current = fetchDashboardData;
    fetchDashboardData();
    return () => { cancelled = true; };
  }, [currentWorkspace]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-4 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-2" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">{t('load_failed_title')}</h3>
        <p className="text-sm text-gray-500 mt-1">{error}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => loadDataRef.current()}
        >
          {t('btn_retry')}
        </Button>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">{t('st_active')}</Badge>;
      case 'trialing':
        return <Badge variant="primary">{t('st_trialing')}</Badge>;
      case 'past_due':
        return <Badge variant="danger">{t('st_past_due')}</Badge>;
      case 'cancelled':
      case 'canceled':
        return <Badge variant="neutral">{t('st_cancelled')}</Badge>;
      case 'incomplete':
        return <Badge variant="warning">{t('st_incomplete')}</Badge>;
      default:
        return <Badge variant="neutral">{status || t('st_unknown')}</Badge>;
    }
  };

  const handleSendReport = async () => {
    if (!currentWorkspace?.slug) return;
    setIsSendingReport(true);
    try {
      await api.post(`/admin/trigger-weekly-report`);
      addToast('success', t('toast_report_sent'), t('toast_report_sent_desc'));
    } catch (err: any) {
      addToast('error', t('toast_send_failed'), err?.response?.data?.detail || t('smtp_not_configured'));
    } finally {
      setIsSendingReport(false);
    }
  };

  return (
    <div className="relative space-y-6 animate-fade-in">
      {/* Background dots layer */}
      <div className="absolute inset-0 bg-tech-dots pointer-events-none -z-10" />
      {/* Welcome */}
      <PageHeader
        title={<>{timeGreeting()}，{user?.full_name?.split(' ')[0] || t('default_user')}</>}
        subtitle={
          <>
            <span className="font-medium text-gray-700">
              {currentWorkspace?.name}
            </span>
            {t('workspace_overview')}
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<UserPlus size={16} />}
              onClick={() => navigate('/team')}
            >
              {t('btn_invite_members')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus size={16} />}
              onClick={() => navigate('/api-keys')}
            >
              {t('btn_create_api_key')}
            </Button>
          </>
        }
      />

      {/* AI 结论摘要条（第一屏焦点） */}
      <div className="animate-page-in-delay-1">
        <AiDecisionPanel slug={currentWorkspace?.slug || ''} />
      </div>

      {/* 巡店 Agent（自主当班 / 待确认 / 经验库） */}
      <div className="animate-page-in-delay-2">
        <StoreAgentPanel slug={currentWorkspace?.slug || ''} />
      </div>

      {/* 经营 KPI（真实利润数据） */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in" aria-live="polite">
        <StatCard
          className="glass-card"
          icon={<Wallet size={22} className="text-emerald-600" />}
          label="总营收"
          value={`¥${(profitData?.revenue ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`}
          subtext={`${profitData?.order_items_count ?? 0} 条订单明细`}
        />
        <StatCard
          className="glass-card"
          icon={<Coins size={22} className="text-amber-600" />}
          label="总毛利"
          value={`¥${(profitData?.profit ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`}
          subtext={`成本 ¥${(profitData?.cost ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`}
        />
        <StatCard
          className="glass-card"
          icon={<Percent size={22} className="text-violet-600" />}
          label="毛利率"
          value={`${profitData?.margin ?? 0}%`}
          subtext="毛利 ÷ 营收"
        />
        <StatCard
          className="glass-card"
          icon={<Calendar size={22} className="text-primary-600" />}
          label="账户状态"
          value={getStatusBadge(stats?.subscription_status || 'incomplete')}
          subtext={`剩余 ${stats?.days_remaining ?? 0} 天`}
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 animate-page-in-delay-2" role="tablist" aria-label={t('tabs_aria')}>
        {[
          { key: 'overview', label: t('tab_overview'), icon: LayoutDashboard },
          { key: 'insights', label: t('tab_insights'), icon: PieChart },
          { key: 'operations', label: t('tab_operations'), icon: Wrench },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-all duration-200 ${
              activeTab === tab.key
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {activeTab === 'overview' && (
        <div key="tab-overview" className="space-y-6 animate-page-in">
      {/* Low Stock Alert */}
      {lowStockProducts.length > 0 && (
        <Card padding className="border-amber-200 bg-amber-50/40">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={18} className="text-amber-600" />
            <span className="text-sm font-semibold text-amber-800">
              {t('low_stock_title')} ({lowStockProducts.length} {t('low_stock_count')})
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {lowStockProducts.slice(0, 6).map((p: any) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 bg-white rounded-lg border border-amber-200"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Package size={16} className="text-gray-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                    <p className="text-xs text-gray-500">SKU: {p.sku || '-'}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-red-600 flex-shrink-0 ml-2">
                  {p.stock ?? 0}
                </span>
              </div>
            ))}
            {lowStockProducts.length > 6 && (
              <div className="flex items-center justify-center p-3 bg-white rounded-lg border border-amber-200">
                <span className="text-sm text-gray-500">{t('low_stock_more_prefix')} {lowStockProducts.length - 6} {t('low_stock_more_suffix')}</span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Personalized Recommendations */}
      {recommendations.length > 0 && (
        <Card
          title={t('rec_title')}
          subtitle={t('rec_subtitle')}
          className="animated-border border-amber-200 dark:border-amber-800"
        >
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {recommendations.map((rec: any) => (
              <div
                key={rec.id}
                className="text-center p-3 rounded-xl bg-amber-50/50 dark:bg-amber-900/10 hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition-colors cursor-pointer"
              >
                <div className="w-12 h-12 mx-auto mb-2 rounded-lg bg-amber-200 dark:bg-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-300 font-bold text-lg">
                  {rec.name.charAt(0)}
                </div>
                <p className="text-xs font-medium text-slate-800 dark:text-gray-100 truncate">{rec.name}</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">¥{rec.price}</p>
                <p className="text-xs text-gray-400 mt-1">{rec.reason}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Weekly Report Card */}
      <Card
        title={t('weekly_report_title')}
        subtitle={t('weekly_report_subtitle')}
        className="border-primary-200 dark:border-primary-800"
      >
        {(() => {
          const weekRevenue = salesTrend.slice(-7).reduce((s, d) => s + d.amount, 0);
          const weekOrders = salesTrend.slice(-7).reduce((s, d) => s + d.orders, 0);
          return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="text-center p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 tabular-nums"><CountUp value={weekRevenue} prefix="¥" /></p>
            <p className="text-xs text-gray-500 mt-1">{t('week_revenue')}</p>
            <MiniSparkline data={salesTrend.slice(-30).map((d) => d.amount)} color="#3b82f6" />
          </div>
          <div className="text-center p-3 rounded-xl bg-green-50 dark:bg-green-900/20">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 tabular-nums"><CountUp value={weekOrders} /></p>
            <p className="text-xs text-gray-500 mt-1">{t('week_orders')}</p>
            <MiniSparkline data={salesTrend.slice(-30).map((d) => d.orders)} color="#10b981" />
          </div>
          <div className="text-center p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">{dashAov > 0 ? <CountUp value={dashAov} prefix="¥" /> : '---'}</p>
            <p className="text-xs text-gray-500 mt-1">{t('aov')}</p>
            <MiniSparkline data={salesTrend.slice(-30).map((d) => (d.orders > 0 ? d.amount / d.orders : 0))} color="#f59e0b" />
          </div>
          <div className="text-center p-3 rounded-xl bg-purple-50 dark:bg-purple-900/20">
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 tabular-nums"><CountUp value={lowStockProducts.length} /></p>
            <p className="text-xs text-gray-500 mt-1">{t('low_stock')}</p>
            <MiniSparkline data={lowStockProducts.map((p: any) => p.stock || 0).slice(0, 30)} color="#8b5cf6" />
          </div>
        </div>
          );
        })()}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-400">{t('weekly_schedule_note')}</p>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Mail size={14} />}
            onClick={handleSendReport}
            isLoading={isSendingReport}
          >
            {t('btn_send_weekly')}
          </Button>
        </div>
      </Card>

      {/* 经营健康引擎（核心卖点） */}
      <HealthScoreCard slug={currentWorkspace?.slug || ''} />

      {/* 经营周会 */}
      <WeeklyReviewCard slug={currentWorkspace?.slug || ''} />

      {/* 实时事件流（概览 tab） */}
      <Card
        className=""
        title={t('live_events_title')}
        subtitle={wsConnected ? t('live_events_sub') : t('live_events_offline')}
      >
        {liveEvents.length === 0 ? (
          <EmptyState title={t('live_events_empty')} description={t('live_events_empty_desc')} />
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {liveEvents.slice(0, 12).map((e) => {
              const sum = eventSummary(e);
              return (
                <div key={e.id} className="flex items-center gap-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 px-3 py-2.5 live-event-in">
                  <span className={`w-2 h-2 rounded-full ${sum.tone} soft-pulse flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 dark:text-gray-200 truncate">{sum.desc}</p>
                  </div>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-gray-200/70 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex-shrink-0">
                    {sum.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
        </div>
      )}

      {/* ── Insights Tab ── */}
      {activeTab === 'insights' && (
        <div key="tab-insights" className="space-y-6 animate-page-in">

      {/* Enterprise badge */}
      {plan === 'enterprise' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/30 dark:to-yellow-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
          <Award size={18} className="text-amber-500" />
          <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">{t('ent_badge_panel')}</span>
        </div>
      )}

      {/* Enterprise AI recommendation cards */}
      {plan === 'enterprise' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="glass-card p-4 border border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50/30 to-transparent">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={16} className="text-amber-600" />
              <span className="text-xs font-medium text-amber-700">{t('ai_recommend')}</span>
            </div>
            {topProducts.length > 0 ? (
              <>
                <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">{t('restock_prefix')}{topProducts[0].name}</p>
                <p className="text-xs text-gray-500 mt-1">{t('hot_products_30d')}</p>
              </>
            ) : (
              <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">{t('no_rec_data')}</p>
            )}
          </div>
          <div className="glass-card p-4 border border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50/30 to-transparent">
            <div className="flex items-center gap-2 mb-2">
              <Users size={16} className="text-amber-600" />
              <span className="text-xs font-medium text-amber-700">{t('retention_plan')}</span>
            </div>
            {(() => {
              const churnSegment = customerInsight.find((s) =>
                s.segment?.includes('流失') || s.segment?.includes('at_risk') || s.segment?.includes('At Risk')
              );
              if (churnSegment) {
                return (
                  <>
                    <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">{churnSegment.count} {t('at_risk_customers')}</p>
                    <p className="text-xs text-gray-500 mt-1">{t('based_on_rfm')}</p>
                  </>
                );
              }
              return <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">{t('no_customer_data')}</p>;
            })()}
          </div>
          <div className="glass-card p-4 border border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50/30 to-transparent">
            <div className="flex items-center gap-2 mb-2">
              <Target size={16} className="text-amber-600" />
              <span className="text-xs font-medium text-amber-700">{t('optimization_advice')}</span>
            </div>
            {dashAov > 0 ? (
              <>
                <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">
                  {t('aov_value')}{dashAov.toFixed(0)}{t('aov_unit')}
                  {dashAov < 100 ? `${t('aov_low_prefix')}${Math.round(dashAov * 2)}${t('aov_low_suffix')}` : t('aov_good')}
                </p>
                <p className="text-xs text-gray-500 mt-1">{t('based_on_sales_data')}</p>
              </>
            ) : (
              <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">{t('no_data')}</p>
            )}
          </div>
        </div>
      )}

      {/* Enterprise extra metric cards */}
      {plan === 'enterprise' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="glass-card" title={t('ai_coverage_title')}>
            <div className="text-center py-10">
              <div className="text-3xl font-bold text-primary-600 dark:text-primary-400">
                {aiData?.total_orders_analyzed || 0}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('orders_analyzed')}</p>
            </div>
          </Card>
          <Card className="glass-card" title={t('trend_judgment_title')}>
            <div className="text-center py-10">
              {aiData?.trend === 'upward' ? (
                <TrendingUp size={32} className="mx-auto mb-2 text-green-500" />
              ) : aiData?.trend === 'downward' ? (
                <TrendingDown size={32} className="mx-auto mb-2 text-red-500" />
              ) : (
                <Activity size={32} className="mx-auto mb-2 text-gray-400" />
              )}
              <p className="text-sm font-medium text-slate-900 dark:text-gray-100">
                {aiData?.trend === 'upward' ? t('trend_up') :
                 aiData?.trend === 'downward' ? t('trend_down') :
                 aiData?.trend ? t('trend_stable') : t('trend_none')}
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* Charts Section - Free gets order status only, Pro+ gets full */}
      {plan === 'free' ? (
        <>
          <Card className="" title={t('order_status_title')} subtitle={t('order_status_subtitle')}>
            {orderStatus.length > 0 ? (
              <OrderStatusChart data={orderStatus.map((s) => ({ ...s, name: t(s.name) }))} />
            ) : (
              <EmptyState title={t('no_order_data')} description={t('no_order_data_desc')} />
            )}
          </Card>
          <UpgradeCTA feature={t('pro_dashboard')} />
        </>
      ) : (
        <div className="space-y-6">
          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="" title={t('sales_trend_title')} subtitle={t('sales_trend_subtitle')}>
              {salesTrend.length > 0 ? (
                <SalesTrendChart data={salesTrend} />
              ) : (
                <EmptyState title={t('no_sales_data')} description={t('no_sales_data_desc')} />
              )}
            </Card>

          <Card className="" title={t('order_status_title')} subtitle={t('order_status_subtitle')}>
            {orderStatus.length > 0 ? (
                <OrderStatusChart data={orderStatus.map((s) => ({ ...s, name: t(s.name) }))} />
              ) : (
                <EmptyState title={t('no_order_data')} description={t('no_order_data_desc')} />
              )}
            </Card>
          </div>


          <Card className="" title={t('customer_value_title')} subtitle={t('customer_value_subtitle')}>
            {customerInsight.length > 0 ? (
              <CustomerInsightChart data={customerInsight} />
            ) : (
              <EmptyState title={t('no_customer_data')} description={t('no_customer_segments')} />
            )}
          </Card>

          {/* Membership Distribution */}
          <MembershipCard slug={currentWorkspace?.slug || ''} />
        </div>
      )}
        </div>
      )}

      {/* ── Operations Tab ── */}
      {activeTab === 'operations' && (
        <div key="tab-operations" className="space-y-6 animate-page-in">
      {/* Service Performance Card (Enterprise only) */}
      {plan === 'enterprise' && serverMetrics && (
        <Card
          className="glass-card border-amber-200 dark:border-amber-800"
          title={t('svc_perf_title')}
          subtitle={t('svc_perf_subtitle')}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Server size={20} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('memory_usage')}</p>
                <p className="text-lg font-bold text-slate-900 dark:text-gray-100">
                  {serverMetrics.memory_mb.toFixed(1)} MB
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Gauge size={20} className="text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('cpu_usage')}</p>
                <p className="text-lg font-bold text-slate-900 dark:text-gray-100">
                  {serverMetrics.cpu_percent.toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Timer size={20} className="text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('active_connections')}</p>
                <p className="text-lg font-bold text-slate-900 dark:text-gray-100">
                  {serverMetrics.connections}
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Quick Actions */}
      <Card title={t('quick_actions_title')}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: UserPlus, label: t('qa_invite'), onClick: () => navigate('/team') },
            { icon: Key, label: t('qa_create_key'), onClick: () => navigate('/api-keys') },
            { icon: Settings, label: t('qa_workspace_settings'), onClick: () => navigate('/settings') },
            { icon: BarChart3, label: t('qa_view_analytics'), onClick: () => navigate('/analytics') },
          ].map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              aria-label={action.label}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-300 dark:border-gray-600 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-primary-50/50 dark:hover:bg-primary-900/20 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-50 to-purple-50 dark:from-primary-900/30 dark:to-purple-900/30 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                <action.icon size={20} className="text-primary-600 dark:text-primary-400" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {action.label}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* Recent Activity */}
      <Card
        title={t('recent_activity_title')}
        subtitle={<span>{t('recent_activity_subtitle')} <span className="glow-dot" style={{display:'inline-block'}} /></span>}
      >
        {stats?.recent_activity && stats.recent_activity.length > 0 ? (
          <div className="space-y-1">
            {stats.recent_activity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                  <Activity size={16} className="text-primary-600 dark:text-primary-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-gray-100">
                    {activity.details || activity.action}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('activity_by_prefix')} {activity.user?.full_name || 'System'}{t('activity_by_suffix')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
            {t('no_recent_activity')}
          </p>
        )}
      </Card>
        </div>
      )}
    </div>
  );
};
