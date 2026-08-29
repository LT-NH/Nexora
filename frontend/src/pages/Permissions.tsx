import React, { useEffect, useState, useCallback } from 'react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/components/ui/Toast';
import { usePageT, type Lang } from '@/i18n';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import api from '@/services/api';
import { Shield, Plus, Trash2, Users, X, AlertTriangle } from 'lucide-react';

interface PermissionGroup {
  id: string;
  name: string;
  member_count: number;
}

interface PermissionOverride {
  user_id: string;
  email: string;
  full_name: string;
  group_name: string | null;
  can_view_revenue: boolean;
  can_edit_products: boolean;
  can_delete_products: boolean;
  can_manage_orders: boolean;
  can_view_customers: boolean;
  can_manage_coupons: boolean;
  can_manage_members: boolean;
  can_manage_settings: boolean;
}

interface MemberInfo {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
}

const D = {
  zh: {
    permissions_page_title: '权限管理',
    perm_view_revenue: '查看营收',
    perm_edit_products: '编辑商品',
    perm_delete_products: '删除商品',
    perm_manage_orders: '订单管理',
    perm_view_customers: '客户查看',
    perm_manage_coupons: '优惠券管理',
    perm_manage_members: '成员管理',
    perm_manage_settings: '设置管理',
    load_failed: '加载失败',
    retry_later: '请稍后重试',
    group_created: '权限组已创建',
    create_failed: '创建失败',
    group_deleted: '权限组已删除',
    delete_failed: '删除失败',
    member_added: '成员已添加',
    add_failed: '添加失败',
    permission_updated: '权限已更新',
    update_failed: '更新失败',
    permission_reset: '权限已重置',
    remove_failed: '移除失败',
    delete_group: '删除权限组',
    delete_group_msg: '确定要删除权限组「{name}」吗？',
    remove_override: '移除自定义权限',
    remove_override_msg: '确定要移除该用户的自定义权限覆盖吗？用户将恢复为角色默认权限。',
    role_owner: '拥有者',
    role_admin: '管理员',
    role_member: '成员',
    role_viewer: '观察者',
    loading: '加载中...',
    permissions_title: '权限管理',
    permissions_subtitle: '管理精细粒度的 RBAC 权限',
    new_group: '新建权限组',
    permission_groups: '权限组',
    permission_groups_subtitle: '将成员归入不同权限组以批量管理权限',
    no_groups: '暂无权限组',
    create_first_group: '创建第一个权限组',
    members_count: '{count} 位成员',
    member_permissions: '成员权限',
    member_permissions_subtitle: '为每个成员设置精细权限或加入权限组',
    col_member: '成员',
    col_role: '角色',
    col_group: '权限组',
    col_actions: '操作',
    allowed: '允许',
    no_members: '暂无成员',
    group_name: '权限组名称',
    group_name_placeholder: '如：客服组、仓库管理',
    create: '创建',
    add_member: '添加成员',
    add: '添加',
    no_available_members: '暂无可用成员',
    confirm: '确认',
  },
  en: {
    permissions_page_title: 'Permissions',
    perm_view_revenue: 'View Revenue',
    perm_edit_products: 'Edit Products',
    perm_delete_products: 'Delete Products',
    perm_manage_orders: 'Manage Orders',
    perm_view_customers: 'View Customers',
    perm_manage_coupons: 'Manage Coupons',
    perm_manage_members: 'Manage Members',
    perm_manage_settings: 'Manage Settings',
    load_failed: 'Load Failed',
    retry_later: 'Please try again later',
    group_created: 'Permission group created',
    create_failed: 'Create Failed',
    group_deleted: 'Permission group deleted',
    delete_failed: 'Delete Failed',
    member_added: 'Member added',
    add_failed: 'Add Failed',
    permission_updated: 'Permission updated',
    update_failed: 'Update Failed',
    permission_reset: 'Permission reset',
    remove_failed: 'Remove Failed',
    delete_group: 'Delete Permission Group',
    delete_group_msg: 'Are you sure you want to delete the permission group "{name}"?',
    remove_override: 'Remove Custom Permissions',
    remove_override_msg: 'Are you sure you want to remove this user\'s custom permission overrides? The user will revert to role default permissions.',
    role_owner: 'Owner',
    role_admin: 'Admin',
    role_member: 'Member',
    role_viewer: 'Viewer',
    loading: 'Loading...',
    permissions_title: 'Permissions',
    permissions_subtitle: 'Manage fine-grained RBAC permissions',
    new_group: 'New Group',
    permission_groups: 'Permission Groups',
    permission_groups_subtitle: 'Organize members into groups to manage permissions in bulk',
    no_groups: 'No permission groups',
    create_first_group: 'Create your first group',
    members_count: '{count} members',
    member_permissions: 'Member Permissions',
    member_permissions_subtitle: 'Set fine-grained permissions for each member or assign to a group',
    col_member: 'Member',
    col_role: 'Role',
    col_group: 'Group',
    col_actions: 'Actions',
    allowed: 'Allowed',
    no_members: 'No members',
    group_name: 'Group Name',
    group_name_placeholder: 'e.g. Support, Warehouse',
    create: 'Create',
    add_member: 'Add Member',
    add: 'Add',
    no_available_members: 'No available members',
    confirm: 'Confirm',
  },
} as Record<Lang, Record<string, string>>;

