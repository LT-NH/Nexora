import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Search,
  X,
  Printer,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  MapPin,
  AlertTriangle,
  Plus,
  RefreshCw,
  Trash2,
  Edit,
  Calendar,
  Truck,
  Save,
  Download,
} from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/components/ui/Toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Table } from '@/components/ui/Table';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { StatsOverview } from '@/components/ecommerce/StatsOverview';
import { orderService } from '@/services/ecommerce';
import type { Order, OrderStatus, OrderStats, PaymentStatus } from '@/types/ecommerce';
import { useSearchParams } from 'react-router-dom';
import { usePageT, type Lang } from '@/i18n';

// ============================================================
// i18n 页面字典
// ============================================================

const D = {
  zh: {
    page_title: '订单管理',
    page_subtitle: '管理和跟踪所有订单',
    export_excel: '导出Excel',
    refresh: '刷新',
    create_order: '创建订单',
    filter_aria: '订单状态筛选',
    search_placeholder: '搜索订单号或客户名称...',
    clear: '清除',
    invalid_date: '无效日期',
    load_failed: '加载失败',
    retry: '重试',
    err_load_orders: '加载订单列表失败',
    err_load_detail: '加载订单详情失败',
    pls_retry: '请稍后重试',
    status_updated: '状态已更新',
    update_failed: '更新失败',
    add_items_warn: '请添加商品',
    add_items_desc: '至少需要一个订单行项目。',
    qty_invalid: '数量无效',
    qty_error: '{name} 的数量必须大于 0。',
    price_invalid: '价格无效',
    price_error: '{name} 的单价不能为负数。',
    order_created: '订单已创建',
    create_failed: '创建失败',
    order_updated: '订单已更新',
    tracking_saved: '物流信息已保存',
    save_failed: '保存失败',
    order_deleted: '订单已删除',
    order_deleted_msg: '订单 {num} 已移除',
    undo: '撤销',
    restored: '已恢复',
    order_restored_msg: '订单 {num} 已恢复',
    restore_failed: '恢复失败',
    restore_manual: '请手动重新创建订单',
    delete_failed: '删除失败',
    batch_updated_msg: '已批量更新 {n} 个订单为「{status}」',
    batch_update_failed: '批量更新失败',
    batch_deleted_msg: '已删除 {n} 个订单',
    batch_restored_msg: '{n} 个订单已恢复',
    batch_restore_failed: '部分订单恢复失败，请手动重新创建',
    batch_delete_failed: '批量删除失败',
    batch_delete_partial: '部分订单删除失败',
    batch_print: '批量打单',
    print: '打印',
    print_card: '发货单',
    print_receiver: '收货人',
    print_address: '地址',
    print_items: '商品',
    print_total: '金额',
    print_date: '日期',
    st_pending: '待确认',
    st_confirmed: '已确认',
    st_processing: '处理中',
    st_shipped: '已发货',
    st_delivered: '已签收',
    st_cancelled: '已取消',
    st_refunded: '已退款',
    pay_paid: '已支付',
    pay_unpaid: '未支付',
    pay_refunded: '已退款',
    pay_partially: '部分退款',
    tab_all: '全部',
    col_order_number: '订单号',
    col_customer: '客户',
    col_items: '商品',
    col_total: '金额',
    col_status: '状态',
    col_payment: '支付',
    col_source: '来源',
    col_actions: '操作',
    detail: '详情',
    items_count: '{n} 件商品',
    selected_count: '已选择 {n} 个订单',
    batch_change: '批量修改状态...',
    mark_confirmed: '标记为已确认',
    mark_processing: '标记为处理中',
    mark_shipped: '标记为已发货',
    mark_delivered: '标记为已签收',
    cancel_order: '取消订单',
    deselect: '取消选择',
    batch_delete: '批量删除',
    empty_orders: '暂无订单',
    empty_orders_desc: '还没有任何订单记录',
    total_pages: '共 {total} 条，第 {page}/{totalPages} 页',
    detail_title: '订单 {num}',
    order_detail: '订单详情',
    edit_order_aria: '编辑订单',
    delete_order_aria: '删除订单',
    close_panel_aria: '关闭详情面板',
    customer_info: '客户信息',
    shipping_addr: '收货地址',
    notes: '备注',
    items_detail: '商品明细',
    subtotal: '小计',
    discount: '优惠',
    shipping_fee: '运费',
    total: '合计',
    order_status: '订单状态',
    tracking: '物流追踪',
    placed: '已下单',
    no_tracking: '暂无物流信息',
    carrier: '物流公司',
    carrier_placeholder: '如：顺丰、圆通',
    tracking_no: '物流单号',
    save: '保存',
    cancel: '取消',
    edit_tracking: '编辑物流信息',
    actions: '操作',
    mark_as: '标记为「{status}」',
    no_order_detail: '暂无订单详情',
    auto_gen: '自动生成',
    customer_id: '客户ID',
    optional: '可选',
    customer_name: '客户名称',
    customer_email: '客户邮箱',
    payment_status: '支付状态',
    platform: '平台',
    platform_placeholder: '例如: 淘宝、京东',
    notes_placeholder: '订单备注...',
    amount_info: '金额信息',
    tax: '税费',
    receiver: '收件人',
    name_placeholder: '姓名',
    phone: '电话',
    phone_placeholder: '手机号',
    province: '省份',
    province_placeholder: '省',
    city: '城市',
    city_placeholder: '市',
    district: '区/县',
    district_placeholder: '区',
    zip_code: '邮编',
    zip_placeholder: '邮编',
    detail_addr: '详细地址',
    addr_placeholder: '街道、门牌号',
    add: '添加',
    product_name_label: '商品名称',
    product_name_placeholder: '商品名',
    qty: '数量',
    unit_price: '单价',
    subtotal_auto: '小计（自动计算或手动输入）',
    confirm_create: '创建订单',
    edit_order_title: '编辑订单',
    save_changes: '保存修改',
    delete_order_title: '删除订单',
    confirm_delete_question: '确定要删除订单 {num} 吗？',
    irreversible: '此操作不可撤销',
    confirm_delete: '确认删除',
  },
  en: {
    page_title: 'Orders',
    page_subtitle: 'Manage and track all orders',
    export_excel: 'Export Excel',
    refresh: 'Refresh',
    create_order: 'Create order',
    filter_aria: 'Filter by order status',
    search_placeholder: 'Search by order number or customer name...',
    clear: 'Clear',
    invalid_date: 'Invalid date',
    load_failed: 'Failed to load',
    retry: 'Retry',
    err_load_orders: 'Failed to load orders',
    err_load_detail: 'Failed to load order details',
    pls_retry: 'Please try again later',
    status_updated: 'Status updated',
    update_failed: 'Update failed',
    add_items_warn: 'Please add at least one item',
    add_items_desc: 'At least one line item is required.',
    qty_invalid: 'Invalid quantity',
    qty_error: 'Quantity for {name} must be greater than 0.',
    price_invalid: 'Invalid price',
    price_error: 'Unit price for {name} cannot be negative.',
    order_created: 'Order created',
    create_failed: 'Create failed',
    order_updated: 'Order updated',
    tracking_saved: 'Shipping info saved',
    save_failed: 'Save failed',
    order_deleted: 'Order deleted',
    order_deleted_msg: 'Order {num} removed',
    undo: 'Undo',
    restored: 'Restored',
    order_restored_msg: 'Order {num} restored',
    restore_failed: 'Restore failed',
    restore_manual: 'Please recreate the order manually',
    delete_failed: 'Delete failed',
    batch_updated_msg: 'Updated {n} orders to {status}',
    batch_update_failed: 'Batch update failed',
    batch_deleted_msg: 'Deleted {n} orders',
    batch_restored_msg: '{n} orders restored',
    batch_restore_failed: 'Some orders failed to restore. Please recreate them manually',
    batch_delete_failed: 'Batch delete failed',
    batch_delete_partial: 'Some orders failed to delete',
    st_pending: 'Pending',
    st_confirmed: 'Confirmed',
    st_processing: 'Processing',
    st_shipped: 'Shipped',
    st_delivered: 'Delivered',
    st_cancelled: 'Cancelled',
    st_refunded: 'Refunded',
    pay_paid: 'Paid',
    pay_unpaid: 'Unpaid',
    pay_refunded: 'Refunded',
    pay_partially: 'Partially refunded',
    tab_all: 'All',
    col_order_number: 'Order No.',
    col_customer: 'Customer',
    col_items: 'Items',
    col_total: 'Total',
    col_status: 'Status',
    col_payment: 'Payment',
    col_source: 'Source',
    col_actions: 'Actions',
    detail: 'Details',
    items_count: '{n} items',
    selected_count: '{n} orders selected',
    batch_change: 'Change status...',
    mark_confirmed: 'Mark as confirmed',
    mark_processing: 'Mark as processing',
    mark_shipped: 'Mark as shipped',
    mark_delivered: 'Mark as delivered',
    cancel_order: 'Cancel order',
    deselect: 'Deselect',
    batch_delete: 'Batch delete',
    empty_orders: 'No orders yet',
    empty_orders_desc: 'There are no order records yet',
    total_pages: '{total} total, page {page}/{totalPages}',
    detail_title: 'Order {num}',
    order_detail: 'Order details',
    edit_order_aria: 'Edit order',
    delete_order_aria: 'Delete order',
    close_panel_aria: 'Close details panel',
    customer_info: 'Customer info',
    shipping_addr: 'Shipping address',
    notes: 'Notes',
    items_detail: 'Items',
    subtotal: 'Subtotal',
    discount: 'Discount',
    shipping_fee: 'Shipping',
    total: 'Total',
    order_status: 'Status',
    tracking: 'Tracking',
    placed: 'Ordered',
    no_tracking: 'No tracking info',
    carrier: 'Carrier',
    carrier_placeholder: 'e.g. SF Express, YTO',
    tracking_no: 'Tracking number',
    save: 'Save',
    cancel: 'Cancel',
    edit_tracking: 'Edit shipping info',
    actions: 'Actions',
    mark_as: 'Mark as {status}',
    no_order_detail: 'No order details',
    auto_gen: 'Auto-generated',
    customer_id: 'Customer ID',
    optional: 'Optional',
    customer_name: 'Customer name',
    customer_email: 'Customer email',
    payment_status: 'Payment status',
    platform: 'Platform',
    platform_placeholder: 'e.g. Taobao, JD',
    notes_placeholder: 'Order notes...',
    amount_info: 'Amount',
    tax: 'Tax',
    receiver: 'Recipient',
    name_placeholder: 'Name',
    phone: 'Phone',
    phone_placeholder: 'Phone number',
    province: 'Province',
    province_placeholder: 'Province',
    city: 'City',
    city_placeholder: 'City',
    district: 'District',
    district_placeholder: 'District',
    zip_code: 'ZIP',
    zip_placeholder: 'ZIP code',
    detail_addr: 'Detailed address',
    addr_placeholder: 'Street, building no.',
    add: 'Add',
    product_name_label: 'Product name',
    product_name_placeholder: 'Product name',
    qty: 'Qty',
    unit_price: 'Unit price',
    subtotal_auto: 'Subtotal (auto or manual)',
    confirm_create: 'Create order',
    edit_order_title: 'Edit order',
    save_changes: 'Save changes',
    delete_order_title: 'Delete order',
    confirm_delete_question: 'Delete order {num}?',
    irreversible: 'This action cannot be undone',
    confirm_delete: 'Delete',
  },
} as Record<Lang, Record<string, string>>;

