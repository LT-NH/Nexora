import React, { useState, useEffect } from 'react';
import { Check, CreditCard, Calendar, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { SkeletonStatCard } from '@/components/ui/StatCard';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { PaymentModal } from '@/components/billing/PaymentModal';
import { useToast } from '@/components/ui/Toast';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePageT, type Lang } from '@/i18n';
import { subscriptionService } from '@/services/subscription';
import api from '@/services/api';
import type { SubscriptionPlan, Subscription } from '@/types';

// ============================================================
// 收款码配置：把您的收款二维码图片放到 public 目录下即可。// 例如：public/qrcode.png → const QrPayUrl = '/qrcode.png'
// ============================================================
const QrCodeUrl = '/qrcode.png';

const D = {
  zh: {
    billing_page_title: '订阅管理',
    billing_title: '计费与方案',
    billing_subtitle: '管理您的订阅和计费设置',
    load_billing_failed: '加载计费数据失败',
    retry: '重试',
    plan_updated_exclaim: '方案已更新！',
    plan_updated_msg: '您的订阅方案已更新。',
    update_failed: '更新失败',
    error_occurred: '发生错误',
    plan_updated: '方案已更新',
    now_using: '您现在使用 {plan} 方案',
    switch_failed: '切换失败',
    retry_later: '请稍后重试',
    payment_confirmed: '支付确认成功！',
    upgraded_to: '您已升级到 {name} 方案。',
    activation_failed: '激活失败',
    contact_support: '请联系客服处理',
    cancelled: '已取消',
    sub_cancelled: '您的订阅已取消。',
    cancel_failed: '取消失败',
    status_active: '活跃',
    status_trialing: '试用中',
    status_trial: '试用',
    status_past_due: '逾期',
    status_cancelled: '已取消',
    status_incomplete: '待支付',
    feat_api_access: 'API 访问',
    feat_storage: '存储空间',
    feat_support: '技术支持',
    feat_custom_domain: '自定义域名',
    feat_audit_logs: '审计日志',
    feat_api_keys: 'API 密钥',
    feat_priority_support: '优先支持',
    feat_sso: 'SSO 单点登录',
    feat_white_label: '白标定制',
    feat_dedicated_support: '专属支持',
    unit_items: ' 个',
    current_plan: '当前方案',
    current_plan_subtitle: '您当前使用的是 {name} 方案',
    period_ends: '当前周期截止于',
    cancel_plan: '取消方案',
    available_plans: '可用方案',
    current: '当前',
    per_month: '/月',
    yearly_savings: '年付可节省 ${amount}/月',
    upgrade_to: '升级到 {name}',
    downgrade_to: '降级到 {name}',
    billing_history: '账单历史',
    billing_history_subtitle: '您的最近发票和付款记录',
    no_history: '暂无账单历史。',
    cancel_subscription: '取消订阅',
    about_to_cancel: '您即将取消订阅',
    cancel_warning: '您的访问权限将持续到当前计费周期结束。之后，您的订阅将被取消，您可能会失去高级功能的访问权限。',
    cancel_confirm_prefix: '您确定要取消',
    cancel_confirm_suffix: '方案吗？',
    keep_plan: '保留方案',
  },
  en: {
    billing_page_title: 'Subscription Management',
    billing_title: 'Billing & Plans',
    billing_subtitle: 'Manage your subscription and billing settings',
    load_billing_failed: 'Failed to load billing data',
    retry: 'Retry',
    plan_updated_exclaim: 'Plan updated!',
    plan_updated_msg: 'Your subscription plan has been updated.',
    update_failed: 'Update Failed',
    error_occurred: 'An error occurred',
    plan_updated: 'Plan Updated',
    now_using: 'You are now on the {plan} plan',
    switch_failed: 'Switch Failed',
    retry_later: 'Please try again later',
    payment_confirmed: 'Payment confirmed!',
    upgraded_to: 'You have been upgraded to the {name} plan.',
    activation_failed: 'Activation Failed',
    contact_support: 'Please contact support',
    cancelled: 'Cancelled',
    sub_cancelled: 'Your subscription has been cancelled.',
    cancel_failed: 'Cancel Failed',
    status_active: 'Active',
    status_trialing: 'Trialing',
    status_trial: 'Trial',
    status_past_due: 'Past Due',
    status_cancelled: 'Cancelled',
    status_incomplete: 'Incomplete',
    feat_api_access: 'API Access',
    feat_storage: 'Storage',
    feat_support: 'Support',
    feat_custom_domain: 'Custom Domain',
    feat_audit_logs: 'Audit Logs',
    feat_api_keys: 'API Keys',
    feat_priority_support: 'Priority Support',
    feat_sso: 'SSO',
    feat_white_label: 'White Label',
    feat_dedicated_support: 'Dedicated Support',
    unit_items: '',
    current_plan: 'Current Plan',
    current_plan_subtitle: 'You are currently on the {name} plan',
    period_ends: 'Current period ends:',
    cancel_plan: 'Cancel Plan',
    available_plans: 'Available Plans',
    current: 'Current',
    per_month: '/mo',
    yearly_savings: 'Save ${amount}/yr with yearly billing',
    upgrade_to: 'Upgrade to {name}',
    downgrade_to: 'Downgrade to {name}',
    billing_history: 'Billing History',
    billing_history_subtitle: 'Your recent invoices and payments',
    no_history: 'No billing history yet.',
    cancel_subscription: 'Cancel Subscription',
    about_to_cancel: 'You are about to cancel your subscription',
    cancel_warning: 'Your access will continue until the end of the current billing period. After that, your subscription will be cancelled and you may lose access to premium features.',
    cancel_confirm_prefix: 'Are you sure you want to cancel the',
    cancel_confirm_suffix: 'plan?',
    keep_plan: 'Keep Plan',
  },
} as Record<Lang, Record<string, string>>;

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const Billing: React.FC = () => {
  const t = usePageT(D);
  usePageTitle(t('billing_page_title'));
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
        setError(err?.response?.data?.detail || t('load_billing_failed'));
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
      addToast('success', t('plan_updated_exclaim'), t('plan_updated_msg'));
    } catch (err: any) {
      addToast('error', t('update_failed'), err?.response?.data?.detail || t('error_occurred'));
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
      if (result.payment_status === 'pending') {
        // Paid plan requires payment confirmation — show modal for any paid plan
        const plan = plans.find((p) => p.slug === targetSlug);
        if (plan) setEnterprisePlan(plan);
        setShowPaymentModal(true);
      } else {
        addToast('success', t('plan_updated'), t('now_using').replace('{plan}', targetSlug));
      }
    } catch (err: any) {
      addToast('error', t('switch_failed'), err?.response?.data?.detail || t('retry_later'));
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
      addToast(
        'success',
        t('payment_confirmed'),
        t('upgraded_to').replace('{name}', enterprisePlan.name)
      );
    } catch (err: any) {
      addToast('error', t('activation_failed'), err?.response?.data?.detail || t('contact_support'));
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
      addToast('success', t('cancelled'), t('sub_cancelled'));
    } catch (err: any) {
      addToast('error', t('cancel_failed'), err?.response?.data?.detail || t('error_occurred'));
    } finally {
      setIsCanceling(false);
      setShowCancelModal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <div className="h-8 w-40 bg-gray-200 dark:bg-gray-700 rounded shimmer" />
          <div className="h-4 w-64 bg-gray-200 dark:bg-gray-700 rounded shimmer mt-2" />
        </div>
        <SkeletonStatCard />
        <div className="grid md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-300 dark:border-gray-600 shadow-sm p-6 space-y-4">
              <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded shimmer" />
              <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded shimmer" />
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded shimmer" />
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
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-red-500 dark:text-red-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">{t('load_billing_failed')}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{error}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          {t('retry')}
        </Button>
      </div>
    );
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return t('status_active');
      case 'trialing': return t('status_trialing');
      case 'past_due': return t('status_past_due');
      case 'cancelled': return t('status_cancelled');
      case 'incomplete': return t('status_incomplete');
      default: return status;
    }
  };

  // Convert features object to a presentable list of labels
  const formatFeatures = (features: Record<string, any>): string[] => {
    const labels: string[] = [];
    const featureMap: Record<string, string> = {
      api_access: t('feat_api_access'),
      storage_gb: t('feat_storage'),
      support: t('feat_support'),
      custom_domain: t('feat_custom_domain'),
      audit_logs: t('feat_audit_logs'),
      api_keys: t('feat_api_keys'),
      priority_support: t('feat_priority_support'),
      sso: t('feat_sso'),
      white_label: t('feat_white_label'),
      dedicated_support: t('feat_dedicated_support'),
    };
    for (const [key, value] of Object.entries(features)) {
      if (key === 'description') continue;
      const label = featureMap[key] || key;
      if (typeof value === 'boolean') {
        if (value) labels.push(label);
      } else if (typeof value === 'number') {
        labels.push(`${label}: ${value}${key === 'storage_gb' ? ' GB' : t('unit_items')}`);
      } else if (typeof value === 'string') {
        labels.push(`${label}: ${value}`);
      }
    }
    return labels;
  };

  const currentPlanSlug = subscription?.plan?.slug;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('billing_title')}
        subtitle={t('billing_subtitle')}
      />

      {/* Current Plan */}
      {subscription && subscription.plan && (
        <Card
          title={t('current_plan')}
          subtitle={t('current_plan_subtitle').replace('{name}', subscription.plan.name)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-50 to-purple-50 flex items-center justify-center">
                <CreditCard size={22} className="text-primary-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">
                    {subscription.plan.name}
                  </h3>
                  <Badge
                    variant={
                      subscription.status === 'active'
                        ? 'success'
                        : subscription.status === 'trialing'
                        ? 'primary'
                        : subscription.status === 'incomplete'
                        ? 'warning'
                        : 'danger'
                    }
                  >
                    {getStatusLabel(subscription.status)}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 mt-1 text-sm text-gray-500 dark:text-gray-400">
                  <Calendar size={14} />
                  <span>
                    {t('period_ends')}{' '}
                    {formatDate(subscription.current_period_end)}
                  </span>
                </div>
              </div>
            </div>
            {subscription.status === 'active' && subscription.plan.slug !== 'free' && (
              <Button variant="outline" onClick={() => setShowCancelModal(true)}>
                {t('cancel_plan')}
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Plan Comparison */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100 mb-4">
          {t('available_plans')}
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
                      <h4 className="text-lg font-semibold text-slate-900 dark:text-gray-100">
                        {plan.name}
                      </h4>
                      {isCurrentPlan && (
                        <Badge variant="primary">{t('current')}</Badge>
                      )}
                    </div>
                    <div className="flex items-baseline mb-4">
                      <span className="text-3xl font-bold text-slate-900 dark:text-gray-100">
                        ${plan.price_monthly}
                      </span>
                      <span className="ml-1 text-sm text-gray-500 dark:text-gray-400">{t('per_month')}</span>
                    </div>
                    {plan.price_yearly > 0 && (
                      <p className="text-sm text-green-700 dark:text-green-400 mb-4">
                        {t('yearly_savings').replace('${amount}', String(plan.price_monthly * 12 - plan.price_yearly))}
                      </p>
                    )}
                    <ul className="space-y-2.5 mb-6">
                      {formatFeatures(plan.features).map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5">
                          <Check
                            size={16}
                            className="text-green-500 flex-shrink-0 mt-0.5"
                          />
                          <span className="text-sm text-gray-600 dark:text-gray-400">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-auto">
                    {isCurrentPlan ? (
                      <Button variant="outline" className="w-full" disabled>
                        {t('current_plan')}
                      </Button>
                    ) : (
                      <Button
                        variant={isUpgrade ? 'primary' : 'outline'}
                        className="w-full transition-all duration-300"
                        onClick={() => handleSwitchPlan(plan.slug)}
                        isLoading={isSubscribing === plan.slug}
                      >
                        {(isUpgrade ? t('upgrade_to') : t('downgrade_to')).replace('{name}', plan.name)}
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
        title={t('cancel_subscription')}
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                {t('about_to_cancel')}
              </p>
              <p className="text-sm text-red-600 mt-1">
                {t('cancel_warning')}
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('cancel_confirm_prefix')}{' '}
            <span className="font-semibold text-slate-900 dark:text-gray-100">
              {subscription?.plan?.name}
            </span>{' '}
            {t('cancel_confirm_suffix')}
          </p>
        </div>
        <ModalFooter
          onCancel={() => setShowCancelModal(false)}
          onConfirm={handleCancel}
          confirmText={t('cancel_subscription')}
          confirmVariant="danger"
          cancelText={t('keep_plan')}
          isLoading={isCanceling}
        />
      </Modal>
    </div>
  );
};

const BillingHistory: React.FC = () => {
  const t = usePageT(D);
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
    const map: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'neutral' | 'primary' }> = {
      active: { label: t('status_active'), variant: 'success' },
      trialing: { label: t('status_trial'), variant: 'primary' },
      cancelled: { label: t('status_cancelled'), variant: 'neutral' },
      incomplete: { label: t('status_incomplete'), variant: 'warning' },
      past_due: { label: t('status_past_due'), variant: 'danger' },
    };
    const info = map[status] || { label: status, variant: 'neutral' as const };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  return (
    <Card title={t('billing_history')} subtitle={t('billing_history_subtitle')}>
      {isLoadingHistory ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700 rounded-lg shimmer" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
            <AlertTriangle size={20} className="text-gray-500 dark:text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('no_history')}</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {history.map((item: any, idx: number) => (
            <div
              key={item.id || idx}
              className="flex items-center justify-between py-3 px-2 first:pt-0 last:pb-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-50 to-purple-50 flex items-center justify-center">
                  <CreditCard size={18} className="text-primary-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">{item.plan_name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(item.created_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {getStatusBadge(item.status)}
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  ${item.amount}{t('per_month')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
