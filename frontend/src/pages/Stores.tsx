import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Store as StoreIcon,
  ShoppingBag,
  RefreshCw,
  Trash2,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  XCircle,
  PlugZap,
} from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/components/ui/Toast';
import { useFormErrors } from '@/hooks/useForm';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { storeService } from '@/services/ecommerce';
import type { Store, StorePlatform, StoreStatus } from '@/types/ecommerce';

const platformConfig: Record<StorePlatform, { label: string; color: string; bg: string }> = {
  taobao: { label: '淘宝', color: 'text-orange-600', bg: 'bg-orange-50' },
  jd: { label: '京东', color: 'text-red-600', bg: 'bg-red-50' },
  pdd: { label: '拼多多', color: 'text-red-500', bg: 'bg-red-50' },
  douyin: { label: '抖音', color: 'text-gray-800', bg: 'bg-gray-50' },
  shopify: { label: 'Shopify', color: 'text-green-700', bg: 'bg-green-50' },
  amazon: { label: 'Amazon', color: 'text-amber-600', bg: 'bg-amber-50' },
  sandbox: { label: '沙箱(演示)', color: 'text-purple-600', bg: 'bg-purple-50' },
  other: { label: '其他', color: 'text-gray-600', bg: 'bg-gray-50' },
};