const getPermissionLabels = (t: (key: string, fallback?: string) => string): Record<string, string> => ({
  can_view_revenue: t('perm_view_revenue'),
  can_edit_products: t('perm_edit_products'),
  can_delete_products: t('perm_delete_products'),
  can_manage_orders: t('perm_manage_orders'),
  can_view_customers: t('perm_view_customers'),
  can_manage_coupons: t('perm_manage_coupons'),
  can_manage_members: t('perm_manage_members'),
  can_manage_settings: t('perm_manage_settings'),
});

export const Permissions: React.FC = () => {
  const t = usePageT(D);
  usePageTitle(t('permissions_page_title'));
  const { currentWorkspace } = useWorkspace();
  const { addToast } = useToast();

  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [overrides, setOverrides] = useState<PermissionOverride[]>([]);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Group form
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupSubmitting, setGroupSubmitting] = useState(false);

  // Member assignment
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [memberSubmitting, setMemberSubmitting] = useState(false);

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isLoading?: boolean;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const fetchPermissions = useCallback(async () => {
    if (!currentWorkspace) return;
    setIsLoading(true);
    try {
      const resp = await api.get(`/workspaces/${currentWorkspace.slug}/permissions`);
      setGroups(resp.data.groups || []);
      setOverrides(resp.data.overrides || []);
      setMembers(resp.data.members || []);
    } catch (err: any) {
      addToast('error', t('load_failed'), err?.response?.data?.detail || t('retry_later'));
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace, addToast]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const handleCreateGroup = async () => {
    if (!currentWorkspace || !groupName.trim()) return;
    setGroupSubmitting(true);
    try {
      await api.post(`/workspaces/${currentWorkspace.slug}/permissions`, {
        type: 'group',
        name: groupName.trim(),
      });
      addToast('success', t('group_created'));
      setShowGroupModal(false);
      setGroupName('');
      fetchPermissions();
    } catch (err: any) {
      addToast('error', t('create_failed'), err?.response?.data?.detail || '');
    } finally {
      setGroupSubmitting(false);
    }
  };

  const handleDeleteGroup = (group: PermissionGroup) => {
    setConfirmModal({
      isOpen: true,
      title: t('delete_group'),
      message: t('delete_group_msg').replace('{name}', group.name),
      onConfirm: async () => {
        if (!currentWorkspace) return;
        try {
          await api.delete(`/workspaces/${currentWorkspace.slug}/permissions/groups/${group.id}`);
          addToast('success', t('group_deleted'));
          fetchPermissions();
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err: any) {
          addToast('error', t('delete_failed'), err?.response?.data?.detail || '');
        }
      },
    });
  };

  const handleAddMemberToGroup = async (userId: string) => {
    if (!currentWorkspace || !selectedGroupId) return;
    setMemberSubmitting(true);
    try {
      await api.post(`/workspaces/${currentWorkspace.slug}/permissions/groups/${selectedGroupId}/members`, {
        user_id: userId,
      });
      addToast('success', t('member_added'));
      fetchPermissions();
    } catch (err: any) {
      addToast('error', t('add_failed'), err?.response?.data?.detail || '');
    } finally {
      setMemberSubmitting(false);
    }
  };

  const handleTogglePermission = async (userId: string, key: string, currentValue: boolean) => {
    if (!currentWorkspace) return;
    try {
      await api.patch(`/workspaces/${currentWorkspace.slug}/permissions/${userId}`, {
        [key]: !currentValue,
      });
      addToast('success', t('permission_updated'));
      fetchPermissions();
    } catch (err: any) {
      addToast('error', t('update_failed'), err?.response?.data?.detail || '');
    }
  };

  const handleRemoveOverride = (userId: string) => {
    setConfirmModal({
      isOpen: true,
      title: t('remove_override'),
      message: t('remove_override_msg'),
      onConfirm: async () => {
        if (!currentWorkspace) return;
        try {
          await api.delete(`/workspaces/${currentWorkspace.slug}/permissions/${userId}`);
          addToast('success', t('permission_reset'));
          fetchPermissions();
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err: any) {
          addToast('error', t('remove_failed'), err?.response?.data?.detail || '');
        }
      },
    });
  };

  const getOverrideForUser = (userId: string): PermissionOverride | undefined => {
    return overrides.find(o => o.user_id === userId);
  };

  const roleBadge = (role: string) => {
    const map: Record<string, { label: string; variant: 'success' | 'primary' | 'warning' | 'neutral' }> = {
      owner: { label: t('role_owner'), variant: 'success' },
      admin: { label: t('role_admin'), variant: 'primary' },
      member: { label: t('role_member'), variant: 'warning' },
      viewer: { label: t('role_viewer'), variant: 'neutral' },
    };
    const info = map[role] || { label: role, variant: 'neutral' as const };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  const PERMISSION_LABELS = getPermissionLabels(t);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-500">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('permissions_title')}
        subtitle={t('permissions_subtitle')}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setGroupName(''); setShowGroupModal(true); }}
            leftIcon={<Plus size={16} />}
          >
            {t('new_group')}
          </Button>
        }
      />

      {/* Permission Groups */}
      <Card title={t('permission_groups')} subtitle={t('permission_groups_subtitle')} padding>
        {groups.length === 0 ? (
          <div className="text-center py-8">
            <Shield size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{t('no_groups')}</p>
            <Button variant="outline" size="sm" onClick={() => setShowGroupModal(true)} leftIcon={<Plus size={14} />}>
              {t('create_first_group')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {groups.map(g => (
              <div key={g.id} className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-gray-500" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-gray-100">{g.name}</p>
                    <p className="text-xs text-gray-500">{t('members_count').replace('{count}', String(g.member_count))}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setSelectedGroupId(g.id); setShowMemberModal(true); }}
                  >
                    <Plus size={14} className="text-gray-500" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteGroup(g)}
                  >
                    <Trash2 size={14} className="text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Member Permission Table */}
      <Card title={t('member_permissions')} subtitle={t('member_permissions_subtitle')} padding>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-3 font-medium text-gray-600">{t('col_member')}</th>
                <th className="text-left py-3 px-3 font-medium text-gray-600">{t('col_role')}</th>
                <th className="text-left py-3 px-3 font-medium text-gray-600">{t('col_group')}</th>
                {Object.keys(PERMISSION_LABELS).map(key => (
                  <th key={key} className="text-center py-3 px-2 font-medium text-gray-600 text-xs whitespace-nowrap">
                    {PERMISSION_LABELS[key]}
                  </th>
                ))}
                <th className="text-left py-3 px-3 font-medium text-gray-600">{t('col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => {
                const override = getOverrideForUser(m.user_id);
                const isOwnerOrAdmin = m.role === 'owner' || m.role === 'admin';
                const permKeys = Object.keys(PERMISSION_LABELS);
                return (
                  <tr key={m.user_id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td className="py-3 px-3">
                      <p className="text-sm font-medium text-slate-900 dark:text-gray-100">{m.full_name}</p>
                      <p className="text-xs text-gray-500">{m.email}</p>
                    </td>
                    <td className="py-3 px-3">{roleBadge(m.role)}</td>
                    <td className="py-3 px-3">
                      <span className="text-xs text-gray-500">{override?.group_name || '-'}</span>
                    </td>
                    {permKeys.map(key => {
                      if (isOwnerOrAdmin) {
                        return (
                          <td key={key} className="text-center py-3 px-2">
                            <Badge variant="success">{t('allowed')}</Badge>
                          </td>
                        );
                      }
                      const hasOverride = override && override[key as keyof PermissionOverride] !== undefined;
                      const value = hasOverride ? override![key as keyof PermissionOverride] as boolean : false;
                      return (
                        <td key={key} className="text-center py-3 px-2">
                          <button
                            onClick={() => handleTogglePermission(m.user_id, key, Boolean(value))}
                            className={`inline-block w-10 h-6 rounded-full transition-colors relative cursor-pointer ${
                              value ? 'bg-green-500' : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`inline-block w-4 h-4 rounded-full bg-white shadow absolute top-1 transition-transform ${
                                value ? 'left-5' : 'left-1'
                              }`}
                            />
                          </button>
                        </td>
                      );
                    })}
                    <td className="py-3 px-3">
                      {!isOwnerOrAdmin && override && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveOverride(m.user_id)}
                        >
                          <X size={14} className="text-red-500" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                    {t('no_members')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* New Group Modal */}
      <Modal
        isOpen={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        title={t('new_group')}
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label={t('group_name')}
            placeholder={t('group_name_placeholder')}
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
          />
          <ModalFooter
            onCancel={() => setShowGroupModal(false)}
            onConfirm={handleCreateGroup}
            confirmText={t('create')}
            isLoading={groupSubmitting}
          />
        </div>
      </Modal>

      {/* Add Member to Group Modal */}
      <Modal
        isOpen={showMemberModal}
        onClose={() => setShowMemberModal(false)}
        title={t('add_member')}
        size="md"
      >
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {members.map(m => (
            <div key={m.user_id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-gray-100">{m.full_name}</p>
                <p className="text-xs text-gray-500">{m.email}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAddMemberToGroup(m.user_id)}
              >
                <Plus size={14} className="mr-1" /> {t('add')}
              </Button>
            </div>
          ))}
          {members.length === 0 && (
            <p className="text-center text-gray-500 dark:text-gray-400 text-sm py-4">{t('no_available_members')}</p>
          )}
        </div>
      </Modal>

      {/* Confirm Modal */}
      <Modal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        title={confirmModal.title}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
            <p className="text-sm text-gray-600 pt-1.5">{confirmModal.message}</p>
          </div>
          <ModalFooter
            onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
            onConfirm={confirmModal.onConfirm}
            confirmText={t('confirm')}
            isLoading={confirmModal.isLoading}
            confirmVariant="danger"
          />
        </div>
      </Modal>
    </div>
  );
};
