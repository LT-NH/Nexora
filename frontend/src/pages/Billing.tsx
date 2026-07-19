import React, { useState, useEffect } from 'react';
import { Check, CreditCard, Calendar, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SkeletonStatCard } from '@/components/ui/StatCard';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { PaymentModal } from '@/components/billing/PaymentModal';
import { useToast } from '@/components/ui/Toast';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageTitle } from '@/hooks/usePageTitle';
import { subscriptionService } from '@/services/subscription';
import api from '@/services/api';
import type { SubscriptionPlan, Subscription } from '@/types';

// ============================================================
// 收款码配置 — 把您的收款二维码图片放到 public 目录下即可
// 例如：public/qrcode.png → QrCodeUrl = '/qrcode.png'
// ============================================================
const QrCodeUrl = '/qrcode.png';

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const Billing: React.FC = () => {
  usePageTitle('订阅管理');
  const { currentWorkspace } = useWorkspace();
  const { addToast } = useToast();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscribing, setIsSubscribing] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [enterprisePlan, setEnterprisePlan] = useState<SubscriptionPlan | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [plansData, subData] = await Promise.all([
          subscriptionService.getPlans(),
          currentWorkspace
            ? subscriptionService.getSubscription(currentWorkspace.slug).catch((err) => {
                if (err?.response?.status === 404) return null;
                throw err;
              })
            : Promise.resolve(null),
        ]);
        setPlans(plansData);
        setSubscription(subData);
      } catch (err: any) {
        setError(err?.response?.data?.detail || '加载计费数据失败');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [currentWorkspace]);

  const handleSubscribe = async (planSlug: string) => {
    if (!currentWorkspace) return;
    setIsSubscribing(planSlug);
    try {
      const updated = await subscriptionService.subscribe(currentWorkspace.slug, {
        plan_slug: planSlug,
        billing_cycle: 'monthly',
      });
      setSubscription(updated);
      addToast('success', '方案已更新！', '您的订阅方案已更新。');
    } catch (err: any) {
      addToast('error', '更新失败', err?.response?.data?.detail || '发生错误');
    } finally {
      setIsSubscribing(null);
    }
  };

  const handleSwitchPlan = async (targetSlug: string) => {
    if (!currentWorkspace) return;
    setIsSubscribing(targetSlug);
    try {
      const result = await subscriptionService.switchPlan(currentWorkspace.slug, targetSlug);
      setSubscription(result);
      if (result.payment_status === 'pending' && targetSlug === 'enterprise') {
        setShowPaymentModal(true);
      } else {
        addToast('success', '方案已更新', `您现在使用 ${targetSlug} 方案`);
      }
    } catch (err: any) {
      addToast('error', '切换失败', err?.response?.data?.detail || '请稍后重试');
    } finally {
      setIsSubscribing(null);
    }
  };

  const handleEnterpriseClick = (plan: SubscriptionPlan) => {
    setEnterprisePlan(plan);
    setShowPaymentModal(true);
  };

  const handleConfirmPayment = async () => {
    if (!currentWorkspace || !enterprisePlan) return;
    setIsSubscribing(enterprisePlan.slug);
    try {
      let verified: Subscription;
      // If subscription already exists with pending payment (via switchPlan), just verify
      if (subscription && subscription.payment_status === 'pending') {
        verified = await subscriptionService.verifyPayment(currentWorkspace.slug);
      } else {
        // First-time subscribe flow
        await subscriptionService.subscribe(currentWorkspace.slug, {
          plan_slug: enterprisePlan.slug,
          billing_cycle: 'monthly',
        });
        verified = await subscriptionService.verifyPayment(currentWorkspace.slug);
      }
      setSubscription(verified);
      setShowPaymentModal(false);
      setEnterprisePlan(null);
      addToast('success', '支付确认成功！', `您已升级到 ${enterprisePlan.name} 方案。`);
    } catch (err: any) {
      addToast('error', '激活失败', err?.response?.data?.detail || '请联系客服处理');
    } finally {
      setIsSubscribing(null);
    }
  };

  const handleCancel = async () => {
    if (!currentWorkspace) return;
    setIsCanceling(true);
    try {
      const updated = await subscriptionService.cancelSubscription(currentWorkspace.slug);
      setSubscription(updated);
      addToast('success', '已取消', '您的订阅已取消。');
    } catch (err: any) {
      addToast('error', '取消失败', err?.response?.data?.detail || '发生错误');
    } finally {
      setIsCanceling(false);
      setShowCancelModal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <div className="h-8 w-40 bg-gray-200 rounded shimmer" />
          <div className="h-4 w-64 bg-gray-200 rounded shimmer mt-2" />
        </div>
        <SkeletonStatCard />
        <div className="grid md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-300 shadow-sm p-6 space-y-4">
              <div className="h-6 w-20 bg-gray-200 rounded shimmer" />
              <div className="h-8 w-24 bg-gray-200 rounded shimmer" />
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="h-4 w-full bg-gray-200 rounded shimmer" />
                ))}
              </div>
            </div>
          ))}
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
        <h3 className="text-lg font-semibold text-slate-900">加载计费数据失败</h3>
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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return '活跃';
      case 'trialing': return '试用中';
      case 'past_due': return '逾期';
      case 'cancelled': return '已取消';
      case 'incomplete': return '待支付';
      default: return status;
    }
  };

  // Convert features object to a presentable list of labels
  const formatFeatures = (features: Record<string, any>): string[] => {
    const labels: string[] = [];
    const featureMap: Record<string, string> = {
      description: '',
      api_access: 'API 访问',
      storage_gb: '存储空间',
      support: '技术支持',
      custom_domain: '自定义域名',
      audit_logs: '审计日志',
      api_keys: 'API 密钥',
      priority_support: '优先支持',
      sso: 'SSO 单点登录',
      white_label: '白标定制',
      dedicated_support: '专属支持',
    };
    for (const [key, value] of Object.entries(features)) {
      if (key === 'description') continue;
      const label = featureMap[key] || key;
      if (typeof value === 'boolean') {
        if (value) labels.push(label);
      } else if (typeof value === 'number') {
        labels.push(`${label}: ${value}${key === 'storage_gb' ? ' GB' : ' 个'}`);
      } else if (typeof value === 'string') {
        labels.push(`${label}: ${value}`);
      }
    }
    return labels;
  };

  const currentPlanSlug = subscription?.plan?.slug;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">计费与方案</h2>
        <p className="mt-1 text-sm text-gray-500">
          管理您的订阅和计费设置
        </p>
      </div>

      {/* Current Plan */}
      {subscription && subscription.plan && (
        <Card
          title="当前方案"
          subtitle={`您当前使用的是 ${subscription.plan.name} 方案`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-50 to-indigo-50 flex items-center justify-center">
                <CreditCard size={22} className="text-primary-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {subscription.plan.name}
                  </h3>
                  <Badge
                    variant={
                      subscription.status === 'active'
                        ? 'green'
                        : subscription.status === 'trialing'
                        ? 'blue'
                        : subscription.status === 'incomplete'
                        ? 'yellow'
                        : 'red'
                    }
                  >
                    {getStatusLabel(subscription.status)}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 mt-1 text-sm text-gray-500">
                  <Calendar size={14} />
                  <span>
                    当前周期截止：{' '}
                    {formatDate(subscription.current_period_end)}
                  </span>
                </div>
              </div>
            </div>
            {subscription.status === 'active' && subscription.plan.slug !== 'free' && (
              <Button variant="outline" onClick={() => setShowCancelModal(true)}>
                取消方案
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Plan Comparison */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          可用方案
        </h3>
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan, idx) => {
            const isCurrentPlan = currentPlanSlug === plan.slug;
            const isUpgrade = plan.price_monthly > (subscription?.plan?.price_monthly ?? 0);
            return (
              <Card
                key={plan.id}
                className={`transition-all duration-300 ${
                  isCurrentPlan
                    ? 'border-primary-300 ring-1 ring-primary-200 shadow-md'
                    : 'hover:shadow-md hover:-translate-y-1'
                }`}
                style={{ animationDelay: `${idx * 0.1}s` }}
              >
                <div className="flex flex-col h-full">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-lg font-semibold text-slate-900">
                        {plan.name}
                      </h4>
                      {isCurrentPlan && (
                        <Badge variant="blue">当前</Badge>
                      )}
                    </div>
                    <div className="flex items-baseline mb-4">
                      <span className="text-3xl font-bold text-slate-900">
                        ${plan.price_monthly}
                      </span>
                      <span className="ml-1 text-sm text-gray-500">/月</span>
                    </div>
                    {plan.price_yearly > 0 && (
                      <p className="text-sm text-green-700 mb-4">
                        年付可节省 ${plan.price_monthly * 12 - plan.price_yearly}/年
                      </p>
                    )}
                    <ul className="space-y-2.5 mb-6">
                      {formatFeatures(plan.features).map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5">
                          <Check
                            size={16}
                            className="text-green-500 flex-shrink-0 mt-0.5"
                          />
                          <span className="text-sm text-gray-600">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-auto">
                    {isCurrentPlan ? (
                      <Button variant="outline" className="w-full" disabled>
                        当前方案
                      </Button>
                    ) : (
                      <Button
                        variant={isUpgrade ? 'primary' : 'outline'}
                        className="w-full transition-all duration-300"
                        onClick={() => {
                          if (plan.slug === 'enterprise') {
                            setEnterprisePlan(plan);
                          }
                          handleSwitchPlan(plan.slug);
                        }}
                        isLoading={isSubscribing === plan.slug}
                      >
                        {isUpgrade ? `升级到 ${plan.name}` : `降级到 ${plan.name}`}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Billing History */}
      <BillingHistory />

      {/* Enterprise Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => { if (!isSubscribing) { setShowPaymentModal(false); setEnterprisePlan(null); } }}
        onConfirmPayment={handleConfirmPayment}
        planName={enterprisePlan?.name || 'Enterprise'}
        amount={enterprisePlan?.price_monthly || 0}
        qrCodeUrl={QrCodeUrl}
        isLoading={!!isSubscribing}
      />

      {/* Cancel Subscription Confirmation Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="取消订阅"
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-50 rounded-lg border border-red-200 flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800">
                您即将取消订阅
              </p>
              <p className="text-sm text-red-600 mt-1">
                您的访问权限将持续到当前计费周期结束。之后，您的订阅将被取消，您可能会失去高级功能的访问权限。
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-600">
            您确定要取消{' '}
            <span className="font-semibold text-slate-900">
              {subscription?.plan?.name}
            </span>{' '}
            方案吗？
          </p>
        </div>
        <ModalFooter
          onCancel={() => setShowCancelModal(false)}
          onConfirm={handleCancel}
          confirmText="取消订阅"
          confirmVariant="danger"
          cancelText="保留方案"
          isLoading={isCanceling}
        />
      </Modal>
    </div>
  );
};

const BillingHistory: React.FC = () => {
  const { currentWorkspace } = useWorkspace();
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!currentWorkspace) return;
      setIsLoadingHistory(true);
      try {
        const response = await api.get(
          `/subscriptions/workspace/${currentWorkspace.slug}/billing-history`
        );
        setHistory(response.data || []);
      } catch {
        setHistory([]);
      } finally {
        setIsLoadingHistory(false);
      }
    };
    fetchHistory();
  }, [currentWorkspace]);

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: 'green' | 'red' | 'yellow' | 'gray' | 'blue' }> = {
      active: { label: '活跃', variant: 'green' },
      trialing: { label: '试用', variant: 'blue' },
      cancelled: { label: '已取消', variant: 'gray' },
      incomplete: { label: '待支付', variant: 'yellow' },
      past_due: { label: '逾期', variant: 'red' },
    };
    const info = map[status] || { label: status, variant: 'gray' as const };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  return (
    <Card title="账单历史" subtitle="您的最近发票和付款记录">
      {isLoadingHistory ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-lg shimmer" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <AlertTriangle size={20} className="text-gray-500" />
          </div>
          <p className="text-sm text-gray-500">暂无账单历史。</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {history.map((item: any, idx: number) => (
            <div
              key={item.id || idx}
              className="flex items-center justify-between py-3 px-2 first:pt-0 last:pb-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-50 to-indigo-50 flex items-center justify-center">
                  <CreditCard size={18} className="text-primary-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.plan_name}</p>
                  <p className="text-xs text-gray-500">{formatDate(item.created_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {getStatusBadge(item.status)}
                <span className="text-sm font-medium text-gray-700">
                  ${item.amount}/月
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
