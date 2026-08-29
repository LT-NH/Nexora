import React, { useState, useEffect, useCallback } from 'react';
import {
  Key,
  Plus,
  Copy,
  Trash2,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  AlertTriangle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePageT, type Lang } from '@/i18n';
import api from '@/services/api';
import type { ApiKey, ApiKeyCreatedResponse, ApiKeyScope } from '@/types';

/** Extract items from paginated response, or return data as-is if already an array.
 *  Falls back to an empty array when the response is not an array or a valid paginated object. */
function extractItems<T>(data: unknown): T {
  if (Array.isArray(data)) return data as T;
  if (data && typeof data === 'object' && 'items' in data) {
    const items = (data as { items: unknown }).items;
    return (Array.isArray(items) ? items : []) as T;
  }
  return ([] as unknown) as T;
}

/** Convert scopes object (from backend) to array of scope keys */
function scopesObjectToArray(scopes: Record<string, any>): ApiKeyScope[] {
  if (!scopes) return [];
  return Object.keys(scopes).filter((k) => scopes[k]) as ApiKeyScope[];
}

/** Convert array of scope keys to object (for sending to backend) */
function scopesArrayToObject(scopes: ApiKeyScope[]): Record<string, boolean> {
  return scopes.reduce((acc, scope) => ({ ...acc, [scope]: true }), {});
}

const D = {
  zh: {
    api_keys_page_title: 'API 密钥',
    api_keys_title: 'API 密钥',
    api_keys_subtitle: '管理用于程序化访问的 API 密钥',
    load_api_keys_failed: '加载 API 密钥失败',
    retry: '重试',
    create_api_key: '创建 API 密钥',
    no_keys_title: '暂无 API 密钥',
    no_keys_desc: '创建您的第一个 API 密钥以开始集成 Nexora API。',
    key_created: 'API 密钥已创建',
    key_created_msg: '请妥善保存您的密钥，它只会显示一次。',
    create_failed: '创建失败',
    error_occurred: '发生错误',
    key_revoked: '密钥已撤销',
    key_revoked_msg: '该 API 密钥已被撤销。',
    revoke_failed: '撤销失败',
    copied: '已复制！',
    copied_msg: 'API 密钥已复制到剪贴板。',
    never: '从未',
    scope_read: '读取',
    scope_write: '写入',
    scope_admin: '管理',
    active: '活跃',
    revoked: '已撤销',
    created_at: '创建于 {date}',
    revoke: '撤销',
    save_now_title: '请立即保存此密钥',
    save_now_desc: '此密钥仅显示一次，之后将无法再次查看。',
    done: '完成',
    key_name_label: '密钥名称',
    key_name_placeholder: '生产环境密钥',
    scopes_label: '权限范围',
    expiry_label: '有效期（天，可选）',
    expiry_placeholder: '留空表示永不过期',
    create_key: '创建密钥',
    revoke_key: '撤销密钥',
    revoke_confirm_prefix: '您确定要撤销密钥',
    revoke_confirm_suffix: '吗？此操作不可撤销，所有使用此密钥的服务将停止工作。',
    keep: '保留',
  },
  en: {
    api_keys_page_title: 'API Keys',
    api_keys_title: 'API Keys',
    api_keys_subtitle: 'Manage API keys for programmatic access',
    load_api_keys_failed: 'Failed to load API keys',
    retry: 'Retry',
    create_api_key: 'Create API Key',
    no_keys_title: 'No API Keys',
    no_keys_desc: 'Create your first API key to start integrating with the Nexora API.',
    key_created: 'API Key Created',
    key_created_msg: 'Please save your key now. It will only be shown once.',
    create_failed: 'Create Failed',
    error_occurred: 'An error occurred',
    key_revoked: 'Key Revoked',
    key_revoked_msg: 'This API key has been revoked.',
    revoke_failed: 'Revoke Failed',
    copied: 'Copied!',
    copied_msg: 'API key copied to clipboard.',
    never: 'Never',
    scope_read: 'Read',
    scope_write: 'Write',
    scope_admin: 'Admin',
    active: 'Active',
    revoked: 'Revoked',
    created_at: 'Created {date}',
    revoke: 'Revoke',
    save_now_title: 'Save this key immediately',
    save_now_desc: 'This key is shown only once and cannot be viewed again later.',
    done: 'Done',
    key_name_label: 'Key Name',
    key_name_placeholder: 'Production key',
    scopes_label: 'Permissions',
    expiry_label: 'Expiry (days, optional)',
    expiry_placeholder: 'Leave blank to never expire',
    create_key: 'Create Key',
    revoke_key: 'Revoke Key',
    revoke_confirm_prefix: 'Are you sure you want to revoke the key',
    revoke_confirm_suffix: '? This cannot be undone and all services using this key will stop working.',
    keep: 'Keep',
  },
} as Record<Lang, Record<string, string>>;

