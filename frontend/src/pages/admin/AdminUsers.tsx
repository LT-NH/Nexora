import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  UserX, UserCheck, KeyRound, ShieldCheck, ShieldOff, RefreshCw, Search,
  X, ChevronLeft, ChevronRight, Mail, Phone, Clock, Building2, ScrollText,
  MailCheck, MailX, Smartphone,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Portal } from '@/components/ui/Portal';
import api from '@/services/api';
import { useToast } from '@/components/ui/Toast';

const PAGE_SIZE = 20;

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  is_active: boolean;
  is_superadmin: boolean;
  email_verified: boolean;
  totp_enabled: boolean;
  last_login_at: string | null;
  created_at: string | null;
  workspace_count: number;
}

interface UserWorkspace {
  workspace_id: string;
  name: string | null;
  role: string;
  joined_at: string | null;
}

interface UserAudit {
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  created_at: string | null;
  details?: Record<string, unknown> | null;
}

interface UserDetail extends AdminUser {
  phone?: string | null;
  updated_at?: string | null;
  workspaces: UserWorkspace[];
  recent_audits: UserAudit[];
}

const ROLE_LABEL: Record<string, string> = {
  owner: '拥有者',
  admin: '管理员',
  member: '成员',
  viewer: '只读',
};

/** 常见审计动作的人话说法；未收录的直接显示原始 action（不做二次猜测，避免译错） */
const ACTION_LABEL: Record<string, string> = {
  'user.login': '登录',
  'user.logout': '退出登录',
  'user.registered': '注册账号',
  'user.password_changed': '修改密码',
  'user.profile_updated': '更新个人资料',
  'admin.user.disable': '禁用用户',
  'admin.user.enable': '启用用户',
  'admin.user.reset_password': '重置密码',
  'admin.user.toggle_superadmin': '调整超管权限',
  'admin.workspace.suspend': '暂停工作空间',
  'admin.workspace.resume': '恢复工作空间',
};

const fmtDateTime = (s: string | null | undefined) =>
  s
    ? new Date(s.includes('T') && !/Z|[+-]\d{2}:?\d{2}$/.test(s) ? s + 'Z' : s).toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : '—';

