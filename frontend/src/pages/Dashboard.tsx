import React, { useEffect, useState } from 'react';
import {
  Users,
  Key,
  CreditCard,
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
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePlan } from '@/hooks/usePlan';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonStatCard, StatCard } from '@/components/ui/StatCard';
import { SalesTrendChart } from '@/components/charts/SalesTrendChart';
import { OrderStatusChart } from '@/components/charts/OrderStatusChart';
import { CustomerInsightChart } from '@/components/charts/CustomerInsightChart';
import { UpgradeCTA } from '@/components/UpgradeCTA';
import { workspaceService } from '@/services/workspace';
import { subscriptionService } from '@/services/subscription';
import api from '@/services/api';
import type { DashboardStats, WorkspaceMember, Subscription, ApiKey } from '@/types';
import { useNavigate } from 'react-router-dom';

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

export const Dashboard: React.FC = () => {
  usePageTitle('仪表盘');
  const plan = usePlan();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salesTrend, setSalesTrend] = useState<{ date: string; amount: number; orders: number }[]>([]);
  const [orderStatus, setOrderStatus] = useState<{ name: string; value: number; color?: string }[]>([]);
  const [customerInsight, setCustomerInsight] = useState<{ segment: string; count: number; avgValue: number }[]>([]);
  const [aiData, setAiData] = useState<any>(null);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [dashAov, setDashAov] = useState<number>(0);

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
          salesAnalysisResponse,
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
          api.post(`/workspaces/${slug}/ai/analyze-sales`, { period: '7d' }).catch(() => ({ data: null })),
          api.get(`/workspaces/${slug}/customers/rfm-analysis`).catch(() => ({ data: null })),
          api.get(`/workspaces/${slug}/products?page=1&page_size=200`).catch(() => ({ data: { items: [] } })),
        ]);
        if (cancelled) return;

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
          { name: '待确认', value: sb.pending || 0, color: '#f59e0b' },
          { name: '已确认', value: sb.confirmed || 0, color: '#3b82f6' },
          { name: '处理中', value: sb.processing || 0, color: '#8b5cf6' },
          { name: '已发货', value: sb.shipped || 0, color: '#06b6d4' },
          { name: '已签收', value: sb.delivered || 0, color: '#10b981' },
          { name: '已取消', value: sb.cancelled || 0, color: '#ef4444' },
          { name: '已退款', value: sb.refunded || 0, color: '#6b7280' },
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
              segment: r.segment || r.label || '未知',
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

        // Compute AOV from order stats
        const totalRev = os.total_revenue || 0;
        const totalOrd = os.total_orders || 0;
        setDashAov(totalOrd > 0 ? totalRev / totalOrd : 0);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.response?.data?.detail || '加载仪表板数据失败');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchDashboardData();
    return () => { cancelled = true; };
  }, [currentWorkspace]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-48 bg-gray-200 rounded skeleton-pulse" />
            <div className="h-4 w-64 bg-gray-200 rounded skeleton-pulse mt-2" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
        <h3 className="text-lg font-semibold text-slate-900">加载仪表板失败</h3>
        <p className="text-sm text-gray-500 mt-1">{error}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          重试
        </Button>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="green">活跃</Badge>;
      case 'trialing':
        return <Badge variant="blue">试用中</Badge>;
      case 'past_due':
        return <Badge variant="red">逾期</Badge>;
      case 'cancelled':
      case 'canceled':
        return <Badge variant="gray">已取消</Badge>;
      case 'incomplete':
        return <Badge variant="yellow">待支付</Badge>;
      default:
        return <Badge variant="gray">{status || '未知'}</Badge>;
    }
  };

  return (
    <div className="relative space-y-6 animate-fade-in">
      {/* Background dots layer */}
      <div className="absolute inset-0 bg-tech-dots pointer-events-none -z-10" />
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">
            欢迎回来，{user?.full_name?.split(' ')[0] || '用户'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {' '}
            <span className="font-medium text-gray-700">
              {currentWorkspace?.name}
            </span>
            {' '}的工作空间概览
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<UserPlus size={16} />}
            onClick={() => navigate('/team')}
          >
            邀请成员
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus size={16} />}
            onClick={() => navigate('/api-keys')}
          >
            创建 API 密钥
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          className="glass-card card-glow"
          icon={<Users size={22} className="text-primary-600" />}
          label="成员总数"
          value={stats?.total_members || 0}
          subtext="活跃工作空间成员"
        />
        <StatCard
          className="glass-card card-glow"
          icon={<Key size={22} className="text-primary-600" />}
          label="活跃 API 密钥"
          value={stats?.active_api_keys || 0}
          subtext="正在使用的密钥"
        />
        <StatCard
          className="glass-card card-glow"
          icon={<CreditCard size={22} className="text-primary-600" />}
          label="订阅状态"
          value={getStatusBadge(stats?.subscription_status || 'incomplete')}
          subtext="当前方案状态"
        />
        <StatCard
          className="glass-card card-glow"
          icon={<Calendar size={22} className="text-primary-600" />}
          label="剩余天数"
          value={stats?.days_remaining || 0}
          subtext="当前计费周期内"
        />
      </div>

      {/* Enterprise badge */}
      {plan === 'enterprise' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/30 dark:to-yellow-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
          <Award size={18} className="text-amber-500" />
          <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">企业专属面板</span>
        </div>
      )}

      {/* Enterprise AI recommendation cards */}
      {plan === 'enterprise' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="glass-card p-4 border border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50/30 to-transparent">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={16} className="text-amber-600" />
              <span className="text-xs font-medium text-amber-700">AI 推荐</span>
            </div>
            {topProducts.length > 0 ? (
              <>
                <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">补货 {topProducts[0].name}</p>
                <p className="text-xs text-gray-500 mt-1">近30天热销商品</p>
              </>
            ) : (
              <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">暂无足够数据生成推荐</p>
            )}
          </div>
          <div className="glass-card p-4 border border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50/30 to-transparent">
            <div className="flex items-center gap-2 mb-2">
              <Users size={16} className="text-amber-600" />
              <span className="text-xs font-medium text-amber-700">召回计划</span>
            </div>
            {(() => {
              const churnSegment = customerInsight.find((s) =>
                s.segment?.includes('流失') || s.segment?.includes('at_risk') || s.segment?.includes('At Risk')
              );
              if (churnSegment) {
                return (
                  <>
                    <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">{churnSegment.count} 位客户即将流失，建议发送优惠券</p>
                    <p className="text-xs text-gray-500 mt-1">基于 RFM 客户分层分析</p>
                  </>
                );
              }
              return <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">暂无客户数据</p>;
            })()}
          </div>
          <div className="glass-card p-4 border border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50/30 to-transparent">
            <div className="flex items-center gap-2 mb-2">
              <Target size={16} className="text-amber-600" />
              <span className="text-xs font-medium text-amber-700">优化建议</span>
            </div>
            {dashAov > 0 ? (
              <>
                <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">
                  客单价{dashAov.toFixed(0)}元
                  {dashAov < 100 ? `，建议设置满${Math.round(dashAov * 2)}包邮提升客单价` : '，表现良好'}
                </p>
                <p className="text-xs text-gray-500 mt-1">基于实际销售数据分析</p>
              </>
            ) : (
              <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">暂无数据</p>
            )}
          </div>
        </div>
      )}

      {/* Enterprise extra metric cards */}
      {plan === 'enterprise' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="glass-card" title="AI分析覆盖">
            <div className="text-center py-10">
              <div className="text-3xl font-bold text-primary-600 dark:text-primary-400">
                {aiData?.total_orders_analyzed || 0}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">笔订单参与分析</p>
            </div>
          </Card>
          <Card className="glass-card" title="趋势判断">
            <div className="text-center py-10">
              {aiData?.trend === 'upward' ? (
                <TrendingUp size={32} className="mx-auto mb-2 text-green-500" />
              ) : aiData?.trend === 'downward' ? (
                <TrendingDown size={32} className="mx-auto mb-2 text-red-500" />
              ) : (
                <Activity size={32} className="mx-auto mb-2 text-gray-400" />
              )}
              <p className="text-sm font-medium text-slate-900 dark:text-gray-100">
                {aiData?.trend === 'upward' ? '销售呈上升趋势' :
                 aiData?.trend === 'downward' ? '销售呈下降趋势' :
                 aiData?.trend ? '销售趋势稳定' : '暂无趋势数据'}
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* Charts Section - Free gets order status only, Pro+ gets full */}
      {plan === 'free' ? (
        <>
          <Card className="animated-border" title="订单状态分布" subtitle="各状态订单数量占比">
            {orderStatus.length > 0 ? (
              <OrderStatusChart data={orderStatus} />
            ) : (
              <div className="h-[280px] flex items-center justify-center text-gray-500 text-sm">
                暂无订单数据
              </div>
            )}
          </Card>
          <UpgradeCTA feature="Pro 仪表盘" />
        </>
      ) : (
        <>
          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="animated-border" title="销售趋势" subtitle="最近30天销售数据">
              {salesTrend.length > 0 ? (
                <SalesTrendChart data={salesTrend} />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-gray-500 text-sm">
                  暂无销售数据
                </div>
              )}
            </Card>

            <Card className="animated-border" title="订单状态分布" subtitle="各状态订单数量占比">
              {orderStatus.length > 0 ? (
                <OrderStatusChart data={orderStatus} />
              ) : (
                <div className="h-[280px] flex items-center justify-center text-gray-500 text-sm">
                  暂无订单数据
                </div>
              )}
            </Card>
          </div>

          <Card className="animated-border" title="客户价值分析" subtitle="基于RFM模型的客户分群">
            {customerInsight.length > 0 ? (
              <CustomerInsightChart data={customerInsight} />
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-500 text-sm">
                暂无客户数据
              </div>
            )}
          </Card>

          {/* Quick Actions */}
          <Card title="快速操作">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: UserPlus, label: '邀请成员', onClick: () => navigate('/team') },
                { icon: Key, label: '创建 API 密钥', onClick: () => navigate('/api-keys') },
                { icon: Settings, label: '工作空间设置', onClick: () => navigate('/settings') },
                { icon: BarChart3, label: '查看分析', onClick: () => navigate('/analytics') },
              ].map((action) => (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-300 hover:border-primary-300 hover:bg-primary-50/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-50 to-indigo-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <action.icon size={20} className="text-primary-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-700">
                    {action.label}
                  </span>
                </button>
              ))}
            </div>
          </Card>

          {/* Recent Activity */}
          <Card
            title="最近动态"
            subtitle={<span>工作空间中的最新操作 <span className="glow-dot" style={{display:'inline-block'}} /></span>}
          >
            {stats?.recent_activity && stats.recent_activity.length > 0 ? (
              <div className="space-y-1">
                {stats.recent_activity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                      <Activity size={16} className="text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {activity.details || activity.action}
                      </p>
                      <p className="text-xs text-gray-500">
                        由 {activity.user?.full_name || 'System'} 操作
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">
                暂无最近动态。
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
