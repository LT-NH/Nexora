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
import { usePageT, type Lang } from '@/i18n';

type T = (key: string, fallback?: string) => string;

const D = {
  zh: {
    page_title: '店铺管理',
    err_load_stores: '加载店铺列表失败',
    err_store_name_required: '店铺名称不能为空',
    err_store_url_required: '店铺链接不能为空',
    err_store_url_invalid: '请输入有效的店铺链接（如 https://shop.example.com）',
    err_op_failed: '操作失败',
    pls_retry: '请稍后重试',
    ok_updated: '店铺已更新',
    ok_added: '店铺已添加',
    ok_deleted: '店铺已删除',
    err_delete_failed: '删除失败',
    sync_done: '同步完成',
    sync_result: '新增 商品{cp}/订单{co}/客户{cc}；更新 商品{up}/订单{uo}/客户{uc}',
    err_sync_failed: '同步失败',
    ok_connected: '连接成功',
    err_connect_failed: '连接失败',
    err_test_failed: '测试失败',
    load_failed_title: '加载失败',
    btn_retry: '重试',
    stores_title: '店铺管理',
    stores_subtitle: '管理多平台店铺连接和同步',
    btn_add_store: '添加店铺',
    empty_title: '暂无店铺',
    empty_desc: '添加你的电商平台店铺，开始同步商品和订单数据',
    last_sync: '上次同步: {date}',
    never_synced: '从未同步',
    invalid_date: '无效日期',
    btn_testing: '测试中',
    btn_test_conn: '测试连接',
    btn_syncing: '同步中',
    btn_sync: '同步',
    aria_open_new: '在新窗口打开',
    aria_edit: '编辑',
    aria_delete: '删除',
    modal_edit_title: '编辑店铺',
    modal_add_title: '添加店铺',
    label_store_name: '店铺名称',
    placeholder_store_name: '我的店铺',
    label_platform: '平台',
    label_store_url: '店铺链接',
    label_api_key: 'API Key',
    placeholder_api_key: '平台 API Key',
    label_api_secret: 'API Secret',
    placeholder_api_secret: '平台 API Secret',
    label_access_token: 'Access Token',
    placeholder_access_token_douyin: '抖音 OAuth Access Token',
    placeholder_access_token_generic: '平台 Access Token（可选）',
    shopify_help_title: 'Shopify 接入说明',
    shopify_help_1: '1. 在 Shopify 后台 → 设置 → 应用和销售渠道 → 开发应用',
    shopify_help_2: '2. 创建应用后获取 Admin API Access Token（需授予 read_products, read_orders, read_customers 权限）',
    shopify_help_3: '3. 填写店铺 URL（如 https://your-store.myshopify.com）和 API Key（API Key 即 Admin API Access Token，粘贴 shpat_ 开头的 token）',
    douyin_help_title: '抖音电商接入说明',
    douyin_help_1: '1. 在抖音开放平台创建应用并获取 App Key 和 App Secret',
    douyin_help_2: '2. 完成 OAuth 授权后获取 Access Token',
    douyin_help_3: '3. 填写店铺 URL（如 https://your-store.douyin.com）和上述凭证',
    sandbox_help_title: '沙箱（演示）模式',
    sandbox_help_1: '1. 无需任何真实 API 凭证，可离线验证整条同步链路。',
    sandbox_help_2: '2. 点击「测试连接」会直接通过；点击「同步」会生成确定性示例商品/订单/客户。',
    sandbox_help_3: '3. 适合本地开发、演示与编写自动化测试。',
    btn_save_changes: '保存修改',
    delete_confirm: '确定要删除店铺「{name}」吗？此操作不可撤销。',
    platform_taobao: '淘宝',
    platform_jd: '京东',
    platform_pdd: '拼多多',
    platform_douyin: '抖音',
    platform_shopify: 'Shopify',
    platform_amazon: 'Amazon',
    platform_sandbox: '沙箱(演示)',
    platform_other: '其他',
    st_connected: '已连接',
    st_disconnected: '已断开',
    st_error: '错误',
  },
  en: {
    page_title: 'Stores',
    err_load_stores: 'Failed to load stores',
    err_store_name_required: 'Store name is required',
    err_store_url_required: 'Store URL is required',
    err_store_url_invalid: 'Please enter a valid store URL (e.g. https://shop.example.com)',
    err_op_failed: 'Operation failed',
    pls_retry: 'Please try again later',
    ok_updated: 'Store updated',
    ok_added: 'Store added',
    ok_deleted: 'Store deleted',
    err_delete_failed: 'Delete failed',
    sync_done: 'Sync completed',
    sync_result: 'New: products {cp}/orders {co}/customers {cc}; updated: products {up}/orders {uo}/customers {uc}',
    err_sync_failed: 'Sync failed',
    ok_connected: 'Connection successful',
    err_connect_failed: 'Connection failed',
    err_test_failed: 'Test failed',
    load_failed_title: 'Load failed',
    btn_retry: 'Retry',
    stores_title: 'Store Management',
    stores_subtitle: 'Manage multi-platform store connections and sync',
    btn_add_store: 'Add store',
    empty_title: 'No stores',
    empty_desc: 'Add your e-commerce platform stores to start syncing products and orders',
    last_sync: 'Last sync: {date}',
    never_synced: 'Never synced',
    invalid_date: 'Invalid date',
    btn_testing: 'Testing...',
    btn_test_conn: 'Test connection',
    btn_syncing: 'Syncing...',
    btn_sync: 'Sync',
    aria_open_new: 'Open in new window',
    aria_edit: 'Edit',
    aria_delete: 'Delete',
    modal_edit_title: 'Edit store',
    modal_add_title: 'Add store',
    label_store_name: 'Store name',
    placeholder_store_name: 'My store',
    label_platform: 'Platform',
    label_store_url: 'Store URL',
    label_api_key: 'API Key',
    placeholder_api_key: 'Platform API Key',
    label_api_secret: 'API Secret',
    placeholder_api_secret: 'Platform API Secret',
    label_access_token: 'Access Token',
    placeholder_access_token_douyin: 'Douyin OAuth Access Token',
    placeholder_access_token_generic: 'Platform Access Token (optional)',
    shopify_help_title: 'Shopify setup guide',
    shopify_help_1: '1. In Shopify admin → Settings → Apps and sales channels → Develop apps',
    shopify_help_2: '2. After creating the app, get the Admin API Access Token (grant read_products, read_orders, read_customers)',
    shopify_help_3: '3. Fill in the store URL (e.g. https://your-store.myshopify.com) and the API Key (paste the Admin API Access Token starting with shpat_)',
    douyin_help_title: 'Douyin commerce setup guide',
    douyin_help_1: '1. Create an app on the Douyin Open Platform and get the App Key and App Secret',
    douyin_help_2: '2. Complete OAuth authorization to get the Access Token',
    douyin_help_3: '3. Fill in the store URL (e.g. https://your-store.douyin.com) and the credentials above',
    sandbox_help_title: 'Sandbox (demo) mode',
    sandbox_help_1: '1. No real API credentials needed — verify the whole sync pipeline offline.',
    sandbox_help_2: '2. Click "Test connection" to pass instantly; click "Sync" to generate deterministic sample products/orders/customers.',
    sandbox_help_3: '3. Great for local development, demos and automated tests.',
    btn_save_changes: 'Save changes',
    delete_confirm: 'Delete store "{name}"? This cannot be undone.',
    platform_taobao: 'Taobao',
    platform_jd: 'JD.com',
    platform_pdd: 'Pinduoduo',
    platform_douyin: 'Douyin',
    platform_shopify: 'Shopify',
    platform_amazon: 'Amazon',
    platform_sandbox: 'Sandbox (demo)',
    platform_other: 'Other',
    st_connected: 'Connected',
    st_disconnected: 'Disconnected',
    st_error: 'Error',
  },
} as Record<Lang, Record<string, string>>;

