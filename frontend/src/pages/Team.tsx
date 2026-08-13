import React, { useState, useEffect, useCallback } from 'react';
import {
  UserPlus,
  MoreHorizontal,
  Trash2,
  Shield,
  User,
  Users as UsersIcon,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePageT, type Lang } from '@/i18n';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { Dropdown } from '@/components/ui/Dropdown';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useFormErrors } from '@/hooks/useForm';
import { workspaceService } from '@/services/workspace';
import type { WorkspaceMember, WorkspaceRole } from '@/types';

const roleBadgeVariant: Record<WorkspaceRole, 'success' | 'primary' | 'neutral' | 'warning'> = {
  owner: 'success',
  admin: 'primary',
  member: 'neutral',
  viewer: 'warning',
};

const roleIcon: Record<WorkspaceRole, React.ReactNode> = {
  owner: <Shield size={14} />,
  admin: <Shield size={14} />,
  member: <User size={14} />,
  viewer: <Eye size={14} />,
};

const D = {
  zh: {
    team_page_title: '团队管理',
    team_title: '团队成员',
    team_subtitle: '管理 {name} 中的成员及其角色',
    invite_member: '邀请成员',
    load_failed: '加载失败',
    load_members_failed: '无法加载团队成员。',
    retry: '重试',
    no_members_title: '暂无团队成员',
    no_members_desc: '邀请团队成员加入此工作空间进行协作。',
    role_owner: '拥有者',
    role_admin: '管理员',
    role_member: '成员',
    role_viewer: '查看者',
    role_change_admin: '更改为管理员',
    role_change_member: '更改为成员',
    role_change_viewer: '更改为查看者',
    remove: '移除',
    unnamed_user: '未命名用户',
    invite_modal_title: '邀请团队成员',
    email_label: '邮箱地址',
    invite_email_required: '请填写被邀请人的邮箱地址',
    invite_email_invalid: '请输入有效的邮箱地址',
    role_label: '角色',
    send_invite: '发送邀请',
    member_invited: '成员已邀请',
    invited_msg: '{email} 已收到邀请。',
    invite_failed: '邀请失败',
    error_occurred: '发生错误',
    remove_member: '移除成员',
    remove_confirm: '您确定要移除',
    remove_confirm_suffix: '吗？他们将失去对此工作空间的所有访问权限。',
    member_removed: '成员已移除',
    removed_msg: '{name} 已被移除。',
    remove_failed: '移除失败',
    role_updated: '角色已更新',
    role_updated_msg: '{name} 现在是 {role}。',
    update_failed: '更新失败',
    keep: '保留',
  },
  en: {
    team_page_title: 'Team Management',
    team_title: 'Team Members',
    team_subtitle: 'Manage members and their roles in {name}',
    invite_member: 'Invite Member',
    load_failed: 'Load Failed',
    load_members_failed: 'Unable to load team members.',
    retry: 'Retry',
    no_members_title: 'No Team Members',
    no_members_desc: 'Invite members to this workspace to collaborate.',
    role_owner: 'Owner',
    role_admin: 'Admin',
    role_member: 'Member',
    role_viewer: 'Viewer',
    role_change_admin: 'Change to Admin',
    role_change_member: 'Change to Member',
    role_change_viewer: 'Change to Viewer',
    remove: 'Remove',
    unnamed_user: 'Unnamed User',
    invite_modal_title: 'Invite Team Member',
    email_label: 'Email Address',
    invite_email_required: 'Please enter the invitee email address',
    invite_email_invalid: 'Please enter a valid email address',
    role_label: 'Role',
    send_invite: 'Send Invite',
    member_invited: 'Member Invited',
    invited_msg: '{email} has been invited.',
    invite_failed: 'Invite Failed',
    error_occurred: 'An error occurred',
    remove_member: 'Remove Member',
    remove_confirm: 'Are you sure you want to remove',
    remove_confirm_suffix: '? They will lose all access to this workspace.',
    member_removed: 'Member Removed',
    removed_msg: '{name} has been removed.',
    remove_failed: 'Remove Failed',
    role_updated: 'Role Updated',
    role_updated_msg: '{name} is now {role}.',
    update_failed: 'Update Failed',
    keep: 'Keep',
  },
} as Record<Lang, Record<string, string>>;

const getRoleLabel = (t: (key: string, fallback?: string) => string) => ({
  owner: t('role_owner'),
  admin: t('role_admin'),
  member: t('role_member'),
  viewer: t('role_viewer'),
});