type T = (key: string, fallback?: string) => string;

// ============================================================
// 常量配置
// ============================================================

const getStatusConfig = (t: T): Record<OrderStatus, { label: string; variant: 'warning' | 'primary' | 'success' | 'danger' | 'neutral' }> => ({
  pending: { label: t('st_pending'), variant: 'warning' },
  confirmed: { label: t('st_confirmed'), variant: 'primary' },
  processing: { label: t('st_processing'), variant: 'primary' },
  shipped: { label: t('st_shipped'), variant: 'success' },
  delivered: { label: t('st_delivered'), variant: 'success' },
  cancelled: { label: t('st_cancelled'), variant: 'danger' },
  refunded: { label: t('st_refunded'), variant: 'neutral' },
});

const getPaymentStatusConfig = (t: T): Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }> => ({
  paid: { label: t('pay_paid'), variant: 'success' },
  unpaid: { label: t('pay_unpaid'), variant: 'warning' },
  refunded: { label: t('pay_refunded'), variant: 'neutral' },
  partially_refunded: { label: t('pay_partially'), variant: 'neutral' },
});

const getStatusTabs = (t: T): { key: string; label: string }[] => [
  { key: '', label: t('tab_all') },
  { key: 'pending', label: t('st_pending') },
  { key: 'confirmed', label: t('st_confirmed') },
  { key: 'processing', label: t('st_processing') },
  { key: 'shipped', label: t('st_shipped') },
  { key: 'delivered', label: t('st_delivered') },
  { key: 'cancelled', label: t('st_cancelled') },
  { key: 'refunded', label: t('st_refunded') },
];