const getPlatformConfig = (t: T): Record<StorePlatform, { label: string; color: string; bg: string }> => ({
  taobao: { label: t('platform_taobao'), color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20' },
  jd: { label: t('platform_jd'), color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
  pdd: { label: t('platform_pdd'), color: 'text-red-500 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
  douyin: { label: t('platform_douyin'), color: 'text-gray-800 dark:text-gray-200', bg: 'bg-gray-50 dark:bg-gray-800' },
  shopify: { label: t('platform_shopify'), color: 'text-green-700 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
  amazon: { label: t('platform_amazon'), color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  sandbox: { label: t('platform_sandbox'), color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20' },
  other: { label: t('platform_other'), color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-800' },
});

const getSyncStatusConfig = (t: T): Record<StoreStatus, { label: string; variant: 'success' | 'primary' | 'danger' | 'neutral'; icon: React.ReactNode }> => ({
  connected: { label: t('st_connected'), variant: 'success', icon: <CheckCircle size={14} /> },
  disconnected: { label: t('st_disconnected'), variant: 'neutral', icon: <AlertTriangle size={14} /> },
  error: { label: t('st_error'), variant: 'danger', icon: <XCircle size={14} /> },
});

const formatDate = (dateStr: string | null, t: T) => {
  if (!dateStr) return t('never_synced');
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return t('invalid_date');
  // 后端存 naive UTC → 按 UTC 解析后再转本地时区显示（避免差 8 小时）
  const utcMs = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  return new Date(utcMs).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const Stores: React.FC = () => {
  const t = usePageT(D);
  usePageTitle(t('page_title'));
  const pCfg = getPlatformConfig(t);
  const sCfg = getSyncStatusConfig(t);
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
      setError(err?.response?.data?.detail || t('err_load_stores'));
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
      setFieldError('name', t('err_store_name_required'));
      hasError = true;
    }
    if (!formStoreUrl.trim() && formPlatform !== 'sandbox') {
      setFieldError('storeUrl', t('err_store_url_required'));
      hasError = true;
    }
    if (formPlatform !== 'sandbox' && formStoreUrl.trim()) {
      try {
        new URL(formStoreUrl.trim());
      } catch {
        setFieldError('storeUrl', t('err_store_url_invalid'));
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
        addToast('success', t('ok_updated'));
      } else {
        await storeService.createStore(currentWorkspace.slug, payload as any);
        addToast('success', t('ok_added'));
      }
      setShowModal(false);
      fetchStores();
    } catch (err: any) {
      addToast('error', t('err_op_failed'), err?.response?.data?.detail || t('pls_retry'));
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async (store: Store) => {
    if (!currentWorkspace) return;
    if (!window.confirm(t('delete_confirm').replace('{name}', store.name))) return;
    try {
      await storeService.deleteStore(currentWorkspace.slug, store.id);
      addToast('success', t('ok_deleted'));
      fetchStores();
    } catch (err: any) {
      addToast('error', t('err_delete_failed'), err?.response?.data?.detail || t('pls_retry'));
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
        t('sync_done'),
        t('sync_result')
          .replace('{cp}', String(c.products ?? 0))
          .replace('{co}', String(c.orders ?? 0))
          .replace('{cc}', String(c.customers ?? 0))
          .replace('{up}', String(u.products ?? 0))
          .replace('{uo}', String(u.orders ?? 0))
          .replace('{uc}', String(u.customers ?? 0)),
      );
      fetchStores();
    } catch (err: any) {
      addToast('error', t('err_sync_failed'), err?.response?.data?.detail || t('pls_retry'));
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
        addToast('success', t('ok_connected'), res.message);
      } else {
        addToast('error', t('err_connect_failed'), res.message);
      }
      fetchStores();
    } catch (err: any) {
      addToast('error', t('err_test_failed'), err?.response?.data?.detail || t('pls_retry'));
    } finally {
      setTestingId(null);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-red-500 dark:text-red-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">{t('load_failed_title')}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{error}</p>
        <Button variant="outline" className="mt-4" onClick={fetchStores}>{t('btn_retry')}</Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-40 bg-gray-200 dark:bg-gray-700 rounded shimmer" />
            <div className="h-4 w-60 bg-gray-200 dark:bg-gray-700 rounded shimmer mt-2" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-64 bg-gray-100 dark:bg-gray-700 rounded-xl shimmer" />
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
          <h2 className="text-2xl font-bold text-slate-900 dark:text-gray-100">{t('stores_title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('stores_subtitle')}</p>
        </div>
        <Button variant="primary" size="sm" onClick={openCreateModal} leftIcon={<Plus size={16} />}>
          {t('btn_add_store')}
        </Button>
      </div>

      {/* 店铺列表 */}
      {stores.length === 0 ? (
        <EmptyState
          icon={<StoreIcon size={28} />}
          title={t('empty_title')}
          description={t('empty_desc')}
          actionLabel={t('btn_add_store')}
          onAction={openCreateModal}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stores.map((store) => {
            const p = pCfg[store.platform] || pCfg.other;
            const s = sCfg[store.status] || sCfg.disconnected;
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
                        <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">{store.name}</p>
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
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <RefreshCw size={12} />
                    <span>{t('last_sync').replace('{date}', formatDate(store.last_sync_at, t))}</span>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTest(store)}
                      isLoading={testingId === store.id}
                      leftIcon={<PlugZap size={14} />}
                      className="flex-1"
                    >
                      {testingId === store.id ? t('btn_testing') : t('btn_test_conn')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSync(store)}
                      isLoading={isSyncing}
                      leftIcon={<RefreshCw size={14} />}
                      className="flex-1"
                    >
                      {isSyncing ? t('btn_syncing') : t('btn_sync')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => window.open(store.store_url || '#', '_blank', 'noopener,noreferrer')} aria-label={t('aria_open_new')}>
                      <ExternalLink size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditModal(store)} aria-label={t('aria_edit')}>
                      <StoreIcon size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(store)} aria-label={t('aria_delete')}>
                      <Trash2 size={14} className="text-red-500 dark:text-red-400" />
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
        title={editingStore ? t('modal_edit_title') : t('modal_add_title')}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label={t('label_store_name')}
            placeholder={t('placeholder_store_name')}
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            error={errors.name}
          />
          <div>
            <label htmlFor="store-platform" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('label_platform')}</label>
            <select
              id="store-platform"
              value={formPlatform}
              onChange={(e) => setFormPlatform(e.target.value as StorePlatform)}
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500"
            >
              {Object.entries(pCfg).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>
          <Input
            label={t('label_store_url')}
            placeholder="https://shop.example.com"
            value={formStoreUrl}
            onChange={(e) => setFormStoreUrl(e.target.value)}
            error={errors.storeUrl}
          />
          <Input
            label={t('label_api_key')}
            placeholder={t('placeholder_api_key')}
            type="password"
            value={formApiKey}
            onChange={(e) => setFormApiKey(e.target.value)}
          />
          <Input
            label={t('label_api_secret')}
            placeholder={t('placeholder_api_secret')}
            type="password"
            value={formApiSecret}
            onChange={(e) => setFormApiSecret(e.target.value)}
          />
          <Input
            label={t('label_access_token')}
            placeholder={
              formPlatform === 'shopify'
                ? 'shpat_xxxxxxxx'
                : formPlatform === 'douyin'
                ? t('placeholder_access_token_douyin')
                : t('placeholder_access_token_generic')
            }
            type="password"
            value={formAccessToken}
            onChange={(e) => setFormAccessToken(e.target.value)}
          />
          {(formPlatform === 'shopify' || formPlatform === 'douyin' || formPlatform === 'sandbox') && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
              {formPlatform === 'shopify' && (
                <>
                  <p className="font-medium mb-1">{t('shopify_help_title')}</p>
                  <p>{t('shopify_help_1')}</p>
                  <p>{t('shopify_help_2')}</p>
                  <p>{t('shopify_help_3')}</p>
                </>
              )}
              {formPlatform === 'douyin' && (
                <>
                  <p className="font-medium mb-1">{t('douyin_help_title')}</p>
                  <p>{t('douyin_help_1')}</p>
                  <p>{t('douyin_help_2')}</p>
                  <p>{t('douyin_help_3')}</p>
                </>
              )}
              {formPlatform === 'sandbox' && (
                <>
                  <p className="font-medium mb-1">{t('sandbox_help_title')}</p>
                  <p>{t('sandbox_help_1')}</p>
                  <p>{t('sandbox_help_2')}</p>
                  <p>{t('sandbox_help_3')}</p>
                </>
              )}
            </div>
          )}
          <ModalFooter
            onCancel={() => setShowModal(false)}
            onConfirm={handleSubmit}
            confirmText={editingStore ? t('btn_save_changes') : t('btn_add_store')}
            isLoading={formSubmitting}
          />
        </div>
      </Modal>
    </div>
  );
};
