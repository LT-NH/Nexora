import React, { useState, useEffect, useCallback } from 'react';
import { UserX, UserCheck, KeyRound, ShieldCheck, ShieldOff, RefreshCw, Search } from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { StatCard } from '@/components/ui/StatCard';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';
import { useI18n } from '@/i18n';
import { useToast } from '@/components/ui/Toast';

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superadmin: boolean;
  totp_enabled: boolean;
  last_login_at: string | null;
  created_at: string | null;
}

export const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const { lang } = useI18n();
  const t = lang === 'zh' ? 'zh' : 'en';

  const { addToast } = useToast();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/admin/users', { params: { limit: 100 } });
      setUsers(res.data?.items || []);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const act = async (url: string, okMsg: string, refetch = true) => {
    try {
      await api.post(url);
      addToast('success', okMsg);
      if (refetch) fetchUsers();
    } catch (e: any) {
      addToast('error', '操作失败', e?.response?.data?.detail || '');
    }
  };

  const resetPwd = async (u: AdminUser) => {
    try {
      const res: any = await api.post(`/admin/users/${u.id}/reset-password`);
      addToast('info', `临时密码：${res.data.temporary_password}（仅显示一次）`);
    } catch (e: any) {
      addToast('error', '重置失败', e?.response?.data?.detail || '');
    }
  };

  const filtered = users.filter((u) =>
    !q || u.email.toLowerCase().includes(q.toLowerCase()) || (u.full_name || '').toLowerCase().includes(q.toLowerCase()),
  );

  const fmt = (s: string | null) =>
    s ? new Date(s.replace('+00:00', 'Z')).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#111827] dark:text-gray-100">用户管理</h1>
          <p className="mt-1 text-sm text-gray-500">禁用 / 重置密码 / 超管权限，全部操作留痕审计</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索邮箱 / 姓名"
              className="pl-9 pr-3 py-2 text-sm rounded-full border border-[#D6D9CD] bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#EB9D2A]/40 w-56"
            />
          </div>
          <Button variant="outline" size="sm" leftIcon={<RefreshCw size={14} />} onClick={fetchUsers} isLoading={loading}>
            刷新
          </Button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="text-left font-semibold py-3 pl-4">用户</th>
                <th className="text-left font-semibold py-3">状态</th>
                <th className="text-left font-semibold py-3">角色</th>
                <th className="text-left font-semibold py-3">2FA</th>
                <th className="text-left font-semibold py-3">最近登录</th>
                <th className="text-left font-semibold py-3">注册时间</th>
                <th className="text-right font-semibold py-3 pr-4">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-[#F7F8F2] dark:hover:bg-gray-800/40 transition-colors">
                  <td className="py-3 pl-4">
                    <p className="font-medium text-slate-900 dark:text-gray-100">{u.full_name || u.email}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </td>
                  <td className="py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      u.is_active ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20' : 'bg-red-50 text-red-600 dark:bg-red-900/20'
                    }`}>
                      {u.is_active ? '正常' : '已禁用'}
                    </span>
                  </td>
                  <td className="py-3">
                    {u.is_superadmin ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-50 text-violet-600 dark:bg-violet-900/20">
                        <ShieldCheck size={11} /> 超管
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">用户</span>
                    )}
                  </td>
                  <td className="py-3 text-xs text-gray-500">{u.totp_enabled ? '✅' : '—'}</td>
                  <td className="py-3 text-xs text-gray-500 tabular-nums">{fmt(u.last_login_at)}</td>
                  <td className="py-3 text-xs text-gray-500 tabular-nums">{fmt(u.created_at)}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center justify-end gap-1.5">
                      {u.is_active ? (
                        <Button variant="ghost" size="sm" className="!text-red-600" leftIcon={<UserX size={13} />} onClick={() => act(`/admin/users/${u.id}/disable`, '已禁用')}>
                          禁用
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" className="!text-emerald-600" leftIcon={<UserCheck size={13} />} onClick={() => act(`/admin/users/${u.id}/enable`, '已启用')}>
                          启用
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" leftIcon={<KeyRound size={13} />} onClick={() => resetPwd(u)}>
                        重置密码
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={u.is_superadmin ? '!text-red-600' : '!text-violet-600'}
                        leftIcon={u.is_superadmin ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                        onClick={() => act(`/admin/users/${u.id}/toggle-superadmin`, u.is_superadmin ? '已收回超管' : '已授予超管')}
                      >
                        {u.is_superadmin ? '收回超管' : '设为超管'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={7} className="py-10 text-center text-gray-400">暂无用户</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