const statusFlow: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];

const allStatuses: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
const allPaymentStatuses: PaymentStatus[] = ['unpaid', 'paid', 'refunded', 'partially_refunded'];

const formatPrice = (price: number) => `¥${price.toFixed(2)}`;
const formatDate = (dateStr: string, t: T) => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return t('invalid_date');
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

// ============================================================
// 表单类型定义
// ============================================================

interface LineItemForm {
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface CreateOrderForm {
  order_number: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  platform: string;
  notes: string;
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
  shipping_address: Record<string, string>;
  items: LineItemForm[];
}

interface EditOrderForm {
  notes: string;
  payment_status: PaymentStatus;
  shipping_address: Record<string, string>;
}

const emptyCreateForm: CreateOrderForm = {
  order_number: '',
  customer_id: '',
  customer_name: '',
  customer_email: '',
  status: 'pending',
  payment_status: 'unpaid',
  platform: '',
  notes: '',
  subtotal: 0,
  tax: 0,
  shipping: 0,
  discount: 0,
  total: 0,
  shipping_address: { name: '', phone: '', province: '', city: '', district: '', detail: '', zip_code: '' },
  items: [{ product_name: '', sku: '', quantity: 1, unit_price: 0, total_price: 0 }],
};

const emptyEditForm: EditOrderForm = {
  notes: '',
  payment_status: 'unpaid',
  shipping_address: { name: '', phone: '', province: '', city: '', district: '', detail: '', zip_code: '' },
};

const PAGE_SIZE = 20;

// ============================================================
// 主组件
// ============================================================

export const Orders: React.FC = () => {
  const t = usePageT(D);
  usePageTitle(t('page_title'));
  const statusConfig = getStatusConfig(t);
  const paymentStatusConfig = getPaymentStatusConfig(t);
  const statusTabs = getStatusTabs(t);
  const { currentWorkspace } = useWorkspace();
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();

  // ---------- 数据状态 ----------
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---------- 筛选状态 ----------
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ---------- 分页 ----------
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // ---------- 详情面板 ----------
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // ---------- 模态框状态 ----------
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateOrderForm>(emptyCreateForm);
  const [editForm, setEditForm] = useState<EditOrderForm>(emptyEditForm);
  const [createLoading, setCreateLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editTracking, setEditTracking] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingLoading, setTrackingLoading] = useState(false);