const getScopeLabels = (t: (key: string, fallback?: string) => string) => ({
  read: t('scope_read'),
  write: t('scope_write'),
  admin: t('scope_admin'),
});

export const ApiKeys: React.FC = () => {
  const t = usePageT(D);
  usePageTitle(t('api_keys_page_title'));
  const { currentWorkspace } = useWorkspace();
  const { addToast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<ApiKeyScope[]>(['read']);
  const [newKeyExpiry, setNewKeyExpiry] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const fetchKeys = useCallback(async () => {
    if (!currentWorkspace) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get(`/workspaces/${currentWorkspace.slug}/api-keys`);
      setKeys(extractItems<ApiKey[]>(response.data));
    } catch (err: any) {
      setError(err?.response?.data?.detail || t('load_api_keys_failed'));
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreate = async () => {
    if (!currentWorkspace || !newKeyName.trim()) return;
    setIsCreating(true);
    try {
      const response = await api.post<ApiKeyCreatedResponse>(
        `/workspaces/${currentWorkspace.slug}/api-keys/`,
        {
          name: newKeyName,
          scopes: scopesArrayToObject(newKeyScopes),
          expires_in_days: newKeyExpiry,
        }
      );
      const newKey = response.data.api_key;
      setKeys((prev) => [newKey, ...prev]);
      setCreatedRawKey(response.data.raw_key);
      setShowKey(true);
      addToast('success', t('key_created'), t('key_created_msg'));
    } catch (err: any) {
      addToast('error', t('create_failed'), err?.response?.data?.detail || t('error_occurred'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!currentWorkspace || !revokeTarget) return;
    setIsRevoking(true);
    try {
      await api.delete(`/workspaces/${currentWorkspace.slug}/api-keys/${revokeTarget.id}`);
      setKeys((prev) =>
        prev.map((k) =>
          k.id === revokeTarget.id ? { ...k, is_active: false } : k
        )
      );
      addToast('success', t('key_revoked'), t('key_revoked_msg'));
    } catch (err: any) {
      addToast('error', t('revoke_failed'), err?.response?.data?.detail || t('error_occurred'));
    } finally {
      setIsRevoking(false);
      setRevokeTarget(null);
    }
  };

  const handleCopyKey = (keyText: string) => {
    navigator.clipboard.writeText(keyText);
    addToast('success', t('copied'), t('copied_msg'));
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return t('never');
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const scopeColors: Record<string, 'success' | 'primary' | 'danger'> = {
    read: 'success',
    write: 'primary',
    admin: 'danger',
  };

  const scopeLabels = getScopeLabels(t);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded shimmer" />
            <div className="h-4 w-64 bg-gray-200 dark:bg-gray-700 rounded shimmer mt-2" />
          </div>
        </div>
        <SkeletonTable rows={4} columns={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-red-500 dark:text-red-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">{t('load_api_keys_failed')}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{error}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={fetchKeys}
        >
          {t('retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('api_keys_title')}
        subtitle={t('api_keys_subtitle')}
        actions={
          <Button
            variant="primary"
            leftIcon={<Plus size={16} />}
            onClick={() => setShowCreateModal(true)}
          >
            {t('create_api_key')}
          </Button>
        }
      />

      {keys.length === 0 ? (
        <EmptyState
          icon={<Key size={28} className="text-gray-500 dark:text-gray-400" />}
          title={t('no_keys_title')}
          description={t('no_keys_desc')}
          actionLabel={t('create_api_key')}
          onAction={() => setShowCreateModal(true)}
        />
      ) : (
        <Card>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {keys.map((key, idx) => {
              const scopeList = scopesObjectToArray(key.scopes);
              return (
                <div
                  key={key.id}
                  className="flex items-center justify-between py-4 px-2 first:pt-2 last:pb-2 animate-fade-in"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-50 to-purple-50 flex items-center justify-center">
                      <Key size={18} className="text-primary-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">
                          {key.name}
                        </p>
                        {key.is_active ? (
                          <Badge variant="success">
                            <span className="flex items-center gap-1">
                              <CheckCircle size={12} />
                              {t('active')}
                            </span>
                          </Badge>
                        ) : (
                          <Badge variant="danger">
                            <span className="flex items-center gap-1">
                              <XCircle size={12} />
                              {t('revoked')}
                            </span>
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">
                        {key.key_prefix}...{key.last_4}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-1.5">
                      {scopeList.map((scope) => (
                        <Badge key={scope} variant={scopeColors[scope] || 'neutral'}>
                          {scopeLabels[scope] || scope}
                        </Badge>
                      ))}
                    </div>
                    <div className="hidden md:block text-xs text-gray-500 dark:text-gray-400">
                      {t('created_at').replace('{date}', formatDate(key.created_at))}
                    </div>
                    {key.is_active && (
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Trash2 size={14} />}
                        onClick={() => setRevokeTarget(key)}
                        className="text-red-600 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        {t('revoke')}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Create Key Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setNewKeyName('');
          setNewKeyScopes(['read']);
          setNewKeyExpiry(null);
          setCreatedRawKey(null);
          setShowKey(false);
        }}
        title={t('create_api_key')}
      >
        {createdRawKey ? (
          <div className="space-y-4">
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 flex items-start gap-3">
              <AlertTriangle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">
                  {t('save_now_title')}
                </p>
                <p className="text-sm text-yellow-700 mt-1">
                  {t('save_now_desc')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={showKey ? createdRawKey : '?'.repeat(40)}
                readOnly
                className="font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyKey(createdRawKey)}
              >
                <Copy size={16} />
              </Button>
            </div>
            <Button
              variant="primary"
              className="w-full"
              onClick={() => {
                setShowCreateModal(false);
                setNewKeyName('');
                setNewKeyScopes(['read']);
                setNewKeyExpiry(null);
                setCreatedRawKey(null);
                setShowKey(false);
              }}
            >
              {t('done')}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Input
              label={t('key_name_label')}
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder={t('key_name_placeholder')}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('scopes_label')}
              </label>
              <div className="flex flex-wrap gap-2">
                {(['read', 'write', 'admin'] as ApiKeyScope[]).map((scope) => (
                  <label
                    key={scope}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer hover:border-primary-300 hover:bg-primary-50/50 transition-all duration-200"
                  >
                    <input
                      type="checkbox"
                      checked={newKeyScopes.includes(scope)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewKeyScopes([...newKeyScopes, scope]);
                        } else {
                          setNewKeyScopes(newKeyScopes.filter((s) => s !== scope));
                        }
                      }}
                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {scopeLabels[scope] || scope}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('expiry_label')}
              </label>
              <Input
                type="number"
                value={newKeyExpiry ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewKeyExpiry(val ? parseInt(val, 10) : null);
                }}
                placeholder={t('expiry_placeholder')}
                min={1}
                max={3650}
              />
            </div>
          </div>
        )}
        {!createdRawKey && (
          <ModalFooter
            onCancel={() => {
              setShowCreateModal(false);
              setNewKeyName('');
              setNewKeyScopes(['read']);
              setNewKeyExpiry(null);
            }}
            onConfirm={handleCreate}
            confirmText={t('create_key')}
            isLoading={isCreating}
          />
        )}
      </Modal>

      {/* Revoke Confirmation Modal */}
      <Modal
        isOpen={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title={t('revoke_key')}
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t('revoke_confirm_prefix')}{' '}
          <span className="font-semibold text-slate-900 dark:text-gray-100">
            {revokeTarget?.name}
          </span>{' '}
          {t('revoke_confirm_suffix')}
        </p>
        <ModalFooter
          onCancel={() => setRevokeTarget(null)}
          onConfirm={handleRevoke}
          confirmText={t('revoke_key')}
          confirmVariant="danger"
          cancelText={t('keep')}
          isLoading={isRevoking}
        />
      </Modal>
    </div>
  );
};
