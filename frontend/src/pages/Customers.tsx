import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Send,
  User,
  Phone,
  Mail,
  AlertTriangle,
  RefreshCw,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/components/ui/Toast';
import { useFormErrors } from '@/hooks/useForm';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Table } from '@/components/ui/Table';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { customerService } from '@/services/ecommerce';
import api from '@/services/api';
import type { Customer, CustomerTag, RFMAnalysis } from '@/types/ecommerce';
import { usePageT, type Lang } from '@/i18n';

type T = (key: string, fallback?: string) => string;

const D = {
  zh: {
    page_title: '客户管理',
    err_load_customers: '加载客户列表失败',
    err_required_name: '客户姓名不能为空',
    err_required_email: '邮箱不能为空',
    err_email_invalid: '请输入有效的邮箱地址',
    err_op_failed: '操作失败',
    pls_retry: '请稍后重试',
    err_load_failed: '加载失败',
    err_customer_detail: '无法获取客户详情',
    ok_updated: '客户信息已更新',
    ok_created: '客户已创建',
    ok_deleted: '客户已删除',
    undo: '撤销',

    restored_msg: '已恢复',
    err_delete_failed: '删除失败',
    load_failed_title: '加载失败',
    btn_retry: '重试',
    col_customer: '客户',
    col_phone: '电话',
    col_tags: '标签',
    col_orders: '订单',
    col_membership: '会员等级',
    col_last_order: '最近购买',
    col_actions: '操作',
    btn_edit: '编辑',
    btn_detail: '详情',
    aria_delete: '删除',
    no_date: '暂无',
    invalid_date: '无效日期',
    crm_title: '客户 CRM',
    crm_subtitle: '管理客户关系和 RFM 分析',
    btn_refresh: '刷新',
    btn_add_customer: '添加客户',
    search_placeholder: '搜索客户名称或邮箱...',
    filter_all: '全部',
    btn_clear: '清除',
    empty_title: '暂无客户',
    empty_desc: '点击「添加客户」按钮创建你的第一个客户',
    customers_unit: '位客户',
    send_marketing: '发营销',
    marketing_done: '营销已创建',
    marketing_fail: '营销创建失败',
    pager_total: '共 {total} 条记录，第 {page} / {pages} 页',
    aria_prev: '上一页',
    aria_next: '下一页',
    detail_title: '客户详情',
    aria_close: '关闭',
    phone_empty: '未填写',
    btn_view_orders: '查看订单',
    stat_title: '消费统计',
    stat_orders: '累计订单',
    stat_spent: '累计消费',
    stat_last_purchase: '最近购买',
    label_source: '来源',
    label_notes: '备注',
    no_data: '暂无数据',
    rfm_title: 'RFM 客户分层分析',
    rfm_subtitle: '共 {count} 位客户',
    rfm_segments_title: '客户分层分布',
    rfm_segment_count: '{count} 人 ({pct}%)',
    rfm_metrics_title: '各分层 RFM 指标',
    rfm_composite: '综合',
    rfm_avg_spend: '人均消费: {amount}',
    modal_edit_title: '编辑客户',
    modal_add_title: '添加客户',
    label_name: '姓名',
    label_email: '邮箱',
    label_phone: '电话',
    label_source_ph: '例如：门店、网站、抖音...',
    label_tags: '标签',
    label_notes_ph: '备注信息...',
    placeholder_name: '客户姓名',
    placeholder_phone: '手机号码',
    btn_save_changes: '保存修改',
    btn_create_customer: '创建客户',
    delete_title: '确认删除',
    delete_confirm: '确定要删除客户「{name}」吗？',
    delete_desc: '此操作不可撤销，该客户的所有关联数据将被永久删除。',
    btn_confirm_delete: '确认删除',
    tag_vip: 'VIP',
    tag_high_value: '高价值',
    tag_regular: '常客',
    tag_new: '新客',
    tag_at_risk: '流失风险',
    mb_bronze: '铜牌会员',
    mb_silver: '银牌会员',
    mb_gold: '金牌会员',
    mb_diamond: '钻石会员',
    orders_count: '{n} 笔',
    count_people: '人',
  },
  en: {
    page_title: 'Customers',
    err_load_customers: 'Failed to load customers',
    err_required_name: 'Customer name is required',
    err_required_email: 'Email is required',
    err_email_invalid: 'Please enter a valid email address',
    err_op_failed: 'Operation failed',
    pls_retry: 'Please try again later',
    err_load_failed: 'Load failed',
    err_customer_detail: 'Could not load customer details',
    ok_updated: 'Customer updated',
    ok_created: 'Customer created',
    ok_deleted: 'Customer deleted',
    undo: 'Undo',

    restored_msg: 'Restored',
    err_delete_failed: 'Delete failed',
    load_failed_title: 'Load failed',
    btn_retry: 'Retry',
    col_customer: 'Customer',
    col_phone: 'Phone',
    col_tags: 'Tags',
    col_orders: 'Orders',
    col_membership: 'Membership',
    col_last_order: 'Last purchase',
    col_actions: 'Actions',
    btn_edit: 'Edit',
    btn_detail: 'Details',
    aria_delete: 'Delete',
    no_date: 'N/A',
    invalid_date: 'Invalid date',
    crm_title: 'Customer CRM',
    crm_subtitle: 'Manage customer relationships and RFM analysis',
    btn_refresh: 'Refresh',
    btn_add_customer: 'Add customer',
    search_placeholder: 'Search customer name or email...',
    filter_all: 'All',
    btn_clear: 'Clear',
    empty_title: 'No customers',
    empty_desc: 'Click "Add customer" to create your first customer',
    customers_unit: 'customers',
    send_marketing: 'Send',
    marketing_done: 'Marketing created',
    marketing_fail: 'Failed to create',
    pager_total: '{total} records, page {page} / {pages}',
    aria_prev: 'Previous page',
    aria_next: 'Next page',
    detail_title: 'Customer details',
    aria_close: 'Close',
    phone_empty: 'Not provided',
    btn_view_orders: 'View orders',
    stat_title: 'Purchase stats',
    stat_orders: 'Total orders',
    stat_spent: 'Total spent',
    stat_last_purchase: 'Last purchase',
    label_source: 'Source',
    label_notes: 'Notes',
    no_data: 'No data',
    rfm_title: 'RFM Customer Segmentation',
    rfm_subtitle: '{count} customers in total',
    rfm_segments_title: 'Segment distribution',
    rfm_segment_count: '{count} people ({pct}%)',
    rfm_metrics_title: 'RFM metrics by segment',
    rfm_composite: 'Overall',
    rfm_avg_spend: 'Avg spend: {amount}',
    modal_edit_title: 'Edit customer',
    modal_add_title: 'Add customer',
    label_name: 'Name',
    label_email: 'Email',
    label_phone: 'Phone',
    label_source_ph: 'e.g. store, website, Douyin...',
    label_tags: 'Tags',
    label_notes_ph: 'Notes...',
    placeholder_name: 'Customer name',
    placeholder_phone: 'Phone number',
    btn_save_changes: 'Save changes',
    btn_create_customer: 'Create customer',
    delete_title: 'Confirm delete',
    delete_confirm: 'Delete customer "{name}"?',
    delete_desc: 'This cannot be undone. All related data of this customer will be permanently deleted.',
    btn_confirm_delete: 'Delete',
    tag_vip: 'VIP',
    tag_high_value: 'High value',
    tag_regular: 'Regular',
    tag_new: 'New',
    tag_at_risk: 'At risk',
    mb_bronze: 'Bronze',
    mb_silver: 'Silver',
    mb_gold: 'Gold',
    mb_diamond: 'Diamond',
    orders_count: '{n} orders',
    count_people: 'people',
  },
} as Record<Lang, Record<string, string>>;

