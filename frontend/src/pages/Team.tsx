import React, { useState, useEffect, useCallback } from 'react';
import {
  UserPlus,
  MoreHorizontal,
  Trash2,
  Shield,
  User,
  Users as UsersIcon,
  Eye,
} from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageTitle } from '@/hooks/usePageTitle';
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

const roleBadgeVariant: Record<WorkspaceRole, 'green' | 'blue' | 'gray' | 'yellow'> = {
  owner: 'green',
  admin: 'blue',
  member: 'gray',
  viewer: 'yellow',
};

const roleIcon: Record<WorkspaceRole, React.ReactNode> = {
  owner: <Shield size={14} />,
  admin: <Shield size={14} />,
  member: <User size={14} />,
  viewer: <Eye size={14} />,
};

const roleLabel: Record<WorkspaceRole, string> = {
  owner: '拥有者',
  admin: '管理员',
  member: '成员',
  viewer: '查看者',
};

export const Team: React.FC = () => {
  usePageTitle('团队管理');
  const { currentWorkspace } = useWorkspace();
  const { addToast } = useToast();
  const { errors, setFieldError, clearErrors } = useFormErrors();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
    try {
      const data = await workspaceService.getMembers(currentWorkspace.slug);
      setMembers(data);
    } catch {
      addToast('error', '加载失败', '无法加载团队成员。');
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
      setFieldError('email', '请填写被邀请人的邮箱地址');
      hasError = true;
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(inviteEmail.trim())) {
        setFieldError('email', '请输入有效的邮箱地址');
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
      addToast('success', '成员已邀请', `${inviteEmail} 已收到邀请。`);
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteRole('member');
    } catch (err: any) {
      addToast('error', '邀请失败', err?.response?.data?.detail || '发生错误');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemove = async () => {
    if (!currentWorkspace || !removeTarget) return;
    try {
      await workspaceService.removeMember(currentWorkspace.slug, removeTarget.user_id);
      setMembers((prev) => prev.filter((m) => m.id !== removeTarget.id));
      addToast('success', '成员已移除', `${removeTarget.full_name || removeTarget.email} 已被移除。`);
    } catch (err: any) {
      addToast('error', '移除失败', err?.response?.data?.detail || '发生错误');
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
      addToast('success', '角色已更新', `${member.full_name || member.email} 现在是 ${roleLabel[newRole]}。`);
    } catch (err: any) {
      addToast('error', '更新失败', err?.response?.data?.detail || '发生错误');
    }
  };

  if (isLoading) {
    return <Spinner size="lg" className="min-h-[400px]" />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">团队成员</h2>
          <p className="mt-1 text-sm text-gray-500">
            管理 {currentWorkspace?.name} 中的成员及其角色
          </p>
        </div>
        <Button
          variant="primary"
          leftIcon={<UserPlus size={16} />}
          onClick={() => setShowInviteModal(true)}
        >
          邀请成员
        </Button>
      </div>

      <Card>
        {members.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <UsersIcon size={28} className="text-gray-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">暂无团队成员</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-sm">
              邀请团队成员加入此工作空间进行协作。
            </p>
            <Button
              variant="primary"
              className="mt-4"
              leftIcon={<UserPlus size={16} />}
              onClick={() => setShowInviteModal(true)}
            >
              邀请成员
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {members.map((member, idx) => {
              const displayName = member.full_name || '未命名用户';
              const displayEmail = member.email || '';
              const dropdownItems = [
                {
                  label: '更改为管理员',
                  value: 'admin',
                  icon: <Shield size={14} />,
                  onClick: () => handleChangeRole(member, 'admin'),
                },
                {
                  label: '更改为成员',
                  value: 'member',
                  icon: <User size={14} />,
                  onClick: () => handleChangeRole(member, 'member'),
                },
                {
                  label: '更改为查看者',
                  value: 'viewer',
                  icon: <Eye size={14} />,
                  onClick: () => handleChangeRole(member, 'viewer'),
                },
                {
                  label: '移除',
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
                      <p className="text-sm font-semibold text-slate-900">
                        {displayName}
                      </p>
                      <p className="text-xs text-gray-500">{displayEmail}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={roleBadgeVariant[member.role]}>
                      <span className="flex items-center gap-1">
                        {roleIcon[member.role]}
                        {roleLabel[member.role]}
                      </span>
                    </Badge>
                    {member.role !== 'owner' && (
                      <Dropdown
                        trigger={
                          <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-600 transition-colors">
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
        title="邀请团队成员"
      >
        <div className="space-y-4">
          <Input
            label="邮箱地址"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="colleague@example.com"
            error={errors.email}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              角色
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 transition-colors duration-200"
            >
              <option value="admin">管理员</option>
              <option value="member">成员</option>
              <option value="viewer">查看者</option>
            </select>
          </div>
        </div>
        <ModalFooter
          onCancel={() => {
            setShowInviteModal(false);
            setInviteEmail('');
          }}
          onConfirm={handleInvite}
          confirmText="发送邀请"
          isLoading={isInviting}
        />
      </Modal>

      {/* Remove Confirmation Modal */}
      <Modal
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title="移除成员"
      >
        <p className="text-sm text-gray-600">
          您确定要移除{' '}
          <span className="font-semibold text-slate-900">
            {removeTarget?.full_name || removeTarget?.email}
          </span>{' '}
          吗？他们将失去对此工作空间的所有访问权限。
        </p>
        <ModalFooter
          onCancel={() => setRemoveTarget(null)}
          onConfirm={handleRemove}
          confirmText="移除成员"
          confirmVariant="danger"
          cancelText="保留"
        />
      </Modal>
    </div>
  );
};