const relativeDays = (s: string | null | undefined): string => {
  if (!s) return '从未登录';
  const t = new Date(s.includes('T') && !/Z|[+-]\d{2}:?\d{2}$/.test(s) ? s + 'Z' : s).getTime();
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 30) return `${days} 天前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
};

export const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const { addToast } = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 搜索防抖：每敲一个字都打一次后台没必要
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  const fetchUsers = useCallback(
    async (skipCache = false) => {
      setLoading(true);
      try {
        const res: any = await api.get('/admin/users', {
          params: {
            page,
            page_size: PAGE_SIZE,
            q: debouncedQ || undefined,
            status: statusFilter || undefined,
            role: roleFilter || undefined,
          },
          ...(skipCache ? { headers: { 'X-Skip-Cache': '1' } } : {}),
        });
        setUsers(res.data?.items || []);
        setTotal(res.data?.total || 0);
        setTotalPages(res.data?.total_pages || 1);
      } catch {
        setUsers([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    },
    [page, debouncedQ, statusFilter, roleFilter],
  );

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res: any = await api.get(`/admin/users/${id}`, { headers: { 'X-Skip-Cache': '1' } });
      setDetail(res.data);
    } catch (e: any) {
      addToast('error', '加载用户详情失败', e?.response?.data?.detail || '');
      setDetailId(null);
    } finally {
      setDetailLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (detailId) fetchDetail(detailId);
    else setDetail(null);
  }, [detailId, fetchDetail]);

  // Esc 关闭抽屉
  useEffect(() => {
    if (!detailId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDetailId(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [detailId]);

  const act = async (url: string, okMsg: string) => {
    try {
      await api.post(url);
    } catch (e: any) {
      addToast('error', '操作失败', e?.response?.data?.detail || '');
      return;
    }
    addToast('success', okMsg);
    // 刷新列表（独立 try，任何异常都不阻断；X-Skip-Cache 强制绕过 GET 缓存拿最新数据）
    try {
      await fetchUsers(true);
    } catch { /* ignore */ }
    if (detailId) {
      try {
        await fetchDetail(detailId);
      } catch { /* ignore */ }
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

  const hasFilter = !!(q || statusFilter || roleFilter);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#111827] dark:text-gray-100">用户管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            共 {total} 位用户 · 禁用 / 重置密码 / 超管权限，全部操作留痕审计
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索邮箱 / 姓名"
              className="pl-9 pr-3 py-2 text-sm rounded-full border border-[#D6D9CD] bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#EB9D2A]/40 w-56"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm rounded-full border border-[#D6D9CD] bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#EB9D2A]/40"
          >
            <option value="">全部状态</option>
            <option value="active">正常</option>
            <option value="disabled">已禁用</option>
          </select>
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm rounded-full border border-[#D6D9CD] bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#EB9D2A]/40"
          >
            <option value="">全部角色</option>
            <option value="superadmin">超管</option>
            <option value="user">普通用户</option>
          </select>
          {hasFilter && (
            <Button variant="ghost" size="sm" leftIcon={<X size={13} />} onClick={() => { setQ(''); setStatusFilter(''); setRoleFilter(''); setPage(1); }}>
              清除筛选
            </Button>
          )}
          <Button variant="outline" size="sm" leftIcon={<RefreshCw size={14} />} onClick={() => fetchUsers(true)} isLoading={loading}>
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
                <th className="text-left font-semibold py-3">工作空间</th>
                <th className="text-left font-semibold py-3">2FA</th>
                <th className="text-left font-semibold py-3">最近登录</th>
                <th className="text-left font-semibold py-3">注册时间</th>
                <th className="text-right font-semibold py-3 pr-4">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {users.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setDetailId(u.id)}
                  className="hover:bg-[#F7F8F2] dark:hover:bg-gray-800/40 transition-colors cursor-pointer"
                  title="点击查看详情"
                >
                  <td className="py-3 pl-4">
                    <div className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-full bg-[#0b1023]/5 dark:bg-white/10 flex items-center justify-center text-xs font-bold text-[#0b1023] dark:text-gray-200 flex-shrink-0 overflow-hidden">
                        {u.avatar_url
                          ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                          : (u.full_name || u.email).charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-gray-100 truncate">{u.full_name || u.email}</p>
                        <p className="text-xs text-gray-400 truncate">{u.email}</p>
                      </div>
                    </div>
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
                  <td className="py-3">
                    <span className="text-xs text-gray-500 tabular-nums">{u.workspace_count ?? 0} 个</span>
                  </td>
                  <td className="py-3 text-xs text-gray-500">{u.totp_enabled ? '已开启' : '—'}</td>
                  <td className="py-3">
                    <p className="text-xs text-gray-500 tabular-nums">{fmtDateTime(u.last_login_at)}</p>
                    <p className="text-[11px] text-gray-400">{relativeDays(u.last_login_at)}</p>
                  </td>
                  <td className="py-3 text-xs text-gray-500 tabular-nums">{fmtDateTime(u.created_at)}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
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
              {users.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-gray-400">
                    {hasFilter ? '没有符合条件的用户' : '暂无用户'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <span className="text-xs text-gray-500">
              共 {total} 位用户 · 第 {page} / {totalPages} 页
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} leftIcon={<ChevronLeft size={14} />}>
                上一页
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                下一页 <ChevronRight size={14} className="ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── 用户详情抽屉：列表只能回答「谁」，这里回答「他在哪、做过什么」 ── */}
      {detailId && (
        <Portal>
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDetailId(null)} aria-hidden="true" />
            <aside
              role="dialog"
              aria-label="用户详情"
              className="relative w-full max-w-md h-full bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between px-5 h-14 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
                <h2 className="text-sm font-bold text-[#111827] dark:text-gray-100">用户详情</h2>
                <button
                  onClick={() => setDetailId(null)}
                  aria-label="关闭"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {detailLoading && !detail ? (
                <div className="p-5 space-y-3 animate-pulse">
                  <div className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800" />
                  <div className="h-24 rounded-xl bg-gray-100 dark:bg-gray-800" />
                  <div className="h-32 rounded-xl bg-gray-100 dark:bg-gray-800" />
                </div>
              ) : detail ? (
                <div className="p-5 space-y-5">
                  {/* 基本信息 */}
                  <div className="flex items-start gap-3">
                    <span className="w-12 h-12 rounded-full bg-[#0b1023]/5 dark:bg-white/10 flex items-center justify-center text-base font-bold text-[#0b1023] dark:text-gray-200 flex-shrink-0 overflow-hidden">
                      {detail.avatar_url
                        ? <img src={detail.avatar_url} alt="" className="w-full h-full object-cover" />
                        : (detail.full_name || detail.email).charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-base font-bold text-[#111827] dark:text-gray-100 truncate">
                        {detail.full_name || detail.email}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{detail.email}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          detail.is_active ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20' : 'bg-red-50 text-red-600 dark:bg-red-900/20'
                        }`}>
                          {detail.is_active ? '正常' : '已禁用'}
                        </span>
                        {detail.is_superadmin && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 dark:bg-violet-900/20">
                            <ShieldCheck size={10} /> 超管
                          </span>
                        )}
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                          detail.email_verified
                            ? 'bg-sky-50 text-sky-600 dark:bg-sky-900/20'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-800'
                        }`}>
                          {detail.email_verified ? <MailCheck size={10} /> : <MailX size={10} />}
                          {detail.email_verified ? '邮箱已验证' : '邮箱未验证'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <dl className="grid grid-cols-1 gap-2.5 text-sm">
                    <div className="flex items-center gap-2.5">
                      <Mail size={14} className="text-gray-400 flex-shrink-0" />
                      <dt className="text-gray-400 w-20 flex-shrink-0">邮箱</dt>
                      <dd className="text-gray-700 dark:text-gray-300 truncate">{detail.email}</dd>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Smartphone size={14} className="text-gray-400 flex-shrink-0" />
                      <dt className="text-gray-400 w-20 flex-shrink-0">手机</dt>
                      <dd className="text-gray-700 dark:text-gray-300">{detail.phone || '未填写'}</dd>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <ShieldCheck size={14} className="text-gray-400 flex-shrink-0" />
                      <dt className="text-gray-400 w-20 flex-shrink-0">两步验证</dt>
                      <dd className="text-gray-700 dark:text-gray-300">{detail.totp_enabled ? '已开启' : '未开启'}</dd>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Clock size={14} className="text-gray-400 flex-shrink-0" />
                      <dt className="text-gray-400 w-20 flex-shrink-0">注册时间</dt>
                      <dd className="text-gray-700 dark:text-gray-300 tabular-nums">{fmtDateTime(detail.created_at)}</dd>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Clock size={14} className="text-gray-400 flex-shrink-0" />
                      <dt className="text-gray-400 w-20 flex-shrink-0">最近登录</dt>
                      <dd className="text-gray-700 dark:text-gray-300 tabular-nums">
                        {fmtDateTime(detail.last_login_at)}
                        <span className="text-gray-400 ml-1.5">（{relativeDays(detail.last_login_at)}）</span>
                      </dd>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="text-gray-400 text-xs w-14 mt-0.5 flex-shrink-0">用户 ID</span>
                      <dd className="text-[11px] font-mono text-gray-500 break-all">{detail.id}</dd>
                    </div>
                  </dl>

                  {/* 操作（与列表一致，详情里也能直接办） */}
                  <div className="flex flex-wrap gap-2">
                    {detail.is_active ? (
                      <Button variant="outline" size="sm" className="!text-red-600" leftIcon={<UserX size={13} />} onClick={() => act(`/admin/users/${detail.id}/disable`, '已禁用')}>
                        禁用账号
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="!text-emerald-600" leftIcon={<UserCheck size={13} />} onClick={() => act(`/admin/users/${detail.id}/enable`, '已启用')}>
                        启用账号
                      </Button>
                    )}
                    <Button variant="outline" size="sm" leftIcon={<KeyRound size={13} />} onClick={() => resetPwd(detail)}>
                      重置密码
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className={detail.is_superadmin ? '!text-red-600' : '!text-violet-600'}
                      leftIcon={detail.is_superadmin ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                      onClick={() => act(`/admin/users/${detail.id}/toggle-superadmin`, detail.is_superadmin ? '已收回超管' : '已授予超管')}
                    >
                      {detail.is_superadmin ? '收回超管' : '设为超管'}
                    </Button>
                  </div>

                  {/* 所属工作空间 */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 size={14} className="text-gray-400" />
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        所属工作空间（{detail.workspaces.length}）
                      </h3>
                    </div>
                    {detail.workspaces.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">不属于任何工作空间</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {detail.workspaces.map((w) => (
                          <li key={w.workspace_id} className="flex items-center justify-between gap-2 rounded-lg bg-[#F7F8F2] dark:bg-gray-800/60 px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{w.name || w.workspace_id}</p>
                              <p className="text-[11px] text-gray-400">加入于 {fmtDateTime(w.joined_at)}</p>
                            </div>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 flex-shrink-0">
                              {ROLE_LABEL[w.role] || w.role}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* 最近操作记录 */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <ScrollText size={14} className="text-gray-400" />
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">最近操作记录</h3>
                    </div>
                    {detail.recent_audits.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">暂无操作记录</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {detail.recent_audits.map((a, i) => (
                          <li key={`${a.action}-${i}`} className="rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                {ACTION_LABEL[a.action] || a.action}
                              </span>
                              <span className="text-[11px] text-gray-400 tabular-nums flex-shrink-0">
                                {fmtDateTime(a.created_at)}
                              </span>
                            </div>
                            {a.details && Object.keys(a.details).length > 0 && (
                              <p className="mt-1 text-[11px] text-gray-400 break-all">
                                {Object.entries(a.details)
                                  .filter(([, v]) => v !== null && v !== undefined && v !== '')
                                  .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                                  .join(' · ')}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        </Portal>
      )}
    </div>
  );
};