const getTagConfig = (t: T): Record<CustomerTag, { label: string; variant: 'success' | 'primary' | 'warning' | 'danger' | 'neutral' }> => ({
  vip: { label: t('tag_vip'), variant: 'success' },
  high_value: { label: t('tag_high_value'), variant: 'success' },
  regular: { label: t('tag_regular'), variant: 'primary' },
  new: { label: t('tag_new'), variant: 'warning' },
  at_risk: { label: t('tag_at_risk'), variant: 'danger' },
});

const allTags: CustomerTag[] = ['vip', 'high_value', 'regular', 'new', 'at_risk'];

const formatPrice = (price: number) => `¥${price.toFixed(2)}`;
const formatDate = (dateStr: string | null, t: T) => {
  if (!dateStr) return t('no_date');
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return t('invalid_date');
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const rfmSegmentColors: Record<string, string> = {
  '高价值客户': '#10b981',
  '重要发展客户': '#6366f1',
  '重要保持客户': '#8b5cf6',
  '一般价值客户': '#f59e0b',
  '流失风险客户': '#ef4444',
  '新客户': '#3b82f6',
  '一般客户': '#6b7280',
};

const getMembershipConfig = (t: T): Record<string, { label: string; variant: 'neutral' | 'warning' | 'primary' }> => ({
  bronze: { label: t('mb_bronze'), variant: 'warning' as const },
  silver: { label: t('mb_silver'), variant: 'neutral' as const },
  gold: { label: t('mb_gold'), variant: 'warning' as const },
  diamond: { label: t('mb_diamond'), variant: 'primary' as const },
});

const PAGE_SIZE = 10;

export const Customers: React.FC = () => {
  const t = usePageT(D);
  usePageTitle(t('page_title'));
  const tagCfg = getTagConfig(t);
  const mbCfg = getMembershipConfig(t);
  const { currentWorkspace } = useWorkspace();
  const { addToast } = useToast();
  const { errors: formErrors, setFieldError, clearErrors: clearFormErrors } = useFormErrors();
  const navigate = useNavigate();

  // --- Data states ---
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rfmAnalysis, setRfmAnalysis] = useState<RFMAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Pagination states ---
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // --- Search & filter states ---
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tagFilter, setTagFilter] = useState<CustomerTag | ''>('');

  // --- Detail panel states ---
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [segments, setSegments] = useState<any[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(true);
  const [marketingSeg, setMarketingSeg] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // --- Form states ---
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formTags, setFormTags] = useState<CustomerTag[]>([]);
  const [formNotes, setFormNotes] = useState('');
  const [formSource, setFormSource] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // --- Delete confirmation modal states ---
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ============================================================
  // Search debounce (300ms)
  // ============================================================
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearchQuery(value);
      setPage(1);
    }, 300);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  // ============================================================
  // Fetch customers (paginated)
  // ============================================================
  const fetchCustomers = useCallback(async () => {
    if (!currentWorkspace) { setIsLoading(false); return; }
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {
        page: String(page),
        page_size: String(PAGE_SIZE),
      };
      if (debouncedSearchQuery) params.search = debouncedSearchQuery;
      if (tagFilter) params.tag = tagFilter;

      const data = await customerService.getCustomersPaginated(currentWorkspace.slug, params);
      setCustomers(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
    } catch (err: any) {
      setError(err?.response?.data?.detail || t('err_load_customers'));
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace, debouncedSearchQuery, tagFilter, page]);

  const fetchRFM = useCallback(async () => {
    if (!currentWorkspace) return;
    try {
      const data = await customerService.getRFMAnalysis(currentWorkspace.slug);
      setRfmAnalysis(data);
    } catch {
      // Silently handle
    }
  }, [currentWorkspace]);

  useEffect(() => {
    fetchCustomers();
    loadSegments();
    fetchRFM();
  }, [fetchCustomers, fetchRFM]);

  // ============================================================
  // Reset form
  // ============================================================
  const resetForm = () => {
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormTags([]);
    setFormNotes('');
    setFormSource('');
    clearFormErrors();
  };

  const openCreateModal = () => {
    setEditingCustomer(null);
    resetForm();
    setShowFormModal(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormName(customer.name);
    setFormEmail(customer.email || '');
    setFormPhone(customer.phone || '');
    setFormTags(customer.tags);
    setFormNotes(customer.notes || '');
    setFormSource(customer.source || '');
    clearFormErrors();
    setShowFormModal(true);
  };

  const handleFormSubmit = async () => {
    if (!currentWorkspace) return;
    clearFormErrors();
    let hasError = false;
    if (!formName.trim()) {
      setFieldError('name', t('err_required_name'));
      hasError = true;
    }
    if (!formEmail.trim()) {
      setFieldError('email', t('err_required_email'));
      hasError = true;
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formEmail.trim())) {
        setFieldError('email', t('err_email_invalid'));
        hasError = true;
      }
    }
    if (hasError) return;
    setFormSubmitting(true);
    try {
      const payload = {
        name: formName.trim(),
        email: formEmail.trim(),
        phone: formPhone.trim(),
        tags: formTags,
        notes: formNotes.trim(),
        source: formSource.trim() || undefined,
      };

      if (editingCustomer) {
        await customerService.updateCustomer(currentWorkspace.slug, { id: editingCustomer.id, ...payload });
        addToast('success', t('ok_updated'));
      } else {
        await customerService.createCustomer(currentWorkspace.slug, payload as any);
        addToast('success', t('ok_created'));
      }
      setShowFormModal(false);
      fetchCustomers();
    } catch (err: any) {
      addToast('error', t('err_op_failed'), err?.response?.data?.detail || t('pls_retry'));
    } finally {
      setFormSubmitting(false);
    }
  };

  const toggleFormTag = (tag: CustomerTag) => {
    setFormTags((prev) =>
      prev.includes(tag) ? prev.filter((tt) => tt !== tag) : [...prev, tag]
    );
  };

  // ============================================================
  // Detail panel - fetch full customer data
  // ============================================================
  const openDetail = async (customer: Customer) => {
    if (!currentWorkspace) return;
    setShowDetail(true);
    setDetailLoading(true);
    try {
      const fullData = await customerService.getCustomer(currentWorkspace.slug, customer.id);
      setSelectedCustomer(fullData);
    } catch (err: any) {
      addToast('error', t('err_load_failed'), t('err_customer_detail'));
      setSelectedCustomer(customer); // fallback to list data
    } finally {
      setDetailLoading(false);
    }
  };

  // ============================================================
  // Delete customer
  // ============================================================
  const openDeleteModal = (customer: Customer) => {
    setDeletingCustomer(customer);
    setShowDeleteModal(true);
  };

  const loadSegments = async () => {
    if (!currentWorkspace) return;
    setSegmentsLoading(true);
    try {
      const res: any = await api.get(`/workspaces/${currentWorkspace.slug}/customers/value-segments`);
      setSegments(res.data?.segments || []);
    } catch {
      setSegments([]);
    } finally {
      setSegmentsLoading(false);
    }
  };

  const handleSegmentMarketing = async (segKey: string) => {
    if (!currentWorkspace || marketingSeg) return;
    setMarketingSeg(segKey);
    try {
      const res: any = await api.post(`/workspaces/${currentWorkspace.slug}/customers/value-segments/${segKey}/marketing`, {});
      addToast('success', t('marketing_done'), res.data?.message || '');
    } catch {
      addToast('error', t('marketing_fail'));
    } finally {
      setMarketingSeg(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!currentWorkspace || !deletingCustomer) return;
    setDeleteLoading(true);
    try {
      const snapshot = { ...deletingCustomer };
      await customerService.deleteCustomer(currentWorkspace.slug, deletingCustomer.id);
      addToast('success', t('ok_deleted'), '', {
        label: t('undo'),
        onClick: async () => {
          try {
            const { id, createdAt, updatedAt, total_orders, total_spent, last_order_at, ...rest } = snapshot as any;
            const createData = {
              name: rest.name || '恢复客户',
              email: rest.email || undefined,
              phone: rest.phone || undefined,
            };
            await customerService.createCustomer(currentWorkspace.slug, createData as any);
            addToast('success', t('restored_msg'));
            fetchCustomers();
          } catch { /* 恢复失败静默 */ }
        },
      });
      setShowDeleteModal(false);
      setDeletingCustomer(null);
      // If the deleted customer was shown in detail, close the panel
      if (selectedCustomer?.id === deletingCustomer.id) {
        setShowDetail(false);
        setSelectedCustomer(null);
      }
      fetchCustomers();
    } catch (err: any) {
      addToast('error', t('err_delete_failed'), err?.response?.data?.detail || t('pls_retry'));
    } finally {
      setDeleteLoading(false);
    }
  };

  // ============================================================
  // Navigate to orders filtered by customer
  // ============================================================
  const goToOrders = (customer: Customer) => {
    navigate(`/orders?customer_id=${encodeURIComponent(customer.id)}`);
  };

  // ============================================================
  // Refresh
  // ============================================================
  const handleRefresh = () => {
    fetchCustomers();
    fetchRFM();
  };

  // ============================================================
  // Error state
  // ============================================================
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-red-500 dark:text-red-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">{t('load_failed_title')}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{error}</p>
        <Button variant="outline" className="mt-4" onClick={handleRefresh}>{t('btn_retry')}</Button>
      </div>
    );
  }

  // ============================================================
  // Table columns
  // ============================================================
  const columns = [
    { key: 'name', header: t('col_customer'), render: (c: Customer) => (
      <div className="flex items-center gap-3">
        {c.avatar_url ? (
          <img
            src={c.avatar_url}
            alt={c.name}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-100 to-indigo-100 flex items-center justify-center flex-shrink-0">
            <User size={16} className="text-primary-600" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-gray-100 truncate">{c.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{c.email}</p>
        </div>
      </div>
    )},
    { key: 'phone', header: t('col_phone'), render: (c: Customer) => (
      <span className="text-sm text-gray-600 dark:text-gray-400">{c.phone || '-'}</span>
    )},
    { key: 'tags', header: t('col_tags'), render: (c: Customer) => (
      <div className="flex flex-wrap gap-1">
        {c.tags.map((tag) => {
          const cfg = tagCfg[tag] || { label: tag, variant: 'neutral' as const };
          return <Badge key={tag} variant={cfg.variant}>{cfg.label}</Badge>;
        })}
        {c.tags.length === 0 && <span className="text-xs text-gray-500 dark:text-gray-400">-</span>}
      </div>
    )},
    { key: 'orders', header: t('col_orders'), render: (c: Customer) => (
      <div>
        <p className="text-sm font-medium text-slate-900 dark:text-gray-100">{t('orders_count').replace('{n}', String(c.total_orders))}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{formatPrice(c.total_spent)}</p>
      </div>
    )},
    { key: 'membership', header: t('col_membership'), render: (c: Customer) => {
      const level = c.membership_level || 'bronze';
      const cfg = mbCfg[level] || { label: level, variant: 'neutral' as const };
      return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
    }},
    { key: 'last_order', header: t('col_last_order'), render: (c: Customer) => (
      <span className="text-sm text-gray-600 dark:text-gray-400">{formatDate(c.last_order_at, t)}</span>
    )},
    { key: 'actions', header: t('col_actions'), className: 'text-right', render: (c: Customer) => (
      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={() => openEditModal(c)}>{t('btn_edit')}</Button>
        <Button variant="ghost" size="sm" onClick={() => openDetail(c)}>{t('btn_detail')}</Button>
        <Button variant="ghost" size="sm" onClick={() => openDeleteModal(c)} aria-label={t('aria_delete')}>
          <Trash2 size={14} className="text-red-500 dark:text-red-400" />
        </Button>
      </div>
    )},
  ];

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="space-y-6 animate-fade-in">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-gray-100">{t('crm_title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('crm_subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            leftIcon={<RefreshCw size={16} />}
          >
            {t('btn_refresh')}
          </Button>
          <Button variant="primary" size="sm" onClick={openCreateModal} leftIcon={<User size={16} />}>
            {t('btn_add_customer')}
          </Button>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <Card padding>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder={t('search_placeholder')}
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              leftIcon={<Search size={16} />}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => { setTagFilter(''); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                tagFilter === '' ? 'bg-gray-800 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {t('filter_all')}
            </button>
            {allTags.map((tag) => {
              const cfg = tagCfg[tag];
              return (
                <button
                  key={tag}
                  onClick={() => { setTagFilter(tagFilter === tag ? '' : tag); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                    tagFilter === tag
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>
          {(searchQuery || tagFilter) && (
            <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setDebouncedSearchQuery(''); setTagFilter(''); setPage(1); }}>
              <X size={14} /> {t('btn_clear')}
            </Button>
          )}
        </div>
      </Card>

      {/* 客户列表 + RFM 分析 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={showDetail ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <Card padding={false}>
      {/* 客户价值分层 */}
      {!segmentsLoading && segments.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          {segments.map((seg: any) => (
            <div key={seg.key} className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 hover:shadow-md transition-shadow">
              <p className="text-sm font-bold text-slate-900 dark:text-gray-100">{seg.label}</p>
              <p className="text-2xl font-bold text-primary-600 dark:text-primary-400 mt-1 tabular-nums">{seg.count}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{t('customers_unit')}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={() => handleSegmentMarketing(seg.key)}
                isLoading={marketingSeg === seg.key}
                disabled={seg.count === 0}
                leftIcon={<Send size={12} />}
              >
                {t('send_marketing')}
              </Button>
            </div>
          ))}
        </div>
      )}

            <Table
              columns={columns}
              data={customers}
              keyExtractor={(c) => c.id}
              isLoading={isLoading}
              emptyTitle={t('empty_title')}
              emptyDescription={t('empty_desc')}
            />
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-300 dark:border-gray-600">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {t('pager_total').replace('{total}', String(total)).replace('{page}', String(page)).replace('{pages}', String(totalPages))}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label={t('aria_prev')}
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <Button
                      key={p}
                      variant={p === page ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-label={t('aria_next')}
                  >
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* 客户详情面板 */}
        {showDetail && (
          <div className="lg:col-span-1">
            <Card
              title={t('detail_title')}
              actions={
                <Button variant="ghost" size="sm" onClick={() => { setShowDetail(false); setSelectedCustomer(null); }} aria-label={t('aria_close')}>
                  <X size={16} />
                </Button>
              }
            >
              {detailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw size={24} className="text-gray-500 dark:text-gray-400 animate-spin" />
                </div>
              ) : selectedCustomer ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    {selectedCustomer.avatar_url ? (
                      <img
                        src={selectedCustomer.avatar_url}
                        alt={selectedCustomer.name}
                        className="w-14 h-14 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary-100 to-indigo-100 flex items-center justify-center">
                        <User size={24} className="text-primary-600" />
                      </div>
                    )}
                    <div>
                      <p className="text-lg font-semibold text-slate-900 dark:text-gray-100">{selectedCustomer.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedCustomer.tags.map((tag) => {
                          const cfg = tagCfg[tag] || { label: tag, variant: 'neutral' as const };
                          return <Badge key={tag} variant={cfg.variant}>{cfg.label}</Badge>;
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Mail size={14} className="text-gray-500 dark:text-gray-400" />
                      {selectedCustomer.email}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Phone size={14} className="text-gray-500 dark:text-gray-400" />
                      {selectedCustomer.phone || t('phone_empty')}
                    </div>
                  </div>

                  {/* 查看订单按钮 */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => goToOrders(selectedCustomer)}
                    leftIcon={<ExternalLink size={14} />}
                  >
                    {t('btn_view_orders')}
                  </Button>

                  {/* 消费统计 */}
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('stat_title')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('stat_orders')}</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-gray-100">{selectedCustomer.total_orders}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('stat_spent')}</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-gray-100">{formatPrice(selectedCustomer.total_spent)}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t('stat_last_purchase')}</p>
                      <p className="text-sm text-slate-900 dark:text-gray-100">{formatDate(selectedCustomer.last_order_at, t)}</p>
                    </div>
                  </div>

                  {selectedCustomer.source && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">{t('label_source')}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{selectedCustomer.source}</p>
                    </div>
                  )}

                  {selectedCustomer.notes && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">{t('label_notes')}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{selectedCustomer.notes}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">{t('no_data')}</div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* RFM 分析面板 */}
      {rfmAnalysis && (
        <Card title={t('rfm_title')} subtitle={t('rfm_subtitle').replace('{count}', String(rfmAnalysis.total_customers))}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 分层分布 */}
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('rfm_segments_title')}</p>
              <div className="space-y-3">
                {rfmAnalysis.segments.map((seg) => {
                  const pct = rfmAnalysis.total_customers > 0
                    ? Math.round((seg.customer_count / rfmAnalysis.total_customers) * 100)
                    : 0;
                  const segColor = rfmSegmentColors[seg.segment] || '#6b7280';
                  return (
                    <div key={seg.segment}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: segColor }}
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{seg.segment}</span>
                        </div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {t('rfm_segment_count').replace('{count}', String(seg.customer_count)).replace('{pct}', String(pct))}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: segColor,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 各分层 RFM 指标 */}
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('rfm_metrics_title')}</p>
              <div className="space-y-2">
                {rfmAnalysis.segments.map((seg) => {
                  const segColor = rfmSegmentColors[seg.segment] || '#6b7280';
                  return (
                    <div key={seg.segment} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: segColor }}
                        />
                        <span className="text-sm font-medium text-gray-800">{seg.segment}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">{seg.customer_count} {t('count_people')}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">R</p>
                          <p className="text-sm font-bold text-blue-600">{seg.r_score}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">F</p>
                          <p className="text-sm font-bold text-indigo-600">{seg.f_score}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">M</p>
                          <p className="text-sm font-bold text-purple-600">{seg.m_score}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{t('rfm_composite')}</p>
                          <p className="text-sm font-bold text-gray-800">{seg.rfm_score}</p>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-right">
                        {t('rfm_avg_spend').replace('{amount}', formatPrice(seg.average_total_spent))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ============================================================ */}
      {/* 客户创建/编辑 Modal */}
      {/* ============================================================ */}
      <Modal
        isOpen={showFormModal}
        onClose={() => setShowFormModal(false)}
        title={editingCustomer ? t('modal_edit_title') : t('modal_add_title')}
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('label_name')} placeholder={t('placeholder_name')} value={formName} onChange={(e) => setFormName(e.target.value)} error={formErrors.name} />
            <Input label={t('label_email')} placeholder="customer@example.com" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} error={formErrors.email} />
          </div>
          <Input label={t('label_phone')} placeholder={t('placeholder_phone')} value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
          <Input
            label={t('label_source')}
            placeholder={t('label_source_ph')}
            value={formSource}
            onChange={(e) => setFormSource(e.target.value)}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('label_tags')}</label>
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => {
                const cfg = tagCfg[tag];
                const isSelected = formTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleFormTag(tag)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                      isSelected
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('label_notes')}</label>
            <textarea
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 transition-colors duration-200 resize-none"
              rows={3}
              placeholder={t('label_notes_ph')}
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
            />
          </div>
          <ModalFooter
            onCancel={() => setShowFormModal(false)}
            onConfirm={handleFormSubmit}
            confirmText={editingCustomer ? t('btn_save_changes') : t('btn_create_customer')}
            isLoading={formSubmitting}
          />
        </div>
      </Modal>

      {/* ============================================================ */}
      {/* 删除确认 Modal */}
      {/* ============================================================ */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setDeletingCustomer(null); }}
        title={t('delete_title')}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} className="text-red-500 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-gray-100">
                {t('delete_confirm').replace('{name}', deletingCustomer?.name || '')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {t('delete_desc')}
              </p>
            </div>
          </div>
          <ModalFooter
            onCancel={() => { setShowDeleteModal(false); setDeletingCustomer(null); }}
            onConfirm={handleDeleteConfirm}
            confirmText={t('btn_confirm_delete')}
            confirmVariant="danger"
            isLoading={deleteLoading}
          />
        </div>
      </Modal>
    </div>
  );
};
