import React, { useState, useEffect, useCallback } from 'react';
import { CreditCard, CalendarPlus, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';
import { useToast } from '@/components/ui/Toast';

interface SubItem { id: string; workspace_name: string; plan: string; status: string; billing_cycle: string; current_period_end: string | null; }
interface PayItem { id: string; workspace_name: string; amount: number; method: string; status: string; }

export const AdminSubscriptions: React.FC = () => {
  const [subs, setSubs] = useState<SubItem[]>([]);
  const [pays, setPays] = useState<PayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'subs' | 'pays'>('subs');

  const { addToast } = useToast();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.allSettled([
        api.get('/admin/subscriptions'),
        api.get('/admin/payments'),
      ]);
      if (s.status === 'fulfilled') setSubs(s.value.data?.items || []);
      if (p.status === 'fulfilled') setPays(p.value.data?.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const extend = async (id: string) => {
    const days = prompt('延长多少天？（1-3650）', '30');
    if (!days) return;
    try {
      await api.post(`/admin/subscriptions/${id}/extend`, { days: parseInt(days) });
      addToast('success', '已延长');
      fetchAll();
    } catch (e: any) {
      addToast('error', '失败', e?.response?.data?.detail || '');
    }
  };

  const markPaid = async (id: string) => {
    try {
      await api.post(`/admin/payments/${id}/mark-paid`);
      addToast('success', '已标记为已支付');
      fetchAll();
    } catch (e: any) {
      addToast('error', '失败', e?.response?.data?.detail || '');
    }
  };

  const statusColor: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20',
    trialing: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20',
    past_due: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20',
    canceled: 'bg-red-50 text-red-600 dark:bg-red-900/20',
    incomplete: 'bg-gray-100 text-gray-500 dark:bg-gray-800',
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#111827] dark:text-gray-100">订阅与支付</h1>
          <p className="mt-1 text-sm text-gray-500">手动改套餐 / 延长周期 / 支付核销——线下收款场景的运营通道</p>
        </div>
        <Button variant="outline" size="sm" leftIcon={<RefreshCw size={14} />} onClick={fetchAll} isLoading={loading}>刷新</Button>
      </div>

      {/* Tab */}
      <div className="flex gap-1">
        {([['subs', `订阅 (${subs.length})`], ['pays', `支付流水 (${pays.length})`]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-full border transition-all duration-200 ${
              tab === k
                ? 'bg-[#EB9D2A] border-[#EB9D2A] text-white'
                : 'bg-white dark:bg-gray-800 border-[#D6D9CD] dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-[#F5F6F0]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'subs' ? (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="text-left font-semibold py-3 pl-4">工作空间</th>
                <th className="text-left font-semibold py-3">套餐</th>
                <th className="text-left font-semibold py-3">状态</th>
                <th className="text-left font-semibold py-3">周期</th>
                <th className="text-left font-semibold py-3">到期日</th>
                <th className="text-right font-semibold py-3 pr-4">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {subs.map((s) => (
                <tr key={s.id} className="hover:bg-[#F7F8F2] dark:hover:bg-gray-800/40 transition-colors">
                  <td className="py-3 pl-4 font-medium text-slate-900 dark:text-gray-100">{s.workspace_name}</td>
                  <td className="py-3">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-50 text-violet-600 dark:bg-violet-900/20">
                      <CreditCard size={11} /> {s.plan}
                    </span>
                  </td>
                  <td className="py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor[s.status] || statusColor.incomplete}`}>{s.status}</span>
                  </td>
                  <td className="py-3 text-xs text-gray-500">{s.billing_cycle}</td>
                  <td className="py-3 text-xs text-gray-500 tabular-nums">
                    {s.current_period_end ? new Date(s.current_period_end.replace('+00:00', 'Z')).toLocaleDateString('zh-CN') : '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex justify-end gap-1.5">
                      <Button variant="ghost" size="sm" className="!text-violet-600" leftIcon={<CalendarPlus size={13} />} onClick={() => extend(s.id)}>
                        延期
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => {
                        const plan = prompt('目标套餐 slug（free / pro / enterprise）：', 'pro');
                        const note = prompt('变更备注（必填，记录审计）：');
                        if (!plan || !note) return;
                        api.post(`/admin/subscriptions/${s.id}/change-plan`, { plan_slug: plan, note }).then(() => {
                          addToast('success', '已变更套餐');
                          fetchAll();
                        }).catch((e: any) => addToast('error', '失败', e?.response?.data?.detail || ''));
                      }}>
                        改套餐
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {subs.length === 0 && !loading && <tr><td colSpan={6} className="py-10 text-center text-gray-400">暂无订阅</td></tr>}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="text-left font-semibold py-3 pl-4">工作空间</th>
                <th className="text-left font-semibold py-3">金额</th>
                <th className="text-left font-semibold py-3">方式</th>
                <th className="text-left font-semibold py-3">状态</th>
                <th className="text-right font-semibold py-3 pr-4">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {pays.map((p) => (
                <tr key={p.id} className="hover:bg-[#F7F8F2] dark:hover:bg-gray-800/40 transition-colors">
                  <td className="py-3 pl-4 font-medium text-slate-900 dark:text-gray-100">{p.workspace_name}</td>
                  <td className="py-3 font-bold tabular-nums text-emerald-600">¥{(parseFloat(p.amount as any) || 0).toFixed(2)}</td>
                  <td className="py-3 text-xs text-gray-500">{p.method}</td>
                  <td className="py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${p.status === 'paid' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20' : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {p.status !== 'paid' && (
                      <Button variant="ghost" size="sm" className="!text-emerald-600" leftIcon={<CheckCircle2 size={13} />} onClick={() => markPaid(p.id)}>
                        标记已支付
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {pays.length === 0 && !loading && <tr><td colSpan={5} className="py-10 text-center text-gray-400">暂无支付记录</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
};
