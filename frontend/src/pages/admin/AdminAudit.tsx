import React, { useState, useEffect, useCallback } from 'react';
import { ScrollText, RefreshCw, Search } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';

interface AuditItem { id: string; action: string; user_id: string | null; resource_id: string | null; detail: string | null; created_at: string | null; }

const riskyActions = ['admin.', 'delete', 'disable', 'reset_password', 'toggle_superadmin', 'subscription'];

export const AdminAudit: React.FC = () => {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/admin/audit', { params: { limit: 80, action: q || undefined } });
      setItems(res.data?.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    const timer = setTimeout(fetchAudit, q ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetchAudit, q]);

  const fmt = (s: string | null) =>
    s ? new Date(s.replace('+00:00', 'Z')).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

  const isRisky = (action: string) => riskyActions.some((r) => action.includes(r));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#111827] dark:text-gray-100">审计日志</h1>
          <p className="mt-1 text-sm text-gray-500">全平台操作留痕——管理动作、业务写操作，可按动作类型过滤</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="按动作类型过滤（如 admin.user）"
              className="pl-9 pr-3 py-2 text-sm rounded-full border border-[#D6D9CD] bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#EB9D2A]/40 w-64"
            />
          </div>
          <Button variant="outline" size="sm" leftIcon={<RefreshCw size={14} />} onClick={fetchAudit} isLoading={loading}>
            刷新
          </Button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="text-left font-semibold py-3 pl-4">动作</th>
                <th className="text-left font-semibold py-3">操作者</th>
                <th className="text-left font-semibold py-3">资源</th>
                <th className="text-left font-semibold py-3">详情</th>
                <th className="text-left font-semibold py-3">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {items.map((a) => (
                <tr key={a.id} className="hover:bg-[#F7F8F2] dark:hover:bg-gray-800/40 transition-colors">
                  <td className="py-3 pl-4">
                    <span className={`inline-flex items-center gap-1 font-mono text-xs px-2 py-1 rounded-full ${
                      isRisky(a.action)
                        ? 'bg-red-50 text-red-600 dark:bg-red-900/20 border border-red-100 dark:border-red-900'
                        : 'bg-gray-50 text-gray-600 dark:bg-gray-800'
                    }`}>
                      <ScrollText size={11} />
                      {a.action}
                    </span>
                  </td>
                  <td className="py-3 text-xs text-gray-500 font-mono">{a.user_id?.slice(0, 8) || '—'}</td>
                  <td className="py-3 text-xs text-gray-500 font-mono">{a.resource_id?.slice(0, 8) || '—'}</td>
                  <td className="py-3 text-xs text-gray-600 dark:text-gray-300 max-w-[360px] truncate" title={a.detail || ''}>{a.detail || '—'}</td>
                  <td className="py-3 text-xs text-gray-400 tabular-nums whitespace-nowrap">{fmt(a.created_at)}</td>
                </tr>
              ))}
              {items.length === 0 && !loading && (
                <tr><td colSpan={5} className="py-10 text-center text-gray-400">暂无审计记录</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
