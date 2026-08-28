import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, TrendingUp, Bot, ArrowRight, ShieldAlert, Tag, Radio } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '@/hooks/useWorkspace';
import { AiDecisionPanel } from '@/components/AiDecisionPanel';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';

const translations = {
  zh: {
    title: 'AI 经营指挥台',
    subtitle: '千问实时分析你的真实经营数据——结论可执行、效果可回访',
    center: '指挥中心',
    center_sub: '今日 AI 结论 · 一键执行 · 回访验证',
    forecast_title: '销售预测',
    forecast_sub: '未来 7 天（千问基于真实订单）',
    pricing_title: 'AI 定价雷达',
    pricing_sub: '逐商品差异化定价建议',
    risk_title: '风险雷达',
    risk_sub: '缺货与客户流失（千问解读）',
    chat_cta: '与 AI 经营顾问对话',
    view_all: '查看全部',
    no_risk: '暂无风险项',
  },
  en: {
    title: 'AI Command Center',
    subtitle: 'Qwen analyzes your real business data — actionable, verifiable',
    center: 'Command Center',
    center_sub: 'Today\'s AI conclusions · one-click execute · follow-up loop',
    forecast_title: 'Sales Forecast',
    forecast_sub: 'Next 7 days (Qwen on real orders)',
    pricing_title: 'AI Pricing Radar',
    pricing_sub: 'Per-product differentiated pricing',
    risk_title: 'Risk Radar',
    risk_sub: 'Stockout & churn (Qwen interpreted)',
    chat_cta: 'Talk to AI Advisor',
    view_all: 'View all',
    no_risk: 'No risks detected',
  },
};

export const AICommandCenter: React.FC = () => {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const slug = currentWorkspace?.slug || '';
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [sales, setSales] = useState<any>(null);
  const [pricing, setPricing] = useState<any[]>([]);
  const [predictions, setPredictions] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('nexora_lang');
      if (stored === 'en') setLang('en');
    } catch { /* ignore */ }
  }, []);
  const t = translations[lang];

  const fetchData = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const [salesRes, pricingRes, predRes] = await Promise.allSettled([
        api.post(`/workspaces/${slug}/ai/analyze-sales`, { period: '30d' }, { timeout: 60000 }),
        api.get(`/workspaces/${slug}/ai/pricing`, { timeout: 60000 }),
        api.get(`/workspaces/${slug}/ai/predictions`, { timeout: 60000 }),
      ]);
      if (salesRes.status === 'fulfilled') setSales(salesRes.value.data);
      if (pricingRes.status === 'fulfilled') setPricing(pricingRes.value.data?.items || []);
      if (predRes.status === 'fulfilled') setPredictions(predRes.value.data);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fmt = (n: number | undefined) =>
    `¥${(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;

  const riskCount = (predictions?.stockout_7d?.length || 0) + (predictions?.churn_risk?.length || 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 页头 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#111827] dark:text-gray-100 flex items-center gap-2">
            <Sparkles size={20} className="text-[#EB9D2A]" />
            {t.title}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t.subtitle}</p>
        </div>
        <Button variant="primary" leftIcon={<Bot size={15} />} onClick={() => navigate('/ai-chat')}>
          {t.chat_cta}
        </Button>
      </div>

      {/* 指挥中心：今日结论 + 执行（复用 AiDecisionPanel） */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Radio size={14} className="text-[#EB9D2A]" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-gray-100">{t.center}</h2>
          <span className="text-xs text-gray-400">{t.center_sub}</span>
        </div>
        <AiDecisionPanel slug={slug} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 销售预测 */}
        <Card title={t.forecast_title} subtitle={t.forecast_sub}>
          {sales ? (
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-[30px] font-extrabold tabular-nums tracking-tight text-[#111827] dark:text-gray-100">
                  {fmt(sales.forecast?.next_7_days)}
                </span>
                <span className="text-xs text-gray-400">{t.forecast_sub.split('（')[0]}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                  sales.trend === 'upward' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20'
                    : sales.trend === 'downward' ? 'bg-red-50 text-red-600 dark:bg-red-900/20'
                      : 'bg-gray-100 text-gray-500'}`}>
                  <TrendingUp size={12} />
                  {sales.trend === 'upward' ? '上升' : sales.trend === 'downward' ? '下行' : '平稳'}
                </span>
                <span className="text-xs text-gray-400">
                  置信度: {sales.forecast?.confidence || '-'}
                </span>
              </div>
              <div className="mt-4 space-y-1.5">
                {(sales.recommendations || []).slice(0, 2).map((r: string, i: number) => (
                  <p key={i} className="text-xs text-gray-600 dark:text-gray-300 flex gap-1.5">
                    <Sparkles size={11} className="text-[#EB9D2A] flex-shrink-0 mt-0.5" />
                    {r}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <p className="py-6 text-sm text-gray-400">{loading ? '分析中…' : '暂无数据'}</p>
          )}
        </Card>

        {/* 定价雷达 */}
        <Card title={t.pricing_title} subtitle={t.pricing_sub}>
          <div className="space-y-2">
            {pricing.slice(0, 3).map((p: any) => (
              <div key={p.product_id} className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2.5">
                <p className="text-xs font-semibold text-slate-800 dark:text-gray-200 truncate flex items-center gap-1.5">
                  <Tag size={11} className="text-[#EB9D2A] flex-shrink-0" />
                  {p.name}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{p.suggestion}</p>
              </div>
            ))}
            {pricing.length === 0 && <p className="py-6 text-sm text-gray-400">{loading ? '分析中…' : '暂无数据'}</p>}
          </div>
        </Card>

        {/* 风险雷达 */}
        <Card title={t.risk_title} subtitle={t.risk_sub}>
          {predictions ? (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full ${
                  riskCount > 0 ? 'bg-red-50 text-red-600 dark:bg-red-900/20' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20'}`}>
                  <ShieldAlert size={12} />
                  {riskCount > 0 ? `${riskCount} 项风险` : '无风险'}
                </div>
                <span className="text-xs text-gray-400">缺货 {predictions.stockout_7d?.length || 0} · 流失 {predictions.churn_risk?.length || 0}</span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                {predictions.note || t.no_risk}
              </p>
            </div>
          ) : (
            <p className="py-6 text-sm text-gray-400">{loading ? '分析中…' : '暂无数据'}</p>
          )}
        </Card>
      </div>
    </div>
  );
};
