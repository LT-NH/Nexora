import React, { useEffect, useState } from 'react';
import { Check, CreditCard, AlertTriangle, Crown, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonStatCard } from '@/components/ui/StatCard';
import { useToast } from '@/components/ui/Toast';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePageT } from '@/i18n';
import { WechatPayModal } from '@/components/billing/WechatPayModal';
import api from '@/services/api';

const D = {
  zh: {
    billing_page_title: '订阅管理',
    billing_title: '计费与方案',
    billing_subtitle: '选择适合你的 AI 运营员工档位，随时升级',
    load_billing_failed: '加载计费数据失败',
    retry: '重试',
    admin_free: '超管账号 · 全功能免费',
    admin_free_hint: '管理员身份无需订阅，所有功能已解锁',
    current_plan: '当前方案',
    status_active: '生效中',
    status_none: '未订阅',
    status_expired: '已过期',
    expires_at: '有效期至',
    choose_period: '选择周期',
    monthly: '月付',
    yearly: '年付',
    per_month: '/月',
    per_year: '/年',
    upgrade: '升级',
    current: '当前方案',
    free_forever: '免费',
    agent_flagship: '含每日自主巡店 Agent',
    checkout_failed: '下单失败',
    load_success: '已刷新',
    most_popular: '最受欢迎',
  },
  en: {
    billing_page_title: 'Subscription',
    billing_title: 'Billing & Plans',
    billing_subtitle: 'Pick the AI operator tier that fits, upgrade anytime',
    load_billing_failed: 'Failed to load billing data',
    retry: 'Retry',
    admin_free: 'Admin account · all features free',
    admin_free_hint: 'Administrators bypass subscription — everything unlocked',
    current_plan: 'Current plan',
    status_active: 'Active',
    status_none: 'Not subscribed',
    status_expired: 'Expired',
    expires_at: 'Valid until',
    choose_period: 'Billing cycle',
    monthly: 'Monthly',
    yearly: 'Yearly',
    per_month: '/mo',
    per_year: '/yr',
    upgrade: 'Upgrade',
    current: 'Current',
    free_forever: 'Free',
    agent_flagship: 'Includes daily autonomous Store Sentinel',
    checkout_failed: 'Checkout failed',
    load_success: 'Refreshed',
    most_popular: 'Most popular',
  },
};

interface PlanInfo {
  id: string;
  slug: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  max_members: number;
  max_workspaces: number;
  features: Record<string, unknown>;
}

interface BillingStatus {
  is_admin: boolean;
  plan: { slug: string; name: string } | null;
  status: string;
  current_period_end?: string | null;
  note?: string;
}

const FEATURE_LABELS: Record<string, string> = {
  ai_health: '经营健康引擎 · 六维诊断 + AI 总结',
  ai_advisor: 'AI 决策助手 · 千问处方 + 一键执行',
  store_sentinel: '自主巡店 Agent · 每日当班 + 待确认执行',
  experience_base: '经验库沉淀 · 建议越用越准',
  profit_analysis: '利润健康 · 单品毛利归因',
  api_access: 'API 接入',
  storage_gb: '存储',
  support: '支持',
  custom_domain: '自定义域名',
  audit_logs: '审计日志',
  api_keys: 'API Key 数',
  priority_support: '优先支持',
  sso: 'SSO 单点登录',
  white_label: '白标',
  dedicated_support: '专属客服',
};

