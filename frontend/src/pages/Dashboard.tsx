import React, { useEffect, useState, useRef } from 'react';
import {
  Users,
  Loader2,
  Lock,
  Sparkles,
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
import { AgentReplayTimeline } from '@/components/AgentReplayTimeline';
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
import { usePageT } from '@/i18n';
import { MiniSparkline } from '@/components/dashboard/MiniSparkline';
import { MembershipCard } from '@/components/dashboard/MembershipCard';
import { D } from '@/pages/dashboard/dict';
import { extractItems, timeGreeting, eventSummary } from '@/pages/dashboard/utils';





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
  const [aiLoading, setAiLoading] = useState(true);
  const [profitRank, setProfitRank] = useState<any>(null);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [dashAov, setDashAov] = useState<number>(0);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [serverMetrics, setServerMetrics] = useState<{ memory_mb: number; cpu_percent: number; connections: number } | null>(null);
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
        // 单品毛利归因榜（Pro+ 专属；Free 会 403，静默忽略）
        api.get(`/workspaces/${slug}/ai/profit-by-product?period=30d`).then(res => {
          if (!cancelled) setProfitRank(res.data);
        }).catch(() => {});

        api.post(`/workspaces/${slug}/ai/analyze-sales`, { period: '7d' }).then(res => {
          if (!cancelled) { setSalesAnalysisResponse(res); setAiData(res.data); }
        }).catch(() => {}).finally(() => { if (!cancelled) setAiLoading(false); });

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

      {/* Tab Navigation */}
      <div className="sticky top-16 z-20 flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md pt-3 -mb-px" role="tablist" aria-label={t('tabs_aria')}>
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

      {/* ① 焦点：经营健康引擎（六维体检 + AI 总结） */}
      <HealthScoreCard slug={currentWorkspace?.slug || ''} />

      {/* AI 决策助手（千问处方）：Pro 及以上专属；Free 显示升级引导 */}
      {plan === 'free' ? (
        <div className="animate-page-in-delay-1 rounded-2xl border border-dashed border-violet-300/60 dark:border-violet-500/30 bg-violet-50/40 dark:bg-violet-500/[0.04] px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Sparkles size={18} className="text-primary-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-primary-700 dark:text-primary-300">AI 决策助手是 Pro 专属</p>
              <p className="text-[12.5px] text-primary-500/80 dark:text-primary-400/70">
                升级后解锁：千问基于真实数据开处方、一键执行、周报与定价建议、经验库沉淀
              </p>
            </div>
          </div>
          <button
            onClick={() => { window.location.hash = '#/billing'; }}
            className="text-[12px] font-bold px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors flex-shrink-0"
          >
            升级解锁
          </button>
        </div>
      ) : (
        <div className="animate-page-in-delay-1">
          <AiDecisionPanel slug={currentWorkspace?.slug || ''} />
        </div>
      )}

      {/* 巡店 Agent：Enterprise 专属（自主当班 / 待确认 / 经验库） */}
      {plan === 'enterprise' ? (
        <div className="animate-page-in-delay-2 space-y-4">
          <StoreAgentPanel slug={currentWorkspace?.slug || ''} />
          {/* Agent 决策回放：把「感知→决策→执行→回访」摊开给人看 */}
          <AgentReplayTimeline slug={currentWorkspace?.slug || ''} />
        </div>
      ) : (
        <div className="animate-page-in-delay-2 rounded-2xl border border-dashed border-violet-300/60 dark:border-violet-500/30 bg-violet-50/40 dark:bg-violet-500/[0.04] px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Lock size={18} className="text-violet-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-violet-700 dark:text-violet-300">
                {t('agent_lock_title')}
              </p>
              <p className="text-[12.5px] text-violet-500/80 dark:text-violet-400/70">
                {t('agent_lock_hint')}
              </p>
            </div>
          </div>
          <button
            onClick={() => { window.location.hash = '#/billing'; }}
            className="text-[12px] font-bold px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors flex-shrink-0"
          >
            {t('agent_lock_cta')}
          </button>
        </div>
      )}

      {/* 经营 KPI（真实利润数据） */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in" aria-live="polite">
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
      </div>


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

      {/* Weekly Report Card */}
      <Card
        title={t('weekly_report_title')}
        subtitle={t('weekly_report_subtitle')}
        className=""
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

      {/* Enterprise badge */}
      {plan === 'enterprise' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50/60 dark:bg-amber-500/[0.08] rounded-xl">
          <Award size={18} className="text-amber-500" />
          <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">{t('ent_badge_panel')}</span>
        </div>
      )}

      {/* Enterprise AI recommendation cards */}
      {plan === 'enterprise' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="glass-card p-4">
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
          <div className="glass-card p-4">
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
          <div className="glass-card p-4">
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
      {plan === 'enterprise' && (() => {
        // 本地环比兜底：近 7 天 vs 前 7 天营收（AI 数据未就绪/失败时保证卡片不空）
        const rev7 = salesTrend.slice(-7).reduce((s2, d) => s2 + (d.amount || 0), 0);
        const revPrev7 = salesTrend.slice(-14, -7).reduce((s2, d) => s2 + (d.amount || 0), 0);
        const localDelta = revPrev7 > 0 ? ((rev7 - revPrev7) / revPrev7) * 100 : null;
        const localTrend = localDelta === null ? null : localDelta >= 5 ? 'upward' : localDelta <= -5 ? 'downward' : 'stable';
        const trendVal = aiData?.trend ?? localTrend;
        const deltaPct = aiData?.growth_rate ?? localDelta;
        const forecastNext = aiData?.forecast?.next_7_days;
        const isLoadingCards = aiLoading && !aiData;
        return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="glass-card" title={t('ai_coverage_title')}>
            {isLoadingCards ? (
              <div className="text-center py-10 flex flex-col items-center gap-2">
                <Loader2 size={22} className="animate-spin text-primary-500" />
                <p className="text-sm text-gray-400">AI 分析中…</p>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-3xl font-bold text-primary-600 dark:text-primary-400 tabular-nums">
                  {aiData?.total_orders_analyzed ?? 0}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('orders_analyzed')}</p>
                <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-2">
                  近 7 天订单 100% 参与 · 峰值日 {(aiData?.peak_days || []).join('、') || '—'}
                </p>
              </div>
            )}
          </Card>
          <Card className="glass-card" title={t('trend_judgment_title')}>
            {isLoadingCards ? (
              <div className="text-center py-10 flex flex-col items-center gap-2">
                <Loader2 size={22} className="animate-spin text-primary-500" />
                <p className="text-sm text-gray-400">AI 分析中…</p>
              </div>
            ) : trendVal ? (
              <div className="text-center py-6">
                {trendVal === 'upward' ? (
                  <TrendingUp size={30} className="mx-auto mb-2 text-green-500" />
                ) : trendVal === 'downward' ? (
                  <TrendingDown size={30} className="mx-auto mb-2 text-red-500" />
                ) : (
                  <Activity size={30} className="mx-auto mb-2 text-gray-400" />
                )}
                <p className="text-sm font-medium text-slate-900 dark:text-gray-100">
                  {trendVal === 'upward' ? t('trend_up') : trendVal === 'downward' ? t('trend_down') : t('trend_stable')}
                </p>
                {deltaPct !== null && deltaPct !== undefined && (
                  <p className={`text-lg font-bold mt-1.5 tabular-nums ${deltaPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                    {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%
                  </p>
                )}
                {forecastNext ? (
                  <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-1.5">
                    未来 7 天预测 ¥{Number(forecastNext).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                    {aiData?.forecast?.confidence ? ` · 置信度${aiData.forecast.confidence === 'high' ? '高' : aiData.forecast.confidence === 'medium' ? '中' : '低'}` : ''}
                  </p>
                ) : !aiData && localTrend ? (
                  <p className="text-[11px] text-gray-400 mt-1.5">基于本地订单统计 · AI 分析加载失败</p>
                ) : null}
              </div>
            ) : (
              <div className="text-center py-10">
                <Activity size={32} className="mx-auto mb-2 text-gray-400" />
                <p className="text-sm font-medium text-slate-900 dark:text-gray-100">{t('trend_none')}</p>
              </div>
            )}
          </Card>
        </div>
        );
      })()}

      {/* 单品毛利归因榜（profit-thinking 核心）：Pro 及以上专属 */}
      {plan !== 'free' && profitRank && (
        <Card
          className="glass-card"
          title={t('profit_rank_title')}
          subtitle={t('profit_rank_subtitle')}
        >
          <div className="space-y-4">
            {/* 汇总条 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: t('pr_margin'), value: `${profitRank.summary.margin_pct ?? '—'}%`, tone: (profitRank.summary.margin_pct ?? 0) >= 30 ? 'text-emerald-600' : (profitRank.summary.margin_pct ?? 0) >= 15 ? 'text-amber-600' : 'text-red-500' },
                { label: t('pr_revenue'), value: `¥${Number(profitRank.summary.revenue || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`, tone: 'text-slate-900 dark:text-gray-100' },
                { label: t('pr_gross'), value: `¥${Number(profitRank.summary.gross_profit || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`, tone: 'text-slate-900 dark:text-gray-100' },
                { label: t('pr_loss_sku'), value: String(profitRank.summary.loss_sku_count), tone: profitRank.summary.loss_sku_count > 0 ? 'text-red-500' : 'text-emerald-600' },
              ].map((it, i) => (
                <div key={i} className="rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3 py-2.5">
                  <p className="text-[11.5px] text-gray-500 dark:text-gray-400">{it.label}</p>
                  <p className={`text-lg font-bold tabular-nums mt-0.5 ${it.tone}`}>{it.value}</p>
                </div>
              ))}
            </div>
            {/* 双榜 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-[13px] font-bold text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-1.5">
                  <TrendingUp size={14} />{t('pr_top')}
                </p>
                <div className="space-y-1.5">
                  {profitRank.top.map((x: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-[12.5px]">
                      <span className="truncate text-slate-700 dark:text-gray-200">{(i + 1)}. {x.name}</span>
                      <span className="flex-shrink-0 tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                        {x.margin_pct}% · ¥{Number(x.gross || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[13px] font-bold text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1.5">
                  <TrendingDown size={14} />{t('pr_bottom')}
                </p>
                <div className="space-y-1.5">
                  {profitRank.bottom.map((x: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-[12.5px]">
                      <span className="truncate text-slate-700 dark:text-gray-200">{(i + 1)}. {x.name}</span>
                      <span className={`flex-shrink-0 tabular-nums font-semibold ${(x.margin_pct ?? 0) < 0 ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'}`}>
                        {x.margin_pct}% · ¥{Number(x.gross || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* 建议 */}
            {profitRank.advice?.length > 0 && (
              <div className="rounded-xl border border-primary-100 dark:border-primary-500/20 bg-primary-50/50 dark:bg-primary-500/[0.06] px-3.5 py-2.5">
                <p className="text-[11.5px] font-bold text-primary-600 dark:text-primary-400 mb-1">{t('pr_advice')}</p>
                <ul className="space-y-1">
                  {profitRank.advice.map((a: string, i: number) => (
                    <li key={i} className="text-[12.5px] text-slate-600 dark:text-gray-300">· {a}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
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

      {/* ① 待办：库存预警 */}
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
                className="flex items-center justify-between p-3 bg-white dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700"
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
              <div className="flex items-center justify-center p-3 bg-white dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700">
                <span className="text-sm text-gray-500">{t('low_stock_more_prefix')} {lowStockProducts.length - 6} {t('low_stock_more_suffix')}</span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 账户与订阅（管理信息，归运营） */}
      <Card className="" title="账户与订阅" subtitle="套餐权益 / 成员 / 密钥 等管理信息">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3.5 py-3">
            <p className="text-[11.5px] text-gray-500 dark:text-gray-400">订阅状态</p>
            <p className="text-[15px] font-bold text-slate-900 dark:text-gray-100 mt-1">{getStatusBadge(stats?.subscription_status || 'incomplete')}</p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3.5 py-3">
            <p className="text-[11.5px] text-gray-500 dark:text-gray-400">剩余天数</p>
            <p className="text-[15px] font-bold text-slate-900 dark:text-gray-100 mt-1 tabular-nums">{stats?.days_remaining ?? 0} 天</p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3.5 py-3">
            <p className="text-[11.5px] text-gray-500 dark:text-gray-400">当前套餐</p>
            <p className="text-[15px] font-bold text-slate-900 dark:text-gray-100 mt-1 uppercase">{plan}</p>
          </div>
          <button
            onClick={() => navigate('/team')}
            className="rounded-xl bg-violet-50 dark:bg-violet-500/10 px-3.5 py-3 text-left hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors"
          >
            <p className="text-[11.5px] text-violet-500">团队与密钥</p>
            <p className="text-[13px] font-bold text-violet-700 dark:text-violet-300 mt-1">前往管理 →</p>
          </button>
        </div>
      </Card>
      {/* Service Performance Card (Enterprise only) */}
      {plan === 'enterprise' && serverMetrics && (
        <Card
          className="glass-card"
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
              <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-500/[0.12] flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
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