export const Team: React.FC = () => {
  const t = usePageT(D);
  usePageTitle(t('team_page_title'));
  const { currentWorkspace } = useWorkspace();
  const { addToast } = useToast();
  const { errors, setFieldError, clearErrors } = useFormErrors();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('member');
  const [isInviting, setIsInviting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<WorkspaceMember | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!currentWorkspace) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await workspaceService.getMembers(currentWorkspace.slug);
      setMembers(data);
    } catch {
      setError(t('load_members_failed'));
      addToast('error', t('load_failed'), t('load_members_failed'));
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace, addToast]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleInvite = async () => {
    if (!currentWorkspace) return;
    clearErrors();
    let hasError = false;
    if (!inviteEmail.trim()) {
      setFieldError('email', t('invite_email_required'));
      hasError = true;
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(inviteEmail.trim())) {
        setFieldError('email', t('invite_email_invalid'));
        hasError = true;
      }
    }
    if (hasError) return;
    setIsInviting(true);
    try {
      const newMember = await workspaceService.inviteMember(currentWorkspace.slug, {
        email: inviteEmail,
        role: inviteRole,
      });
      setMembers((prev) => [...prev, newMember]);
      addToast('success', t('member_invited'), t('invited_msg').replace('{email}', inviteEmail));
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteRole('member');
    } catch (err: any) {
      addToast('error', t('invite_failed'), err?.response?.data?.detail || t('error_occurred'));
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemove = async () => {
    if (!currentWorkspace || !removeTarget) return;
    try {
      await workspaceService.removeMember(currentWorkspace.slug, removeTarget.user_id);
      setMembers((prev) => prev.filter((m) => m.id !== removeTarget.id));
      addToast(
        'success',
        t('member_removed'),
        t('removed_msg').replace('{name}', String(removeTarget.full_name || removeTarget.email))
      );
    } catch (err: any) {
      addToast('error', t('remove_failed'), err?.response?.data?.detail || t('error_occurred'));
    } finally {
      setRemoveTarget(null);
    }
  };

  const handleChangeRole = async (member: WorkspaceMember, newRole: WorkspaceRole) => {
    if (!currentWorkspace) return;
    try {
      const updated = await workspaceService.changeRole(
        currentWorkspace.slug,
        member.user_id,
        newRole
      );
      setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      addToast(
        'success',
        t('role_updated'),
        t('role_updated_msg')
          .replace('{name}', String(member.full_name || member.email))
          .replace('{role}', getRoleLabel(t)[newRole])
      );
    } catch (err: any) {
      addToast('error', t('update_failed'), err?.response?.data?.detail || t('error_occurred'));
    }
  };

  if (isLoading) {
    return <Spinner size="lg" className="min-h-[400px]" />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-red-500 dark:text-red-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">{t('load_failed')}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{error}</p>
        <Button variant="outline" className="mt-4" onClick={fetchMembers}>{t('retry')}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-gray-100">{t('team_title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('team_subtitle').replace('{name}', currentWorkspace?.name || '')}
          </p>
        </div>
        <Button
          variant="primary"
          leftIcon={<UserPlus size={16} />}
          onClick={() => setShowInviteModal(true)}
        >
          {t('invite_member')}
        </Button>
      </div>

      <Card>
        {members.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
              <UsersIcon size={28} className="text-gray-500 dark:text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">{t('no_members_title')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
              {t('no_members_desc')}
            </p>
            <Button
              variant="primary"
              className="mt-4"
              leftIcon={<UserPlus size={16} />}
              onClick={() => setShowInviteModal(true)}
            >
              {t('invite_member')}
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {members.map((member, idx) => {
              const displayName = member.full_name || t('unnamed_user');
              const displayEmail = member.email || '';
              const dropdownItems = [
                {
                  label: t('role_change_admin'),
                  value: 'admin',
                  icon: <Shield size={14} />,
                  onClick: () => handleChangeRole(member, 'admin'),
                },
                {
                  label: t('role_change_member'),
                  value: 'member',
                  icon: <User size={14} />,
                  onClick: () => handleChangeRole(member, 'member'),
                },
                {
                  label: t('role_change_viewer'),
                  value: 'viewer',
                  icon: <Eye size={14} />,
                  onClick: () => handleChangeRole(member, 'viewer'),
                },
                {
                  label: t('remove'),
                  value: 'remove',
                  icon: <Trash2 size={14} />,
                  danger: true,
                  onClick: () => setRemoveTarget(member),
                },
              ];

              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between py-4 px-2 first:pt-2 last:pb-2 animate-fade-in"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  <div className="flex items-center gap-4">
                    <Avatar
                      name={displayName}
                      src={member.avatar_url || undefined}
                      size="md"
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">
                        {displayName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{displayEmail}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={roleBadgeVariant[member.role]}>
                      <span className="flex items-center gap-1">
                        {roleIcon[member.role]}
                        {getRoleLabel(t)[member.role]}
                      </span>
                    </Badge>
                    {member.role !== 'owner' && (
                      <Dropdown
                        trigger={
                          <button className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-400 transition-colors">
                            <MoreHorizontal size={16} />
                          </button>
                        }
                        items={dropdownItems}
                        align="right"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Invite Modal */}
      <Modal
        isOpen={showInviteModal}
        onClose={() => {
          setShowInviteModal(false);
          setInviteEmail('');
          clearErrors();
        }}
        title={t('invite_modal_title')}
      >
        <div className="space-y-4">
          <Input
            label={t('email_label')}
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="colleague@example.com"
            error={errors.email}
          />
          <div>
            <label htmlFor="invite-role" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('role_label')}
            </label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 transition-colors duration-200"
            >
              <option value="admin">{getRoleLabel(t).admin}</option>
              <option value="member">{getRoleLabel(t).member}</option>
              <option value="viewer">{getRoleLabel(t).viewer}</option>
            </select>
          </div>
        </div>
        <ModalFooter
          onCancel={() => {
            setShowInviteModal(false);
            setInviteEmail('');
          }}
          onConfirm={handleInvite}
          confirmText={t('send_invite')}
          isLoading={isInviting}
        />
      </Modal>

      {/* Remove Confirmation Modal */}
      <Modal
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title={t('remove_member')}
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t('remove_confirm')}{' '}
          <span className="font-semibold text-slate-900 dark:text-gray-100">
            {removeTarget?.full_name || removeTarget?.email}
          </span>{' '}
          {t('remove_confirm_suffix')}
        </p>
        <ModalFooter
          onCancel={() => setRemoveTarget(null)}
          onConfirm={handleRemove}
          confirmText={t('remove_member')}
          confirmVariant="danger"
          cancelText={t('keep')}
        />
      </Modal>
    </div>
  );
};