export const Billing: React.FC = () => {
  const t = usePageT(D);
  usePageTitle(t('billing_page_title'));
  const { currentWorkspace } = useWorkspace();
  const { addToast } = useToast();
  const slug = currentWorkspace?.slug || '';
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const [checkoutPlan, setCheckoutPlan] = useState<{ slug: string; name: string } | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [p, s] = await Promise.all([
        api.get(`/workspaces/${slug}/billing/plans`, { timeout: 10000 }),
        api.get(`/workspaces/${slug}/billing/status`, { timeout: 10000 }),
      ]);
      setPlans(p.data.plans || []);
      setStatus(s.data);
    } catch {
      setError(t('load_billing_failed'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (slug) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const formatFeatures = (features: Record<string, unknown>): string[] => {
    const labels: string[] = [];
    for (const [key, value] of Object.entries(features)) {
      if (key === 'description') continue;
      const label = FEATURE_LABELS[key] || key;
      if (typeof value === 'boolean') { if (value) labels.push(label); }
      else if (typeof value === 'number') labels.push(`${label}: ${value}${key === 'storage_gb' ? ' GB' : ''}`);
      else if (typeof value === 'string') labels.push(`${label}: ${value}`);
    }
    return labels;
  };

  const currentSlug = status?.plan?.slug;
  const isAdmin = status?.is_admin === true;

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
        <Button variant="outline" className="mt-4" onClick={load}>{t('retry')}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title={t('billing_title')} subtitle={t('billing_subtitle')} />

      {/* 当前状态条 */}
      {isAdmin ? (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-500/[0.08] dark:to-orange-500/[0.05] px-5 py-4 flex items-center gap-3">
          <Crown size={20} className="text-amber-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">{t('admin_free')}</p>
            <p className="text-[12.5px] text-amber-600/80 dark:text-amber-400/70">{t('admin_free_hint')}</p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck size={18} className={status?.status === 'active' ? 'text-emerald-500' : 'text-gray-400'} />
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                {t('current_plan')}：
                {status?.plan ? status.plan.name : <span className="text-gray-400">{t('status_none')}</span>}
                {status?.status && (
                  <span className={`ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full ${status.status === 'active' ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                    {status.status === 'active' ? t('status_active') : status.status === 'expired' ? t('status_expired') : status.status}
                  </span>
                )}
              </p>
              {status?.current_period_end && (
                <p className="text-[12.5px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {t('expires_at')}：{new Date(status.current_period_end).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                </p>
              )}
            </div>
          </div>
          {/* 周期切换 */}
          <div className="flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-gray-700/60 p-1">
            {(['month', 'year'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`text-[12px] font-semibold px-3 py-1.5 rounded-md transition-colors ${period === p ? 'bg-white dark:bg-gray-800 text-violet-600 dark:text-violet-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
              >
                {p === 'month' ? t('monthly') : t('yearly')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 套餐三卡 */}
      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const price = period === 'year' ? plan.price_yearly : plan.price_monthly;
          const isCurrent = currentSlug === plan.slug;
          const isFree = plan.slug === 'free';
          const proFlag = plan.slug === 'pro';
          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl border p-6 flex flex-col transition-all ${
                proFlag
                  ? 'border-violet-300 dark:border-violet-500/40 bg-white dark:bg-gray-800 shadow-lg shadow-violet-500/10'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm'
              }`}
            >
              {proFlag && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-bold px-3 py-1 rounded-full bg-violet-600 text-white">
                  {t('most_popular')}
                </span>
              )}
              <div className="flex items-center justify-between mb-3">
                <p className="text-base font-bold text-slate-900 dark:text-gray-100">{plan.name}</p>
                {isCurrent && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    {t('current')}
                  </span>
                )}
              </div>
              <div className="mb-4">
                <span className="text-3xl font-extrabold text-slate-900 dark:text-gray-100 tabular-nums">
                  {isFree ? t('free_forever') : `¥${price}`}
                </span>
                {!isFree && (
                  <span className="text-sm text-gray-400 ml-1">{period === 'year' ? t('per_year') : t('per_month')}</span>
                )}
              </div>
              <ul className="space-y-2 flex-1 mb-5">
                {formatFeatures(plan.features).map((f, i) => (
                  <li key={i} className="text-[13px] text-gray-600 dark:text-gray-300 flex items-start gap-2">
                    <Check size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}

              </ul>
              {isFree ? (
                <Button variant="outline" disabled className="w-full">{t('free_forever')}</Button>
              ) : isCurrent ? (
                <Button variant="outline" disabled className="w-full">{t('current')}</Button>
              ) : isAdmin ? (
                <Button variant="outline" disabled className="w-full">{t('admin_free')}</Button>
              ) : (
                <Button
                  className={`w-full ${proFlag ? 'bg-violet-600 hover:bg-violet-700 text-white' : ''}`}
                  onClick={() => setCheckoutPlan({ slug: plan.slug, name: plan.name })}
                >
                  <CreditCard size={14} className="mr-1.5" />
                  {t('upgrade')}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* 微信扫码支付弹窗 */}
      {checkoutPlan && (
        <WechatPayModal
          slug={slug}
          planSlug={checkoutPlan.slug}
          planName={checkoutPlan.name}
          period={period}
          onClose={() => setCheckoutPlan(null)}
          onSuccess={() => { setCheckoutPlan(null); load(); }}
        />
      )}
    </div>
  );
};