  // ---------- 排序 ----------
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);

  // ---------- 批量选择 ----------
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPrint, setShowPrint] = useState(false);
  const [printOrders, setPrintOrders] = useState<any[]>([]);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  // ---------- 搜索防抖 ----------
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  // ---------- 数据获取 ----------
  const fetchOrders = useCallback(async () => {
    if (!currentWorkspace) { setIsLoading(false); return; }
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {
        page: String(page),
        page_size: String(PAGE_SIZE),
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter) params.status = statusFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const customerId = searchParams.get('customer_id');
      if (customerId) params.customer_id = customerId;
      const result = await orderService.getOrdersPaginated(currentWorkspace.slug, params);
      setOrders(result.items);
      setTotal(result.total);
      setTotalPages(result.total_pages);
    } catch (err: any) {
      setError(err?.response?.data?.detail || t('err_load_orders'));
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace, debouncedSearch, statusFilter, dateFrom, dateTo, page, searchParams]);

  const fetchStats = useCallback(async () => {
    if (!currentWorkspace) { setStatsLoading(false); return; }
    setStatsLoading(true);
    try {
      const data = await orderService.getOrderStats(currentWorkspace.slug);
      setStats(data);
    } catch {
      // Silently handle
    } finally {
      setStatsLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    fetchOrders();
    fetchStats();
  }, [fetchOrders, fetchStats]);

  // ---------- 订单详情 ----------
  const fetchOrderDetail = useCallback(async (orderId: string) => {
    if (!currentWorkspace) return;
    setDetailLoading(true);
    try {
      const data = await orderService.getOrder(currentWorkspace.slug, orderId);
      setSelectedOrder(data);
      setTrackingNumber(data.tracking_number || '');
      setCarrier(data.carrier || '');
    } catch (err: any) {
      addToast('error', t('err_load_detail'), err?.response?.data?.detail || t('pls_retry'));
    } finally {
      setDetailLoading(false);
    }
  }, [currentWorkspace, addToast]);

  const openDetail = (order: Order) => {
    setSelectedOrder(order);
    setShowDetail(true);
    setEditTracking(false);
    setTrackingNumber(order.tracking_number || '');
    setCarrier(order.carrier || '');
    fetchOrderDetail(order.id);
  };

  // ---------- 状态变更 ----------
  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    if (!currentWorkspace) return;
    try {
      await orderService.updateOrderStatus(currentWorkspace.slug, orderId, newStatus);
      addToast('success', t('status_updated'));
      fetchOrders();
      if (selectedOrder?.id === orderId) {
        fetchOrderDetail(orderId);
      }
    } catch (err: any) {
      addToast('error', t('update_failed'), err?.response?.data?.detail || t('pls_retry'));
    }
  };

  // ---------- 创建订单 ----------
  const handleCreateOrder = async () => {
    if (!currentWorkspace) return;
    const validItems = createForm.items.filter((item) => item.product_name.trim());
    if (validItems.length === 0) {
      addToast('warning', t('add_items_warn'), t('add_items_desc'));
      return;
    }
    for (const item of validItems) {
      if (item.quantity < 1) {
        addToast('warning', t('qty_invalid'), t('qty_error').replace('{name}', item.product_name));
        return;
      }
      if (item.unit_price < 0) {
        addToast('warning', t('price_invalid'), t('price_error').replace('{name}', item.product_name));
        return;
      }
    }
    setCreateLoading(true);
    try {
      const itemsTotal = createForm.items
        .filter((item) => item.product_name)
        .reduce((sum, item) => sum + (item.total_price || item.quantity * item.unit_price), 0);

      const payload = {
        order_number: createForm.order_number || undefined,
        customer_id: createForm.customer_id || undefined,
        customer_name: createForm.customer_name || undefined,
        customer_email: createForm.customer_email || undefined,
        status: createForm.status,
        payment_status: createForm.payment_status,
        platform: createForm.platform || undefined,
        notes: createForm.notes || undefined,
        subtotal: createForm.subtotal || itemsTotal,
        tax: createForm.tax || 0,
        shipping: createForm.shipping || 0,
        discount: createForm.discount || 0,
        total: createForm.total || itemsTotal,
        shipping_address: createForm.shipping_address.name
          ? createForm.shipping_address
          : undefined,
        items: createForm.items
          .filter((item) => item.product_name)
          .map((item) => ({
            product_id: undefined,
            variant_id: undefined,
            product_name: item.product_name,
            sku: item.sku || undefined,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.total_price || item.quantity * item.unit_price,
          })),
      };
      await orderService.createOrder(currentWorkspace.slug, payload as any);
      addToast('success', t('order_created'));
      setShowCreateModal(false);
      setCreateForm(emptyCreateForm);
      fetchOrders();
    } catch (err: any) {
      addToast('error', t('create_failed'), err?.response?.data?.detail || t('pls_retry'));
    } finally {
      setCreateLoading(false);
    }
  };

  // ---------- 编辑订单 ----------
  const openEditModal = () => {
    if (!selectedOrder) return;
    setEditForm({
      notes: selectedOrder.notes || '',
      payment_status: selectedOrder.payment_status,
      shipping_address: selectedOrder.shipping_address || {
        name: '', phone: '', province: '', city: '', district: '', detail: '', zip_code: '',
      },
    });
    setShowEditModal(true);
  };

  const handleEditOrder = async () => {
    if (!currentWorkspace || !selectedOrder) return;
    setEditLoading(true);
    try {
      const payload = {
        notes: editForm.notes || undefined,
        payment_status: editForm.payment_status,
        shipping_address: editForm.shipping_address.name
          ? editForm.shipping_address
          : undefined,
      };
      await orderService.updateOrder(currentWorkspace.slug, selectedOrder.id, payload as any);
      addToast('success', t('order_updated'));
      setShowEditModal(false);
      fetchOrders();
      fetchOrderDetail(selectedOrder.id);
    } catch (err: any) {
      addToast('error', t('update_failed'), err?.response?.data?.detail || t('pls_retry'));
    } finally {
      setEditLoading(false);
    }
  };

  // ---------- 物流追踪 ----------
  const handleSaveTracking = async () => {
    if (!currentWorkspace || !selectedOrder) return;
    setTrackingLoading(true);
    try {
      await orderService.updateOrder(currentWorkspace.slug, selectedOrder.id, {
        tracking_number: trackingNumber || undefined,
        carrier: carrier || undefined,
      } as any);
      addToast('success', t('tracking_saved'));
      setEditTracking(false);
      fetchOrderDetail(selectedOrder.id);
    } catch (err: any) {
      addToast('error', t('save_failed'), err?.response?.data?.detail || t('pls_retry'));
    } finally {
      setTrackingLoading(false);
    }
  };

  // ---------- 删除订单 ----------
  const handleDeleteOrder = async () => {
    if (!currentWorkspace || !selectedOrder) return;
    setDeleteLoading(true);
    try {
      // Save order data for potential undo
      const deletedOrder = { ...selectedOrder };
      await orderService.deleteOrder(currentWorkspace.slug, selectedOrder.id);
      addToast('success', t('order_deleted'), t('order_deleted_msg').replace('{num}', selectedOrder.order_number), {
        label: t('undo'),
        onClick: async () => {
          try {
            // Re-create the order with saved data
            const restorePayload = {
              order_number: deletedOrder.order_number,
              customer_id: deletedOrder.customer_id || undefined,
              customer_name: deletedOrder.customer_name || undefined,
              customer_email: deletedOrder.customer_email || undefined,
              status: deletedOrder.status,
              payment_status: deletedOrder.payment_status,
              platform: deletedOrder.platform || undefined,
              notes: deletedOrder.notes || undefined,
              subtotal: deletedOrder.subtotal,
              tax: deletedOrder.tax,
              shipping: deletedOrder.shipping,
              discount: deletedOrder.discount,
              total: deletedOrder.total,
              shipping_address: deletedOrder.shipping_address || undefined,
              items: (deletedOrder.items || []).map((item) => ({
                product_name: item.product_name,
                sku: item.sku || undefined,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total_price: item.total_price,
              })),
            };
            await orderService.createOrder(currentWorkspace.slug, restorePayload as any);
            addToast('success', t('restored'), t('order_restored_msg').replace('{num}', deletedOrder.order_number));
            fetchOrders();
          } catch {
            addToast('error', t('restore_failed'), t('restore_manual'));
          }
        },
      });
      setShowDeleteModal(false);
      setShowDetail(false);
      setSelectedOrder(null);
      fetchOrders();
    } catch (err: any) {
      addToast('error', t('delete_failed'), err?.response?.data?.detail || t('pls_retry'));
    } finally {
      setDeleteLoading(false);
    }
  };

  // ---------- 行项目操作 ----------
  const addLineItem = () => {
    setCreateForm((prev) => ({
      ...prev,
      items: [...prev.items, { product_name: '', sku: '', quantity: 1, unit_price: 0, total_price: 0 }],
    }));
  };

  const removeLineItem = (index: number) => {
    if (createForm.items.length <= 1) return;
    setCreateForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const updateLineItem = (index: number, field: keyof LineItemForm, value: string | number) => {
    setCreateForm((prev) => {
      const newItems = [...prev.items];
      const item = { ...newItems[index] };
      if (field === 'quantity' || field === 'unit_price') {
        item[field] = Number(value) || 0;
        item.total_price = item.quantity * item.unit_price;
      } else if (field === 'total_price') {
        item.total_price = Number(value) || 0;
      } else {
        (item as any)[field] = value;
      }
      newItems[index] = item;
      return { ...prev, items: newItems };
    });
  };

  // ---------- 分页导航 ----------
  const goToPage = (p: number) => {
    if (p >= 1 && p <= totalPages) setPage(p);
  };

  // ---------- 状态流转计算 ----------
  const currentStepIndex = selectedOrder ? statusFlow.indexOf(selectedOrder.status) : -1;
  const isTerminalStatus = selectedOrder
    ? selectedOrder.status === 'cancelled' || selectedOrder.status === 'refunded'
    : false;

  // ---------- 可推进的状态 ----------
  const getNextStatuses = (current: OrderStatus): OrderStatus[] => {
    const idx = statusFlow.indexOf(current);
    if (idx < 0) return [];
    const next = statusFlow[idx + 1];
    if (!next) return [];
    return [next];
  };

  // ---------- 批量状态变更 ----------
  const handleBatchStatusChange = async (newStatus: OrderStatus) => {
    if (!currentWorkspace || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map((id) => orderService.updateOrderStatus(currentWorkspace.slug, id, newStatus)));
      addToast('success', t('batch_updated_msg')
        .replace('{n}', String(ids.length))
        .replace('{status}', statusConfig[newStatus].label));
      setSelectedIds(new Set());
      fetchOrders();
    } catch (err: any) {
      addToast('error', t('batch_update_failed'), err?.response?.data?.detail || t('pls_retry'));
    }
  };

  // ---------- 批量删除 ----------
  const handleBatchPrint = () => {
    const sel = orders.filter((o: any) => selectedIds.has(o.id));
    if (sel.length === 0) return;
    setPrintOrders(sel);
    setShowPrint(true);
  };

  const handleBatchDelete = async () => {
    if (!currentWorkspace || selectedIds.size === 0) return;
    setIsBatchDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      // Save deleted orders for potential undo
      const deletedOrders = orders.filter((o) => ids.includes(o.id));
      await Promise.all(ids.map((id) => orderService.deleteOrder(currentWorkspace.slug, id)));
      addToast('success', t('batch_deleted_msg').replace('{n}', String(ids.length)), undefined, {
        label: t('undo'),
        onClick: async () => {
          try {
            await Promise.all(deletedOrders.map((o) => {
              const restorePayload = {
                order_number: o.order_number,
                customer_id: o.customer_id || undefined,
                customer_name: o.customer_name || undefined,
                customer_email: o.customer_email || undefined,
                status: o.status,
                payment_status: o.payment_status,
                platform: o.platform || undefined,
                notes: o.notes || undefined,
                subtotal: o.subtotal,
                tax: o.tax,
                shipping: o.shipping,
                discount: o.discount,
                total: o.total,
                shipping_address: o.shipping_address || undefined,
                items: (o.items || []).map((item) => ({
                  product_name: item.product_name,
                  sku: item.sku || undefined,
                  quantity: item.quantity,
                  unit_price: item.unit_price,
                  total_price: item.total_price,
                })),
              };
              return orderService.createOrder(currentWorkspace.slug, restorePayload as any);
            }));
            addToast('success', t('restored'), t('batch_restored_msg').replace('{n}', String(deletedOrders.length)));
            fetchOrders();
          } catch {
            addToast('error', t('restore_failed'), t('batch_restore_failed'));
          }
        },
      });
      setSelectedIds(new Set());
      fetchOrders();
    } catch (err: any) {
      addToast('error', t('batch_delete_failed'), err?.response?.data?.detail || t('batch_delete_partial'));
    } finally {
      setIsBatchDeleting(false);
    }
  };

  // ---------- 错误状态 ----------
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-red-500 dark:text-red-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">{t('load_failed')}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{error}</p>
        <Button variant="outline" className="mt-4" onClick={fetchOrders}>{t('retry')}</Button>
      </div>
    );
  }

  // ============================================================
  // 排序逻辑
  // ============================================================
  const handleSort = (key: string, direction: 'asc' | 'desc' | null) => {
    setSortKey(direction ? key : null);
    setSortDirection(direction);
  };

  const sortedOrders = useMemo(() => {
    if (!sortKey || !sortDirection) return orders;
    const sorted = [...orders];
    sorted.sort((a: any, b: any) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortDirection === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
    return sorted;
  }, [orders, sortKey, sortDirection]);

  // ============================================================
  // 表格列定义
  // ============================================================
  const columns = [
    {
      key: 'order_number',
      header: t('col_order_number'),
      sortable: true,
      render: (o: Order) => (
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-gray-100">{o.order_number}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(o.created_at, t)}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: t('col_customer'),
      render: (o: Order) => (
        <div>
          <p className="text-sm text-slate-900 dark:text-gray-100">{o.customer_name || o.customer_id || '-'}</p>
          {o.customer_email && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{o.customer_email}</p>
          )}
        </div>
      ),
    },
    {
      key: 'items',
      header: t('col_items'),
      render: (o: Order) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">{t('items_count').replace('{n}', String(o.items?.length ?? 0))}</span>
      ),
    },
    {
      key: 'total',
      header: t('col_total'),
      sortable: true,
      render: (o: Order) => (
        <span className="text-sm font-semibold text-slate-900 dark:text-gray-100">{formatPrice(o.total)}</span>
      ),
    },
    {
      key: 'status',
      header: t('col_status'),
      sortable: true,
      render: (o: Order) => {
        const s = statusConfig[o.status] || { label: o.status, variant: 'neutral' as const };
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      key: 'payment',
      header: t('col_payment'),
      render: (o: Order) => {
        const p = paymentStatusConfig[o.payment_status] || { label: o.payment_status, variant: 'neutral' as const };
        return <Badge variant={p.variant}>{p.label}</Badge>;
      },
    },
    {
      key: 'store',
      header: t('col_source'),
      render: (o: Order) => (
        <span className="text-sm text-gray-500 dark:text-gray-400">{o.platform || '-'}</span>
      ),
    },
    {
      key: 'actions',
      header: t('col_actions'),
      className: 'text-right',
      render: (o: Order) => (
        <Button variant="ghost" size="sm" onClick={() => openDetail(o)}>
          {t('detail')}
        </Button>
      ),
    },
  ];

  // ============================================================
  // 渲染
  // ============================================================
  return (
    <div className="space-y-6 animate-fade-in">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('page_title')}</h2>
          <p className="mt-1 text-sm text-gray-500">{t('page_subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/v1/workspaces/${currentWorkspace?.slug}/export/orders`}
            download
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" leftIcon={<Download size={16} />}>
              {t('export_excel')}
            </Button>
          </a>
          <Button variant="outline" size="sm" onClick={fetchOrders} isLoading={isLoading}>
            <RefreshCw size={14} className="mr-1" />
            {t('refresh')}
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus size={14} className="mr-1" />
            {t('create_order')}
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <StatsOverview stats={stats} isLoading={statsLoading} />

      {/* 状态筛选 Tabs */}
      <Card padding>
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label={t('filter_aria')}>
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setStatusFilter(tab.key);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                statusFilter === tab.key
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              role="tab"
              aria-selected={statusFilter === tab.key}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </Card>

      {/* 搜索栏 + 日期筛选 */}
      <Card padding>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1 w-full">
            <Input
              placeholder={t('search_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search size={16} />}
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Calendar size={14} className="text-gray-500 flex-shrink-0" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              />
              <span className="text-xs text-gray-500">-</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            {(dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
              >
                <X size={14} /> {t('clear')}
              </Button>
            )}
          </div>
          {searchQuery && (
            <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')}>
              <X size={14} /> {t('clear')}
            </Button>
          )}
        </div>
      </Card>

      {/* 订单列表 + 详情面板 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={showDetail ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <Card padding={false}>
            {/* Batch Action Bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 bg-primary-50 dark:bg-primary-900/20 border-b border-primary-200 dark:border-primary-800 animate-fade-in">
                <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
                  {t('selected_count').replace('{n}', String(selectedIds.size))}
                </span>
                <div className="flex items-center gap-2">
                  <select
                    className="text-xs border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) handleBatchStatusChange(e.target.value as OrderStatus);
                      e.target.value = '';
                    }}
                  >
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBatchPrint}
                    leftIcon={<Printer size={13} />}
                  >
                    {t('batch_print')}
                  </Button>
                    <option value="">{t('batch_change')}</option>
                    <option value="confirmed">{t('mark_confirmed')}</option>
                    <option value="processing">{t('mark_processing')}</option>
                    <option value="shipped">{t('mark_shipped')}</option>
                    <option value="delivered">{t('mark_delivered')}</option>
                    <option value="cancelled">{t('cancel_order')}</option>
                  </select>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    {t('deselect')}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleBatchDelete}
                    isLoading={isBatchDeleting}
                    leftIcon={<Trash2 size={14} />}
                  >
                    {t('batch_delete')}
                  </Button>
                </div>
              </div>
            )}
            <Table
              columns={columns}
              data={sortedOrders}
              keyExtractor={(o) => o.id}
              isLoading={isLoading}
              emptyTitle={t('empty_orders')}
              emptyDescription={t('empty_orders_desc')}
              onSort={handleSort}
              selectable
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
            />
            {/* 分页 */}
            {totalPages > 1 && !isLoading && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
                <span className="text-sm text-gray-500">
                  {t('total_pages')
                    .replace('{total}', String(total))
                    .replace('{page}', String(page))
                    .replace('{totalPages}', String(totalPages))}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => goToPage(page - 1)}
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={pageNum === page ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => goToPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => goToPage(page + 1)}
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* 订单详情面板 */}
        {showDetail && (
          <div className="lg:col-span-1">
            <Card
              title={selectedOrder ? t('detail_title').replace('{num}', selectedOrder.order_number) : t('order_detail')}
              actions={
                <div className="flex items-center gap-1">
                  {selectedOrder && !isTerminalStatus && (
                    <>
                      <Button variant="ghost" size="sm" onClick={openEditModal} aria-label={t('edit_order_aria')}>
                        <Edit size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDeleteModal(true)}
                        aria-label={t('delete_order_aria')}
                      >
                        <Trash2 size={14} className="text-red-500" />
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setShowDetail(false)} aria-label={t('close_panel_aria')}>
                    <X size={16} />
                  </Button>
                </div>
              }
            >
              {detailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full" />
                </div>
              ) : selectedOrder ? (
                <div className="space-y-4">
                  {/* 客户信息 */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-2">{t('customer_info')}</p>
                    <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                      <p className="text-sm font-medium text-slate-900">
                        {selectedOrder.customer_name || selectedOrder.customer_id || '-'}
                      </p>
                      {selectedOrder.customer_email && (
                        <p className="text-xs text-gray-500">{selectedOrder.customer_email}</p>
                      )}
                    </div>
                  </div>

                  {/* 地址信息 */}
                  {selectedOrder.shipping_address && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2">{t('shipping_addr')}</p>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <MapPin size={14} className="text-gray-500 mt-0.5 flex-shrink-0" />
                          <div className="text-xs text-gray-600">
                            <p className="font-medium text-slate-900">
                              {selectedOrder.shipping_address.name} {selectedOrder.shipping_address.phone}
                            </p>
                            <p>
                              {selectedOrder.shipping_address.province}{' '}
                              {selectedOrder.shipping_address.city}{' '}
                              {selectedOrder.shipping_address.district}
                            </p>
                            <p>{selectedOrder.shipping_address.detail}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 备注 */}
                  {selectedOrder.notes && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2">{t('notes')}</p>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-600">{selectedOrder.notes}</p>
                      </div>
                    </div>
                  )}

                  {/* 订单商品 */}
                  {selectedOrder.items && selectedOrder.items.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2">{t('items_detail')}</p>
                      <div className="space-y-2">
                        {selectedOrder.items.map((item) => (
                          <div key={item.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                            <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center flex-shrink-0">
                              <ShoppingBag size={16} className="text-gray-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-900 truncate">{item.product_name}</p>
                              <p className="text-xs text-gray-500">
                                {formatPrice(item.unit_price)} x {item.quantity}
                              </p>
                            </div>
                            <span className="text-sm font-medium text-slate-900">
                              {formatPrice(item.total_price)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 金额汇总 */}
                  <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{t('subtotal')}</span>
                      <span className="text-slate-900">{formatPrice(selectedOrder.subtotal)}</span>
                    </div>
                    {selectedOrder.discount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{t('discount')}</span>
                        <span className="text-red-600">-{formatPrice(selectedOrder.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{t('shipping_fee')}</span>
                      <span className="text-slate-900">{formatPrice(selectedOrder.shipping)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold pt-2 border-t border-gray-100 dark:border-gray-800">
                      <span className="text-slate-900">{t('total')}</span>
                      <span className="text-slate-900">{formatPrice(selectedOrder.total)}</span>
                    </div>
                  </div>

                  {/* 状态流转 */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-2">{t('order_status')}</p>
                    <div className="flex items-center gap-1">
                      {statusFlow.map((step, idx) => {
                        const isDone = idx <= currentStepIndex;
                        const isCurrent = idx === currentStepIndex;
                        const s = statusConfig[step];
                        const isTerminal = step === 'cancelled' || step === 'refunded';
                        return (
                          <React.Fragment key={step}>
                            <div className="flex flex-col items-center">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                                  isDone
                                    ? isTerminal
                                      ? 'bg-red-500 text-white'
                                      : 'bg-primary-600 text-white'
                                    : 'bg-gray-100 text-gray-500'
                                } ${isCurrent ? 'ring-2 ring-primary-300 ring-offset-2' : ''}`}
                              >
                                {idx + 1}
                              </div>
                              <span className="text-[10px] text-gray-500 mt-1 whitespace-nowrap">{s.label}</span>
                            </div>
                            {idx < statusFlow.length - 1 && (
                              <div
                                className={`flex-1 h-0.5 -mt-4 ${
                                  idx < currentStepIndex ? 'bg-primary-600' : 'bg-gray-200'
                                }`}
                              />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>

                  {/* 物流追踪 */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-2">{t('tracking')}</p>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-primary-600 flex-shrink-0" />
                          <span className="text-xs text-gray-700">{t('placed')}</span>
                          <span className="text-[10px] text-gray-500 ml-auto">
                            {formatDate(selectedOrder.created_at, t)}
                          </span>
                        </div>
                        {selectedOrder.shipped_at && (
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-xs text-gray-700">{t('st_shipped')}</span>
                              {(selectedOrder.carrier || selectedOrder.tracking_number) && (
                                <span className="text-[10px] text-gray-500 ml-1">
                                  {selectedOrder.carrier}{' '}
                                  {selectedOrder.tracking_number}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-gray-500 ml-auto">
                              {formatDate(selectedOrder.shipped_at, t)}
                            </span>
                          </div>
                        )}
                        {selectedOrder.delivered_at && (
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                            <span className="text-xs text-gray-700">{t('st_delivered')}</span>
                            <span className="text-[10px] text-gray-500 ml-auto">
                              {formatDate(selectedOrder.delivered_at, t)}
                            </span>
                          </div>
                        )}
                      </div>
                      {!selectedOrder.shipped_at && !selectedOrder.delivered_at && (
                        <p className="text-xs text-gray-500 mt-1">{t('no_tracking')}</p>
                      )}

                      {/* 编辑物流信息 */}
                      {editTracking ? (
                        <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] text-gray-500 mb-0.5">{t('carrier')}</label>
                              <input
                                className="w-full border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                                placeholder={t('carrier_placeholder')}
                                value={carrier}
                                onChange={(e) => setCarrier(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-500 mb-0.5">{t('tracking_no')}</label>
                              <input
                                className="w-full border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                                placeholder="SF1234567890"
                                value={trackingNumber}
                                onChange={(e) => setTrackingNumber(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="primary" size="sm" onClick={handleSaveTracking} isLoading={trackingLoading}>
                              <Save size={12} className="mr-1" /> {t('save')}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditTracking(false)}>
                              {t('cancel')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditTracking(true)}
                          className="mt-2 flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 transition-colors"
                        >
                          <Truck size={12} />
                          {t('edit_tracking')}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 状态操作按钮 */}
                  {currentStepIndex >= 0 &&
                    !isTerminalStatus &&
                    selectedOrder.status !== 'delivered' && (
                      <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
                        <p className="text-xs font-medium text-gray-500 uppercase mb-2">{t('actions')}</p>
                        <div className="flex flex-wrap gap-2">
                          {getNextStatuses(selectedOrder.status).map((nextStatus) => (
                            <Button
                              key={nextStatus}
                              variant="primary"
                              size="sm"
                              onClick={() => handleStatusChange(selectedOrder.id, nextStatus)}
                            >
                              {t('mark_as').replace('{status}', statusConfig[nextStatus].label)}
                            </Button>
                          ))}
                          {selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'refunded' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleStatusChange(selectedOrder.id, 'cancelled')}
                            >
                              {t('cancel_order')}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                </div>
              ) : (
                <div className="flex items-center justify-center py-12 text-sm text-gray-500">
                  {t('no_order_detail')}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* 创建订单模态框 */}
      {/* ================================================================ */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={t('create_order')}
        size="lg"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('col_order_number')}</label>
              <Input
                placeholder={t('auto_gen')}
                value={createForm.order_number}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, order_number: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('customer_id')}</label>
              <Input
                placeholder={t('optional')}
                value={createForm.customer_id}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, customer_id: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('customer_name')}</label>
              <Input
                placeholder={t('optional')}
                value={createForm.customer_name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, customer_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('customer_email')}</label>
              <Input
                placeholder={t('optional')}
                value={createForm.customer_email}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, customer_email: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('order_status')}</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                value={createForm.status}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, status: e.target.value as OrderStatus }))
                }
              >
                {allStatuses.map((s) => (
                  <option key={s} value={s}>
                    {statusConfig[s].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('payment_status')}</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                value={createForm.payment_status}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    payment_status: e.target.value as PaymentStatus,
                  }))
                }
              >
                {allPaymentStatuses.map((s) => (
                  <option key={s} value={s}>
                    {paymentStatusConfig[s]?.label || s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('platform')}</label>
            <Input
              placeholder={t('platform_placeholder')}
              value={createForm.platform}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, platform: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('notes')}</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 resize-none"
              rows={2}
              placeholder={t('notes_placeholder')}
              value={createForm.notes}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          {/* 金额信息 */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">{t('amount_info')}</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">{t('subtotal')}</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={createForm.subtotal ? String(createForm.subtotal) : ''}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, subtotal: Number(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">{t('tax')}</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={createForm.tax ? String(createForm.tax) : ''}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, tax: Number(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">{t('shipping_fee')}</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={createForm.shipping ? String(createForm.shipping) : ''}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, shipping: Number(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">{t('discount')}</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={createForm.discount ? String(createForm.discount) : ''}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, discount: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] text-gray-500 mb-0.5">{t('total')}</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={createForm.total ? String(createForm.total) : ''}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, total: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
          </div>

          {/* 收货地址 */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">{t('shipping_addr')}</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">{t('receiver')}</label>
                <Input
                  placeholder={t('name_placeholder')}
                  value={createForm.shipping_address.name}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      shipping_address: { ...prev.shipping_address, name: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">{t('phone')}</label>
                <Input
                  placeholder={t('phone_placeholder')}
                  value={createForm.shipping_address.phone}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      shipping_address: { ...prev.shipping_address, phone: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">{t('province')}</label>
                <Input
                  placeholder={t('province_placeholder')}
                  value={createForm.shipping_address.province}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      shipping_address: { ...prev.shipping_address, province: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">{t('city')}</label>
                <Input
                  placeholder={t('city_placeholder')}
                  value={createForm.shipping_address.city}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      shipping_address: { ...prev.shipping_address, city: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">{t('district')}</label>
                <Input
                  placeholder={t('district_placeholder')}
                  value={createForm.shipping_address.district}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      shipping_address: { ...prev.shipping_address, district: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">{t('zip_code')}</label>
                <Input
                  placeholder={t('zip_placeholder')}
                  value={createForm.shipping_address.zip_code}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      shipping_address: { ...prev.shipping_address, zip_code: e.target.value },
                    }))
                  }
                />
              </div>
            </div>
            <div className="mt-2">
              <label className="block text-[10px] text-gray-500 mb-0.5">{t('detail_addr')}</label>
              <Input
                placeholder={t('addr_placeholder')}
                value={createForm.shipping_address.detail}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    shipping_address: { ...prev.shipping_address, detail: e.target.value },
                  }))
                }
              />
            </div>
          </div>

          {/* 行项目 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-700">{t('items_detail')}</p>
              <Button variant="ghost" size="sm" onClick={addLineItem}>
                <Plus size={12} className="mr-1" /> {t('add')}
              </Button>
            </div>
            <div className="space-y-2">
              {createForm.items.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">{t('product_name_label')}</label>
                      <Input
                        placeholder={t('product_name_placeholder')}
                        value={item.product_name}
                        onChange={(e) => updateLineItem(idx, 'product_name', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">SKU</label>
                      <Input
                        placeholder="SKU"
                        value={item.sku}
                        onChange={(e) => updateLineItem(idx, 'sku', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">{t('qty')}</label>
                      <Input
                        type="number"
                        placeholder="1"
                        value={String(item.quantity)}
                        onChange={(e) => updateLineItem(idx, 'quantity', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">{t('unit_price')}</label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={item.unit_price ? String(item.unit_price) : ''}
                        onChange={(e) => updateLineItem(idx, 'unit_price', e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] text-gray-500 mb-0.5">
                        {t('subtotal_auto')}
                      </label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={item.total_price ? String(item.total_price) : ''}
                        onChange={(e) => updateLineItem(idx, 'total_price', e.target.value)}
                      />
                    </div>
                  </div>
                  {createForm.items.length > 1 && (
                    <button
                      className="p-1 text-gray-500 hover:text-red-500 transition-colors mt-4"
                      onClick={() => removeLineItem(idx)}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <ModalFooter
          onCancel={() => setShowCreateModal(false)}
          onConfirm={handleCreateOrder}
          confirmText={t('confirm_create')}
          isLoading={createLoading}
        />
      </Modal>

      {/* ================================================================ */}
      {/* 编辑订单模态框 */}
      {/* ================================================================ */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={t('edit_order_title')}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('payment_status')}</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              value={editForm.payment_status}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, payment_status: e.target.value as PaymentStatus }))
              }
            >
              {allPaymentStatuses.map((s) => (
                <option key={s} value={s}>
                  {paymentStatusConfig[s]?.label || s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('notes')}</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 resize-none"
              rows={3}
              placeholder={t('notes_placeholder')}
              value={editForm.notes}
              onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">{t('shipping_addr')}</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">{t('receiver')}</label>
                <Input
                  placeholder={t('name_placeholder')}
                  value={editForm.shipping_address.name}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      shipping_address: { ...prev.shipping_address, name: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">{t('phone')}</label>
                <Input
                  placeholder={t('phone_placeholder')}
                  value={editForm.shipping_address.phone}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      shipping_address: { ...prev.shipping_address, phone: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">{t('province')}</label>
                <Input
                  placeholder={t('province_placeholder')}
                  value={editForm.shipping_address.province}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      shipping_address: { ...prev.shipping_address, province: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">{t('city')}</label>
                <Input
                  placeholder={t('city_placeholder')}
                  value={editForm.shipping_address.city}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      shipping_address: { ...prev.shipping_address, city: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">{t('district')}</label>
                <Input
                  placeholder={t('district_placeholder')}
                  value={editForm.shipping_address.district}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      shipping_address: { ...prev.shipping_address, district: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">{t('zip_code')}</label>
                <Input
                  placeholder={t('zip_placeholder')}
                  value={editForm.shipping_address.zip_code}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      shipping_address: { ...prev.shipping_address, zip_code: e.target.value },
                    }))
                  }
                />
              </div>
            </div>
            <div className="mt-2">
              <label className="block text-[10px] text-gray-500 mb-0.5">{t('detail_addr')}</label>
              <Input
                placeholder={t('addr_placeholder')}
                value={editForm.shipping_address.detail}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    shipping_address: { ...prev.shipping_address, detail: e.target.value },
                  }))
                }
              />
            </div>
          </div>
        </div>
        <ModalFooter
          onCancel={() => setShowEditModal(false)}
          onConfirm={handleEditOrder}
          confirmText={t('save_changes')}
          isLoading={editLoading}
        />
      </Modal>

      {/* ================================================================ */}
      {/* 删除确认模态框 */}
      {/* ================================================================ */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title={t('delete_order_title')}
        size="sm"
      >
        <div className="text-center py-2">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle size={24} className="text-red-500" />
          </div>
          <p className="text-sm text-gray-700">
            {t('confirm_delete_question').replace('{num}', selectedOrder?.order_number ?? '')}
          </p>
          <p className="text-xs text-gray-500 mt-1">{t('irreversible')}</p>
        </div>
        <ModalFooter
          onCancel={() => setShowDeleteModal(false)}
          onConfirm={handleDeleteOrder}
          confirmText={t('confirm_delete')}
          confirmVariant="danger"
          isLoading={deleteLoading}
        />
      </Modal>
      {/* 批量打单（打印视图） */}
      {showPrint && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 overflow-y-auto print-area" onClick={() => setShowPrint(false)}>
          <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 z-10 px-6 py-3 flex items-center justify-between print:hidden" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900 dark:text-gray-100">{t('batch_print')}（{printOrders.length} 单）</h3>
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => window.print()} leftIcon={<Printer size={13} />}>
                {t('print')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowPrint(false)}>{t('close')}</Button>
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4" onClick={(e) => e.stopPropagation()}>
            {printOrders.map((o: any, idx: number) => (
              <div key={o.id} className="rounded-xl border border-gray-300 dark:border-gray-600 p-4 print-card">
                <div className="flex items-center justify-between border-b border-dashed border-gray-300 dark:border-gray-600 pb-2 mb-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-gray-100">Nexora</p>
                    <p className="text-[10px] text-gray-400">{t('print_card')} #{idx + 1}</p>
                  </div>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{o.order_number}</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-300 space-y-0.5">
                  <p><b>{t('print_receiver')}：</b>{o.customer_name || '-'}　{o.customer_phone || (o.shipping_address?.phone || '')}</p>
                  <p><b>{t('print_address')}：</b>{o.shipping_address ? [o.shipping_address.province, o.shipping_address.city, o.shipping_address.detail].filter(Boolean).join(' ') : '-'}</p>
                  <p className="mt-1"><b>{t('print_items')}：</b>{Array.isArray(o.items) ? o.items.map((i: any) => `${i.product_name}×${i.quantity}`).join('、') : '-'}</p>
                  <p><b>{t('print_total')}：</b>¥{Number(o.total || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}　<b>{t('print_date')}：</b>{o.created_at ? new Date(o.created_at.replace('+00:00', 'Z')).toLocaleDateString('zh-CN') : '-'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>

  );
};