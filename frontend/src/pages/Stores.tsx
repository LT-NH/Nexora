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
  Boxes,
  Tag,
  Truck,
  FlaskConical,
  Info,
} from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/components/ui/Toast';
import { useFormErrors } from '@/hooks/useForm';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Portal } from '@/components/ui/Portal';
import { EmptyState } from '@/components/ui/EmptyState';
import { storeService } from '@/services/ecommerce';
import type {
  Store,
  StorePlatform,
  StoreStatus,
  PlatformInfo,
  PlatformCapability,
  WriteOpResult,
} from '@/types/ecommerce';
import { usePageT, type Lang } from '@/i18n';

type T = (key: string, fallback?: string) => string;

/** 能力 → i18n key + 图标（写操作入口按能力渲染，不支持就完全不显示） */
const CAPABILITY_META: Record<
  PlatformCapability,
  { labelKey: string; icon: React.ReactNode }
> = {
  read: { labelKey: 'cap_read', icon: <RefreshCw size={12} /> },
  write_inventory: { labelKey: 'cap_write_inventory', icon: <Boxes size={12} /> },
  write_price: { labelKey: 'cap_write_price', icon: <Tag size={12} /> },
  ship_order: { labelKey: 'cap_ship_order', icon: <Truck size={12} /> },
};

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
    undo: '撤销',

    restored_msg: '已恢复',
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
    btn_testing: '测试中…',
    btn_test_conn: '测试连接',
    btn_syncing: '同步中…',
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
    // ── 平台能力与双向同步 ──
    label_sandbox: '使用沙箱环境',
    sandbox_hint: '走平台沙箱网关，不会影响线上商品与订单数据',
    sandbox_unsupported: '该平台暂无公开沙箱环境',
    qualification_title: '接入资质提示',
    capabilities_title: '支持的操作',
    cap_read: '数据拉取',
    cap_write_inventory: '库存回写',
    cap_write_price: '价格回写',
    cap_ship_order: '发货回填',
    btn_push_inventory: '回写库存',
    btn_push_price: '回写价格',
    btn_ship: '发货',
    write_inventory_title: '批量回写库存',
    write_price_title: '批量回写价格',
    write_ship_title: '发货回填',
    write_need_rows: '请至少填写一行完整的 SKU 与数值',
    write_done: '已提交到平台',
    write_col_sku: '商品 SKU',
    write_col_stock: '目标库存',
    write_col_price: '目标价格（元）',
    write_add_row: '添加一行',
    ship_need_fields: '请填写订单号与运单号',
    ship_order_number: '订单号（含平台前缀，如 TB-9001）',
    ship_tracking: '运单号',
    ship_carrier: '物流公司（如 顺丰速运；京东需数字 ID）',
    write_result_title: '执行结果',
    write_result_summary: '成功 {ok} 条 / 失败 {fail} 条',
    write_not_supported: '该平台未声明此操作能力，入口已隐藏',
    platform_not_implemented: '适配器开发中',
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
    undo: 'Undo',

    restored_msg: 'Restored',
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
    // ── Platform capabilities & two-way sync ──
    label_sandbox: 'Use sandbox environment',
    sandbox_hint: 'Routes to the platform sandbox gateway — live products and orders are untouched',
    sandbox_unsupported: 'This platform has no public sandbox environment',
    qualification_title: 'Access requirements',
    capabilities_title: 'Supported operations',
    cap_read: 'Data pull',
    cap_write_inventory: 'Inventory push',
    cap_write_price: 'Price push',
    cap_ship_order: 'Shipment push',
    btn_push_inventory: 'Push inventory',
    btn_push_price: 'Push price',
    btn_ship: 'Ship',
    write_inventory_title: 'Push inventory in bulk',
    write_price_title: 'Push prices in bulk',
    write_ship_title: 'Push shipment',
    write_need_rows: 'Fill in at least one complete SKU/value row',
    write_done: 'Submitted to the platform',
    write_col_sku: 'Product SKU',
    write_col_stock: 'Target stock',
    write_col_price: 'Target price',
    write_add_row: 'Add row',
    ship_need_fields: 'Order number and tracking number are required',
    ship_order_number: 'Order number (with platform prefix, e.g. TB-9001)',
    ship_tracking: 'Tracking number',
    ship_carrier: 'Carrier (e.g. SF Express; JD needs the numeric ID)',
    write_result_title: 'Result',
    write_result_summary: '{ok} succeeded / {fail} failed',
    write_not_supported: 'This platform does not declare the capability — the entry is hidden',
    platform_not_implemented: 'Adapter in progress',
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
  // 后端存 naive UTC —— 按 UTC 解析后再转本地时区显示（避免差 8 小时）
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
  const [formSandbox, setFormSandbox] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // 平台能力目录 —— 由后端下发，前端不硬编码
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([]);
  const platformInfo = (p: StorePlatform): PlatformInfo | undefined =>
    platforms.find((x) => x.platform === p);

  // 写操作（双向同步的写方向）
  const [writeStore, setWriteStore] = useState<Store | null>(null);
  const [writeKind, setWriteKind] = useState<'inventory' | 'price' | null>(null);
  const [writeRows, setWriteRows] = useState<{ sku: string; value: string }[]>([
    { sku: '', value: '' },
  ]);
  const [shipOrderNumber, setShipOrderNumber] = useState('');
  const [shipTracking, setShipTracking] = useState('');
  const [shipCarrier, setShipCarrier] = useState('');
  const [writeBusy, setWriteBusy] = useState(false);
  const [writeResult, setWriteResult] = useState<WriteOpResult | null>(null);

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

  // 平台目录拉取失败不阻塞页面（只影响能力徽章与写入口的显示）
  useEffect(() => {
    if (!currentWorkspace) return;
    storeService
      .getPlatforms(currentWorkspace.slug)
      .then(setPlatforms)
      .catch(() => setPlatforms([]));
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
    setFormSandbox(false);
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
    // access_token 后端返回的是掩码值（如 shpa****e1dc），回填会把掩码当真实 token 覆盖存储 → 编辑时不回填
    setFormAccessToken('');
    setFormSandbox(Boolean(store.sandbox));
    clearErrors();
    setShowModal(true);
  };

  /** 当前平台要求的凭证字段（由后端目录下发，前端不猜） */
  const requiredFields = platformInfo(formPlatform)?.credential_fields ?? [];
  const needsStoreUrl = requiredFields.includes('store_url');

  const handleSubmit = async () => {
    if (!currentWorkspace) return;
    clearErrors();
    let hasError = false;
    if (!formName.trim()) {
      setFieldError('name', t('err_store_name_required'));
      hasError = true;
    }
    // 只有该平台确实需要店铺地址时才校验 —— 淘宝/京东/拼多多靠 AppKey + 令牌
    // 识别店铺，强填店铺地址是多余的
    if (needsStoreUrl && !formStoreUrl.trim()) {
      setFieldError('storeUrl', t('err_store_url_required'));
      hasError = true;
    }
    if (needsStoreUrl && formStoreUrl.trim()) {
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
        sandbox: formSandbox,
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

  // ------------------------------------------------------------------
  // 双向同步 —— 写操作（库存 / 价格 / 发货）
  // ------------------------------------------------------------------

  const openWriteModal = (store: Store, kind: 'inventory' | 'price') => {
    setWriteStore(store);
    setWriteKind(kind);
    setWriteRows([{ sku: '', value: '' }]);
    setWriteResult(null);
  };

  const openShipModal = (store: Store) => {
    setWriteStore(store);
    setWriteKind(null);
    setShipOrderNumber('');
    setShipTracking('');
    setShipCarrier('');
    setWriteResult(null);
  };

  const closeWriteModal = () => {
    setWriteStore(null);
    setWriteKind(null);
    setWriteResult(null);
  };

  const handleWriteSubmit = async () => {
    if (!currentWorkspace || !writeStore || !writeKind) return;
    const entries = writeRows
      .map((r) => ({ sku: r.sku.trim(), value: r.value.trim() }))
      .filter((r) => r.sku && r.value);
    if (entries.length === 0) {
      addToast('error', t('err_op_failed'), t('write_need_rows'));
      return;
    }
    setWriteBusy(true);
    setWriteResult(null);
    try {
      const result =
        writeKind === 'inventory'
          ? await storeService.pushInventory(
              currentWorkspace.slug,
              writeStore.id,
              entries.map((e) => ({ sku: e.sku, stock: Math.max(0, parseInt(e.value, 10) || 0) })),
            )
          : await storeService.pushPrice(
              currentWorkspace.slug,
              writeStore.id,
              entries.map((e) => ({ sku: e.sku, price: parseFloat(e.value) || 0 })),
            );
      setWriteResult(result);
      if (result.ok) addToast('success', t('write_done'));
      fetchStores();
    } catch (err: any) {
      addToast('error', t('err_op_failed'), err?.response?.data?.detail || t('pls_retry'));
    } finally {
      setWriteBusy(false);
    }
  };

  const handleShipSubmit = async () => {
    if (!currentWorkspace || !writeStore) return;
    if (!shipOrderNumber.trim() || !shipTracking.trim()) {
      addToast('error', t('err_op_failed'), t('ship_need_fields'));
      return;
    }
    setWriteBusy(true);
    setWriteResult(null);
    try {
      const result = await storeService.pushShipment(
        currentWorkspace.slug,
        writeStore.id,
        shipOrderNumber.trim(),
        { tracking_number: shipTracking.trim(), carrier: shipCarrier.trim() },
      );
      setWriteResult(result);
      if (result.ok) addToast('success', t('write_done'));
      fetchStores();
    } catch (err: any) {
      addToast('error', t('err_op_failed'), err?.response?.data?.detail || t('pls_retry'));
    } finally {
      setWriteBusy(false);
    }
  };

  const handleDelete = async (store: Store) => {
    if (!currentWorkspace) return;
    if (!window.confirm(t('delete_confirm').replace('{name}', store.name))) return;
    try {
      const snapshot = { ...store };
      await storeService.deleteStore(currentWorkspace.slug, store.id);
      addToast('success', t('ok_deleted'), '', {
        label: t('undo'),
        onClick: async () => {
          try {
            await storeService.createStore(currentWorkspace.slug, {
              name: snapshot.name,
              platform: snapshot.platform,
              store_url: snapshot.store_url || '',
              api_key: snapshot.api_key || '',
            } as any);
            addToast('success', t('restored_msg'));
            fetchStores();
          } catch { /* 恢复失败静默 */ }
        },
      });
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

  // 自动同步开关 / 频率调整（即时保存，直接采用 PUT 响应避免重拉竞态）
  const [updatingSyncId, setUpdatingSyncId] = useState<string | null>(null);
  const handleAutoSyncChange = async (
    store: Store,
    patch: { auto_sync_enabled?: boolean; sync_interval_minutes?: number },
  ) => {
    if (!currentWorkspace) return;
    setUpdatingSyncId(store.id);
    try {
      const updated = await storeService.updateStore(currentWorkspace.slug, {
        id: store.id,
        ...patch,
      });
      setStores((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err: any) {
      addToast('error', err?.response?.data?.detail || t('pls_retry'));
    } finally {
      setUpdatingSyncId(null);
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
      <PageHeader
        title={t('stores_title')}
        subtitle={t('stores_subtitle')}
        actions={
          <Button variant="primary" size="sm" onClick={openCreateModal} leftIcon={<Plus size={16} />}>
            {t('btn_add_store')}
          </Button>
        }
      />

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

                  {/* 同步状态（时间 + 结果徽章 + 错误明细） */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 min-w-0">
                        <RefreshCw size={12} className="flex-shrink-0" />
                        <span className="truncate">
                          {t('last_sync').replace('{date}', formatDate(store.last_sync_at, t))}
                        </span>
                      </div>
                      {store.last_sync_status && (
                        <span
                          className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                            store.last_sync_status === 'success'
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : store.last_sync_status === 'partial'
                                ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                                : 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                          }`}
                        >
                          {store.last_sync_status === 'success'
                            ? '同步成功'
                            : store.last_sync_status === 'partial'
                              ? '部分成功'
                              : '同步失败'}
                        </span>
                      )}
                    </div>
                    {store.last_sync_errors && (
                      <p
                        className="text-[11px] text-red-500 dark:text-red-400 bg-red-50/60 dark:bg-red-900/10 rounded-md px-2 py-1.5 break-all line-clamp-2"
                        title={store.last_sync_errors}
                      >
                        {store.last_sync_errors}
                      </p>
                    )}
                    {/* 自动同步开关 + 频率 */}
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 dark:bg-gray-800/60 px-3 py-2">
                      <label
                        className="flex items-center gap-2 cursor-pointer select-none"
                        htmlFor={`autosync-${store.id}`}
                      >
                        <input
                          id={`autosync-${store.id}`}
                          type="checkbox"
                          checked={store.auto_sync_enabled}
                          disabled={updatingSyncId === store.id}
                          onChange={(e) =>
                            handleAutoSyncChange(store, { auto_sync_enabled: e.target.checked })
                          }
                          className="w-4 h-4 accent-primary-600 cursor-pointer"
                        />
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                          自动同步
                        </span>
                      </label>
                      {store.auto_sync_enabled && (
                        <select
                          value={String(store.sync_interval_minutes || 60)}
                          disabled={updatingSyncId === store.id}
                          onChange={(e) =>
                            handleAutoSyncChange(store, {
                              sync_interval_minutes: Number(e.target.value),
                            })
                          }
                          className="text-xs rounded-md border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary-400"
                          aria-label="自动同步频率"
                        >
                          <option value="15">每 15 分钟</option>
                          <option value="30">每 30 分钟</option>
                          <option value="60">每 1 小时</option>
                          <option value="180">每 3 小时</option>
                          <option value="720">每 12 小时</option>
                        </select>
                      )}
                    </div>
                  </div>

                  {/* 能力徽章 —— 由后端下发，如实反映该平台能做到什么 */}
                  {(() => {
                    const info = platformInfo(store.platform);
                    if (!info) return null;
                    const writable = info.capabilities.filter((c) => c !== 'read');
                    return (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {info.capabilities.map((cap) => (
                          <span
                            key={cap}
                            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] ${
                              cap === 'read'
                                ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                                : 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                            }`}
                          >
                            {CAPABILITY_META[cap]?.icon}
                            {t(CAPABILITY_META[cap]?.labelKey || 'cap_read')}
                          </span>
                        ))}
                        {store.sandbox && info.sandbox_supported && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            <FlaskConical size={12} />
                            Sandbox
                          </span>
                        )}
                        {!info.implemented && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                            {t('platform_not_implemented')}
                          </span>
                        )}
                        {writable.length === 0 && (
                          <span
                            className="text-[11px] text-gray-400 dark:text-gray-500"
                            title={t('write_not_supported')}
                          >
                            {t('write_not_supported')}
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {/* 双向同步入口 —— 只在该平台声明了对应能力时才渲染 */}
                  {(() => {
                    const caps = platformInfo(store.platform)?.capabilities ?? [];
                    if (!caps.some((c) => c.startsWith('write') || c === 'ship_order')) {
                      return null;
                    }
                    return (
                      <div className="flex items-center gap-2">
                        {caps.includes('write_inventory') && (
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Boxes size={14} />}
                            onClick={() => openWriteModal(store, 'inventory')}
                            className="flex-1"
                          >
                            {t('btn_push_inventory')}
                          </Button>
                        )}
                        {caps.includes('write_price') && (
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Tag size={14} />}
                            onClick={() => openWriteModal(store, 'price')}
                            className="flex-1"
                          >
                            {t('btn_push_price')}
                          </Button>
                        )}
                        {caps.includes('ship_order') && (
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Truck size={14} />}
                            onClick={() => openShipModal(store)}
                            className="flex-1"
                          >
                            {t('btn_ship')}
                          </Button>
                        )}
                      </div>
                    );
                  })()}

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

          {/* 平台接入资质提示 —— 如实告知门槛，避免填完才发现没权限 */}
          {platformInfo(formPlatform)?.qualification_note && (
            <div className="flex gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              <Info size={14} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-0.5">{t('qualification_title')}</p>
                <p>{platformInfo(formPlatform)?.qualification_note}</p>
              </div>
            </div>
          )}

          {/* 凭证字段按平台裁剪：淘宝/京东/拼多多不需要店铺地址 */}
          {needsStoreUrl && (
            <Input
              label={t('label_store_url')}
              placeholder="https://shop.example.com"
              value={formStoreUrl}
              onChange={(e) => setFormStoreUrl(e.target.value)}
              error={errors.storeUrl}
            />
          )}
          <Input
            label={
              platformInfo(formPlatform)?.credential_labels?.api_key ||
              t('label_api_key')
            }
            placeholder={t('placeholder_api_key')}
            type="password"
            value={formApiKey}
            onChange={(e) => setFormApiKey(e.target.value)}
          />
          <Input
            label={
              platformInfo(formPlatform)?.credential_labels?.api_secret ||
              t('label_api_secret')
            }
            placeholder={t('placeholder_api_secret')}
            type="password"
            value={formApiSecret}
            onChange={(e) => setFormApiSecret(e.target.value)}
          />
          <Input
            label={
              platformInfo(formPlatform)?.credential_labels?.access_token ||
              t('label_access_token')
            }
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

          {/* 沙箱开关：只有平台确实提供沙箱网关时才显示 */}
          {platformInfo(formPlatform)?.sandbox_supported ? (
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={formSandbox}
                onChange={(e) => setFormSandbox(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {t('label_sandbox')}
                </span>
                <br />
                {t('sandbox_hint')}
              </span>
            </label>
          ) : (
            formPlatform === 'taobao' ||
            formPlatform === 'jd' ||
            formPlatform === 'pdd' ? (
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                {t('sandbox_unsupported')}
              </p>
            ) : null
          )}
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

      {/* 写操作结果（库存/价格/发货共用）。走 Portal：本页根节点是 space-y-6，
          会给子元素强加 margin-top，把底部浮层顶出视口。 */}
      {writeResult && (
        <Portal>
        <div className="fixed inset-x-0 bottom-0 z-[70] flex justify-center px-4 pb-4 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-lg rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-3 text-xs">
            <p className="font-medium text-gray-800 dark:text-gray-100 mb-1">
              {t('write_result_title')} —{' '}
              {t('write_result_summary')
                .replace('{ok}', String(writeResult.succeeded))
                .replace('{fail}', String(writeResult.failed))}
            </p>
            {writeResult.errors.length > 0 && (
              <ul className="max-h-32 overflow-y-auto space-y-0.5 text-red-600 dark:text-red-400 leading-relaxed">
                {writeResult.errors.map((e, i) => (
                  <li key={i}>· {e}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setWriteResult(null)}
              className="mt-2 text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              收起
            </button>
          </div>
        </div>
        </Portal>
      )}

      {/* 库存 / 价格批量回写 */}
      <Modal
        isOpen={writeStore !== null && writeKind !== null}
        onClose={closeWriteModal}
        title={
          writeKind === 'inventory'
            ? t('write_inventory_title')
            : t('write_price_title')
        }
        size="md"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>{writeStore?.name}</span>
            {writeStore?.sandbox && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                <FlaskConical size={11} />
                Sandbox
              </span>
            )}
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {writeRows.map((row, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  value={row.sku}
                  onChange={(e) =>
                    setWriteRows((rows) =>
                      rows.map((r, i) =>
                        i === idx ? { ...r, sku: e.target.value } : r,
                      ),
                    )
                  }
                  placeholder={t('write_col_sku')}
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500"
                />
                <input
                  value={row.value}
                  onChange={(e) =>
                    setWriteRows((rows) =>
                      rows.map((r, i) =>
                        i === idx ? { ...r, value: e.target.value } : r,
                      ),
                    )
                  }
                  inputMode="decimal"
                  placeholder={
                    writeKind === 'inventory'
                      ? t('write_col_stock')
                      : t('write_col_price')
                  }
                  className="w-32 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setWriteRows((rows) => [...rows, { sku: '', value: '' }])
            }
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
          >
            + {t('write_add_row')}
          </button>
          <ModalFooter
            onCancel={closeWriteModal}
            onConfirm={handleWriteSubmit}
            confirmText={t('btn_confirm')}
            isLoading={writeBusy}
          />
        </div>
      </Modal>

      {/* 发货回填 */}
      <Modal
        isOpen={writeStore !== null && writeKind === null}
        onClose={closeWriteModal}
        title={t('write_ship_title')}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label={t('ship_order_number')}
            placeholder="TB-9001"
            value={shipOrderNumber}
            onChange={(e) => setShipOrderNumber(e.target.value)}
          />
          <Input
            label={t('ship_tracking')}
            placeholder="SF1234567890"
            value={shipTracking}
            onChange={(e) => setShipTracking(e.target.value)}
          />
          <Input
            label={t('ship_carrier')}
            placeholder="顺丰速运"
            value={shipCarrier}
            onChange={(e) => setShipCarrier(e.target.value)}
          />
          <ModalFooter
            onCancel={closeWriteModal}
            onConfirm={handleShipSubmit}
            confirmText={t('btn_confirm')}
            isLoading={writeBusy}
          />
        </div>
      </Modal>
    </div>
  );
};
