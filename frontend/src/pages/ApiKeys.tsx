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
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageTitle } from '@/hooks/usePageTitle';
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

export const ApiKeys: React.FC = () => {
  usePageTitle('API 密钥');
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
      setError(err?.response?.data?.detail || '加载 API 密钥失败');
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
      addToast('success', 'API 密钥已创建', '请妥善保存您的密钥，它只会显示一次。');
    } catch (err: any) {
      addToast('error', '创建失败', err?.response?.data?.detail || '发生错误');
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
      addToast('success', '密钥已撤销', '该 API 密钥已被撤销。');
    } catch (err: any) {
      addToast('error', '撤销失败', err?.response?.data?.detail || '发生错误');
    } finally {
      setIsRevoking(false);
      setRevokeTarget(null);
    }
  };

  const handleCopyKey = (keyText: string) => {
    navigator.clipboard.writeText(keyText);
    addToast('success', '已复制！', 'API 密钥已复制到剪贴板。');
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '从未';
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const scopeColors: Record<string, 'green' | 'blue' | 'red'> = {
    read: 'green',
    write: 'blue',
    admin: 'red',
  };

  const scopeLabels: Record<string, string> = {
    read: '读取',
    write: '写入',
    admin: '管理',
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-32 bg-gray-200 rounded shimmer" />
            <div className="h-4 w-64 bg-gray-200 rounded shimmer mt-2" />
          </div>
        </div>
        <SkeletonTable rows={4} columns={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">加载 API 密钥失败</h3>
        <p className="text-sm text-gray-500 mt-1">{error}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={fetchKeys}
        >
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">API 密钥</h2>
          <p className="mt-1 text-sm text-gray-500">
            管理用于程序化访问的 API 密钥
          </p>
        </div>
        <Button
          variant="primary"
          leftIcon={<Plus size={16} />}
          onClick={() => setShowCreateModal(true)}
        >
          创建 API 密钥
        </Button>
      </div>

      {keys.length === 0 ? (
        <EmptyState
          icon={<Key size={28} className="text-gray-500" />}
          title="暂无 API 密钥"
          description="创建您的第一个 API 密钥以开始集成 Nexora API。"
          actionLabel="创建 API 密钥"
          onAction={() => setShowCreateModal(true)}
        />
      ) : (
        <Card>
          <div className="divide-y divide-gray-100">
            {keys.map((key, idx) => {
              const scopeList = scopesObjectToArray(key.scopes);
              return (
                <div
                  key={key.id}
                  className="flex items-center justify-between py-4 px-2 first:pt-2 last:pb-2 animate-fade-in"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-50 to-indigo-50 flex items-center justify-center">
                      <Key size={18} className="text-primary-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {key.name}
                        </p>
                        {key.is_active ? (
                          <Badge variant="green">
                            <span className="flex items-center gap-1">
                              <CheckCircle size={12} />
                              活跃
                            </span>
                          </Badge>
                        ) : (
                          <Badge variant="red">
                            <span className="flex items-center gap-1">
                              <XCircle size={12} />
                              已撤销
                            </span>
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">
                        {key.key_prefix}...{key.last_4}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-1.5">
                      {scopeList.map((scope) => (
                        <Badge key={scope} variant={scopeColors[scope] || 'gray'}>
                          {scopeLabels[scope] || scope}
                        </Badge>
                      ))}
                    </div>
                    <div className="hidden md:block text-xs text-gray-500">
                      创建于 {formatDate(key.created_at)}
                    </div>
                    {key.is_active && (
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Trash2 size={14} />}
                        onClick={() => setRevokeTarget(key)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        撤销
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
        title="创建 API 密钥"
      >
        {createdRawKey ? (
          <div className="space-y-4">
            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200 flex items-start gap-3">
              <AlertTriangle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-yellow-800">
                  请立即保存此密钥
                </p>
                <p className="text-sm text-yellow-700 mt-1">
                  此密钥仅显示一次，之后将无法再次查看。
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={showKey ? createdRawKey : '•'.repeat(40)}
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
              完成
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Input
              label="密钥名称"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="生产环境密钥"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                权限范围
              </label>
              <div className="flex flex-wrap gap-2">
                {(['read', 'write', 'admin'] as ApiKeyScope[]).map((scope) => (
                  <label
                    key={scope}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 cursor-pointer hover:border-primary-300 hover:bg-primary-50/50 transition-all duration-200"
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
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      {scopeLabels[scope] || scope}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                有效期（天，可选）
              </label>
              <Input
                type="number"
                value={newKeyExpiry ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewKeyExpiry(val ? parseInt(val, 10) : null);
                }}
                placeholder="留空表示永不过期"
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
            confirmText="创建密钥"
            isLoading={isCreating}
          />
        )}
      </Modal>

      {/* Revoke Confirmation Modal */}
      <Modal
        isOpen={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title="撤销 API 密钥"
      >
        <p className="text-sm text-gray-600">
          您确定要撤销密钥{' '}
          <span className="font-semibold text-slate-900">
            {revokeTarget?.name}
          </span>
          吗？此操作不可撤销，所有使用此密钥的服务将停止工作。
        </p>
        <ModalFooter
          onCancel={() => setRevokeTarget(null)}
          onConfirm={handleRevoke}
          confirmText="撤销密钥"
          confirmVariant="danger"
          cancelText="保留"
          isLoading={isRevoking}
        />
      </Modal>
    </div>
  );
};
