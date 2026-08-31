import React, { useState, useEffect, useCallback } from 'react';
import { Building2, Search, RefreshCw, PauseCircle, PlayCircle, Users as UsersIcon, X, Package, ShoppingBag, Activity } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';

interface WsRow {
  id: string;
  name: string;
  slug: string;
  status?: string;
  created_at?: string | null;
}

interface WsDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  brand_name: string | null;
  brand_color: string | null;
  created_at: string | null;
  members: { user_id: string; email: string; full_name: string; role: string }[];
  subscription: { plan: string | null; status: string | null; current_period_end: string | null };
  counts: { orders: number; products: number; customers: number };
  health: { score: number; level: string };
}

export const AdminWorkspaces: React.FC = () => {
  const [rows, setRows] = useState<WsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<WsDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/admin/workspaces', { params: { limit: 100 } });
      setRows(res.data?.items || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const openDetail = async (ws: WsRow) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res: any = await api.get(`/admin/workspaces/${ws.id}`);
      setDetail(res.data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleSuspend = async (ws: WsRow, to: 'suspend' | 'resume') => {
    try {
      await api.post(`/admin/workspaces/${ws.id}/${to}`);
      fetchList();
      if (detail?.id === ws.id) openDetail(ws);
    } catch { /* ignore */ }
  };

  const filtered = rows.filter((w) => !q || w.name.toLowerCase().includes(q.toLowerCase()) || w.slug.toLowerCase().includes(q.toLowerCase()));

  const fmt = (s: string | null) =>
    s ? new Date(s.replace('+00:00', 'Z')).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '—';

  const levelColor = detail?.health.level === 'red' ? 'text-red-600' : detail?.health.level === 'yellow' ? 'text-amber-600' : 'text-emerald-600';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#111827] dark:text-gray-100">工作空间管理</h1>
          <p className="mt-1 text-sm text-gray-500">全平台租户列表 · 详情下钻 · 暂停 / 恢复</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索名称 / slug"
              className="pl-9 pr-3 py-2 text-sm rounded-full border border-[#D6D9CD] bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#EB9D2A]/40 w-56"
            />
          </div>
          <Button variant="outline" size="sm" leftIcon={<RefreshCw size={14} />} onClick={fetchList} isLoading={loading}>
            刷新
          </Button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="text-left font-semibold py-3 pl-4">工作空间</th>
                <th className="text-left font-semibold py-3">Slug</th>
                <th className="text-left font-semibold py-3">状态</th>
                <th className="text-left font-semibold py-3">创建时间</th>
                <th className="text-right font-semibold py-3 pr-4">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((w) => (
                <tr key={w.id} className="hover:bg-[#F7F8F2] dark:hover:bg-gray-800/40 transition-colors">
                  <td className="py-3 pl-4">
                    <p className="font-medium text-slate-900 dark:text-gray-100 flex items-center gap-2">
                      <Building2 size={14} className="text-gray-400" />
                      {w.name}
                    </p>
                  </td>
                  <td className="py-3 text-xs text-gray-400">{w.slug}</td>
                  <td className="py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      w.status === 'suspended'
                        ? 'bg-red-50 text-red-600 dark:bg-red-900/20'
                        : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20'
                    }`}>
                      {w.status === 'suspended' ? '已暂停' : '正常'}
                    </span>
                  </td>
                  <td className="py-3 text-xs text-gray-500 tabular-nums">{fmt(w.created_at ?? null)}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => openDetail(w)}>详情</Button>
                      {w.status === 'suspended' ? (
                        <Button variant="ghost" size="sm" className="!text-emerald-600" leftIcon={<PlayCircle size={13} />} onClick={() => toggleSuspend(w, 'resume')}>
                          恢复
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" className="!text-red-600" leftIcon={<PauseCircle size={13} />} onClick={() => toggleSuspend(w, 'suspend')}>
                          暂停
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={5} className="py-10 text-center text-gray-400">暂无工作空间</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 详情弹窗 */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E4E6DC] dark:border-gray-700">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-gray-100">{detail.name}</h3>
                <p className="text-xs text-gray-400">{detail.slug} · 创建于 {fmt(detail.created_at)}</p>
              </div>
              <button onClick={() => setDetail(null)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                <X size={16} />
              </button>
            </div>

            {detailLoading ? (
              <div className="p-10 text-center text-gray-400">加载中...</div>
            ) : (
              <div className="p-6 space-y-5">
                {/* 概览卡片 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-[#E4E6DC] dark:border-gray-700 p-3.5">
                    <p className="text-xs text-gray-400">健康分</p>
                    <p className={`mt-1 text-2xl font-extrabold tabular-nums ${levelColor}`}>
                      {detail.health.score}
                    </p>
                    <span className="text-[10px] text-gray-400">{detail.health.level === 'red' ? '红灯' : detail.health.level === 'yellow' ? '黄灯' : '健康'}</span>
                  </div>
                  <div className="rounded-xl border border-[#E4E6DC] dark:border-gray-700 p-3.5">
                    <p className="text-xs text-gray-400">订单</p>
                    <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900 dark:text-gray-100">{detail.counts.orders}</p>
                    <ShoppingBag size={13} className="text-gray-300 mt-0.5" />
                  </div>
                  <div className="rounded-xl border border-[#E4E6DC] dark:border-gray-700 p-3.5">
                    <p className="text-xs text-gray-400">商品</p>
                    <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900 dark:text-gray-100">{detail.counts.products}</p>
                    <Package size={13} className="text-gray-300 mt-0.5" />
                  </div>
                  <div className="rounded-xl border border-[#E4E6DC] dark:border-gray-700 p-3.5">
                    <p className="text-xs text-gray-400">客户</p>
                    <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900 dark:text-gray-100">{detail.counts.customers}</p>
                    <UsersIcon size={13} className="text-gray-300 mt-0.5" />
                  </div>
                </div>

                {/* 订阅 */}
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-gray-100 mb-2">订阅信息</h4>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-50 text-violet-600 dark:bg-violet-900/20">
                      {detail.subscription.plan ?? '未订阅'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {detail.subscription.status ?? '—'}
                      {detail.subscription.current_period_end ? ` · 周期至 ${fmt(detail.subscription.current_period_end)}` : ''}
                    </span>
                  </div>
                </div>

                {/* 成员 */}
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-gray-100 mb-2">
                    成员（{detail.members.length}）
                  </h4>
                  <div className="space-y-2">
                    {detail.members.map((m) => (
                      <div key={m.user_id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#F7F8F2] dark:bg-gray-700/40 text-sm">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-gray-100">{m.full_name || m.email}</p>
                          <p className="text-xs text-gray-400">{m.email}</p>
                        </div>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white dark:bg-gray-600 border border-[#E4E6DC] dark:border-gray-500 text-gray-500">
                          {m.role}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 操作 */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E4E6DC] dark:border-gray-700">
                  <Button variant="outline" size="sm" onClick={() => setDetail(null)}>关闭</Button>
                  {detail.status === 'suspended' ? (
                    <Button size="sm" className="!bg-emerald-600" leftIcon={<PlayCircle size={14} />}
                      onClick={() => { toggleSuspend({ id: detail.id, name: detail.name, slug: detail.slug }, 'resume'); setDetail(null); }}>
                      恢复工作空间
                    </Button>
                  ) : (
                    <Button size="sm" className="!bg-red-600" leftIcon={<PauseCircle size={14} />}
                      onClick={() => { toggleSuspend({ id: detail.id, name: detail.name, slug: detail.slug }, 'suspend'); setDetail(null); }}>
                      暂停工作空间
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