const syncStatusConfig: Record<StoreStatus, { label: string; variant: 'green' | 'blue' | 'red' | 'gray'; icon: React.ReactNode }> = {
  connected: { label: '已连接', variant: 'green', icon: <CheckCircle size={14} /> },
  disconnected: { label: '已断开', variant: 'gray', icon: <AlertTriangle size={14} /> },
  error: { label: '错误', variant: 'red', icon: <XCircle size={14} /> },
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '从未同步';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '无效日期';
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const Stores: React.FC = () => {
  usePageTitle('店铺管理');
  const { currentWorkspace } = useWorkspace();
  const { addToast } = useToast();
  const { errors, setFieldError, clearErrors } = useFormErrors();

  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formPlatform, setFormPlatform] = useState<StorePlatform>('taobao');
  const [formStoreUrl, setFormStoreUrl] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formApiSecret, setFormApiSecret] = useState('');
  const [formAccessToken, setFormAccessToken] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  const fetchStores = useCallback(async () => {
    if (!currentWorkspace) { setIsLoading(false); return; }
    setIsLoading(true);
    setError(null);
    try {
      const data = await storeService.getStores(currentWorkspace.slug);
      setStores(data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || '加载店铺列表失败');
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  const resetForm = () => {
    setFormName('');
    setFormPlatform('taobao');
    setFormStoreUrl('');
    setFormApiKey('');
    setFormApiSecret('');
    setFormAccessToken('');
    clearErrors();
  };

  const openCreateModal = () => {
    setEditingStore(null);
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (store: Store) => {
    setEditingStore(store);
    setFormName(store.name);
    setFormPlatform(store.platform);
    setFormStoreUrl(store.store_url || '');
    setFormApiKey(store.api_key || '');
    setFormApiSecret((store as any).api_secret || '');
    setFormAccessToken(store.access_token || '');
    clearErrors();
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!currentWorkspace) return;
    clearErrors();
    let hasError = false;
    if (!formName.trim()) {
      setFieldError('name', '店铺名称不能为空');
      hasError = true;
    }
    if (!formStoreUrl.trim() && formPlatform !== 'sandbox') {
      setFieldError('storeUrl', '店铺链接不能为空');
      hasError = true;
    }
    if (formPlatform !== 'sandbox' && formStoreUrl.trim()) {
      try {
        new URL(formStoreUrl.trim());
      } catch {
        setFieldError('storeUrl', '请输入有效的店铺链接（如 https://shop.example.com）');
        hasError = true;
      }
    }
    if (hasError) return;
    setFormSubmitting(true);
    try {
      const payload: Record<string, any> = {
        name: formName.trim(),
        platform: formPlatform,
        store_url: formStoreUrl.trim(),
        api_key: formApiKey.trim(),
      };
      // Only send secret/token fields when non-empty, so editing a store
      // without re-entering credentials does not overwrite stored values.
      if (formApiSecret.trim()) payload.api_secret = formApiSecret.trim();
      if (formAccessToken.trim()) payload.access_token = formAccessToken.trim();

      if (editingStore) {
        await storeService.updateStore(currentWorkspace.slug, { id: editingStore.id, ...payload } as any);
        addToast('success', '店铺已更新');
      } else {
        await storeService.createStore(currentWorkspace.slug, payload as any);
        addToast('success', '店铺已添加');
      }
      setShowModal(false);
      fetchStores();
    } catch (err: any) {
      addToast('error', '操作失败', err?.response?.data?.detail || '请稍后重试');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async (store: Store) => {
    if (!currentWorkspace) return;
    if (!window.confirm(`确定要删除店铺「${store.name}」吗？此操作不可撤销。`)) return;
    try {
      await storeService.deleteStore(currentWorkspace.slug, store.id);
      addToast('success', '店铺已删除');
      fetchStores();
    } catch (err: any) {
      addToast('error', '删除失败', err?.response?.data?.detail || '请稍后重试');
    }
  };

  const handleSync = async (store: Store) => {
    if (!currentWorkspace) return;
    setSyncingId(store.id);
    try {
      const res: any = await storeService.syncStore(currentWorkspace.slug, store.id);
      const c = res?.created ?? {};
      const u = res?.updated ?? {};
      addToast(
        'success',
        '同步完成',
        `新增 商品${c.products ?? 0}/订单${c.orders ?? 0}/客户${c.customers ?? 0}；` +
          `更新 商品${u.products ?? 0}/订单${u.orders ?? 0}/客户${u.customers ?? 0}`,
      );
      fetchStores();
    } catch (err: any) {
      addToast('error', '同步失败', err?.response?.data?.detail || '请稍后重试');
    } finally {
      setSyncingId(null);
    }
  };

  const handleTest = async (store: Store) => {
    if (!currentWorkspace) return;
    setTestingId(store.id);
    try {
      const res = await storeService.testConnection(currentWorkspace.slug, store.id);
      if (res.ok) {
        addToast('success', '连接成功', res.message);
      } else {
        addToast('error', '连接失败', res.message);
      }
      fetchStores();
    } catch (err: any) {
      addToast('error', '测试失败', err?.response?.data?.detail || '请稍后重试');
    } finally {
      setTestingId(null);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">加载失败</h3>
        <p className="text-sm text-gray-500 mt-1">{error}</p>
        <Button variant="outline" className="mt-4" onClick={fetchStores}>重试</Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-40 bg-gray-200 rounded shimmer" />
            <div className="h-4 w-60 bg-gray-200 rounded shimmer mt-2" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-64 bg-gray-100 rounded-xl shimmer" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">店铺管理</h2>
          <p className="mt-1 text-sm text-gray-500">管理多平台店铺连接和同步</p>
        </div>
        <Button variant="primary" size="sm" onClick={openCreateModal} leftIcon={<Plus size={16} />}>
          添加店铺
        </Button>
      </div>

      {/* 店铺列表 */}
      {stores.length === 0 ? (
        <EmptyState
          icon={<StoreIcon size={28} />}
          title="暂无店铺"
          description="添加你的电商平台店铺，开始同步商品和订单数据"
          actionLabel="添加店铺"
          onAction={openCreateModal}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stores.map((store) => {
            const p = platformConfig[store.platform] || platformConfig.other;
            const s = syncStatusConfig[store.status] || syncStatusConfig.disconnected;
            const isSyncing = syncingId === store.id;

            return (
              <Card key={store.id} hover padding>
                <div className="space-y-4">
                  {/* 平台标识 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-10 h-10 rounded-lg ${p.bg} flex items-center justify-center`}>
                        <ShoppingBag size={20} className={p.color} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{store.name}</p>
                        <span className={`text-xs font-medium ${p.color}`}>{p.label}</span>
                      </div>
                    </div>
                    <Badge variant={s.variant}>
                      <span className="flex items-center gap-1">
                        {s.icon}
                        {s.label}
                      </span>
                    </Badge>
                  </div>

                  {/* 最后同步时间 */}
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <RefreshCw size={12} />
                    <span>上次同步: {formatDate(store.last_sync_at)}</span>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTest(store)}
                      isLoading={testingId === store.id}
                      leftIcon={<PlugZap size={14} />}
                      className="flex-1"
                    >
                      {testingId === store.id ? '测试中' : '测试连接'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSync(store)}
                      isLoading={isSyncing}
                      leftIcon={<RefreshCw size={14} />}
                      className="flex-1"
                    >
                      {isSyncing ? '同步中' : '同步'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => window.open(store.store_url || '#', '_blank', 'noopener,noreferrer')}>
                      <ExternalLink size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditModal(store)}>
                      <StoreIcon size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(store)}>
                      <Trash2 size={14} className="text-red-500" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 添加/编辑店铺 Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingStore ? '编辑店铺' : '添加店铺'}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="店铺名称"
            placeholder="我的店铺"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            error={errors.name}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">平台</label>
            <select
              value={formPlatform}
              onChange={(e) => setFormPlatform(e.target.value as StorePlatform)}
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500"
            >
              {Object.entries(platformConfig).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>
          <Input
            label="店铺链接"
            placeholder="https://shop.example.com"
            value={formStoreUrl}
            onChange={(e) => setFormStoreUrl(e.target.value)}
            error={errors.storeUrl}
          />
          <Input
            label="API Key"
            placeholder="平台 API Key"
            type="password"
            value={formApiKey}
            onChange={(e) => setFormApiKey(e.target.value)}
          />
          <Input
            label="API Secret"
            placeholder="平台 API Secret"
            type="password"
            value={formApiSecret}
            onChange={(e) => setFormApiSecret(e.target.value)}
          />
          <Input
            label="Access Token"
            placeholder={
              formPlatform === 'shopify'
                ? 'shpat_xxxxxxxx'
                : formPlatform === 'douyin'
                ? '抖音 OAuth Access Token'
                : '平台 Access Token（可选）'
            }
            type="password"
            value={formAccessToken}
            onChange={(e) => setFormAccessToken(e.target.value)}
          />
          {(formPlatform === 'shopify' || formPlatform === 'douyin' || formPlatform === 'sandbox') && (
            <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700 leading-relaxed">
              {formPlatform === 'shopify' && (
                <>
                  <p className="font-medium mb-1">Shopify 接入说明</p>
                  <p>1. 在 Shopify 后台 → 设置 → 应用和销售渠道 → 开发应用</p>
                  <p>2. 创建应用后获取 Admin API Access Token（需授予 read_products, read_orders, read_customers 权限）</p>
                  <p>3. 填写店铺 URL（如 https://your-store.myshopify.com）和 Access Token</p>
                </>
              )}
              {formPlatform === 'douyin' && (
                <>
                  <p className="font-medium mb-1">抖音电商接入说明</p>
                  <p>1. 在抖音开放平台创建应用并获取 App Key 和 App Secret</p>
                  <p>2. 完成 OAuth 授权后获取 Access Token</p>
                  <p>3. 填写店铺 URL（如 https://your-store.douyin.com）和上述凭证</p>
                </>
              )}
              {formPlatform === 'sandbox' && (
                <>
                  <p className="font-medium mb-1">沙箱（演示）模式</p>
                  <p>1. 无需任何真实 API 凭证，可离线验证整条同步链路。</p>
                  <p>2. 点击「测试连接」会直接通过；点击「同步」会生成确定性示例商品/订单/客户。</p>
                  <p>3. 适合本地开发、演示与编写自动化测试。</p>
                </>
              )}
            </div>
          )}
          <ModalFooter
            onCancel={() => setShowModal(false)}
            onConfirm={handleSubmit}
            confirmText={editingStore ? '保存修改' : '添加店铺'}
            isLoading={formSubmitting}
          />
        </div>
      </Modal>
    </div>
  );
};