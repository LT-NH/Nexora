import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Search,
  X,
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

// ============================================================
// 常量配置
// ============================================================

const statusConfig: Record<OrderStatus, { label: string; variant: 'yellow' | 'blue' | 'green' | 'red' | 'gray' }> = {
  pending: { label: '待确认', variant: 'yellow' },
  confirmed: { label: '已确认', variant: 'blue' },
  processing: { label: '处理中', variant: 'blue' },
  shipped: { label: '已发货', variant: 'green' },
  delivered: { label: '已签收', variant: 'green' },
  cancelled: { label: '已取消', variant: 'red' },
  refunded: { label: '已退款', variant: 'gray' },
};

const paymentStatusConfig: Record<string, { label: string; variant: 'green' | 'yellow' | 'red' | 'gray' }> = {
  paid: { label: '已支付', variant: 'green' },
  unpaid: { label: '未支付', variant: 'yellow' },
  refunded: { label: '已退款', variant: 'gray' },
  partially_refunded: { label: '部分退款', variant: 'gray' },
};

const statusTabs: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待确认' },
  { key: 'confirmed', label: '已确认' },
  { key: 'processing', label: '处理中' },
  { key: 'shipped', label: '已发货' },
  { key: 'delivered', label: '已签收' },
  { key: 'cancelled', label: '已取消' },
  { key: 'refunded', label: '已退款' },
];

const statusFlow: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];

const allStatuses: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
const allPaymentStatuses: PaymentStatus[] = ['unpaid', 'paid', 'refunded', 'partially_refunded'];

const formatPrice = (price: number) => `¥${price.toFixed(2)}`;
const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '无效日期';
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
  usePageTitle('订单管理');
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
      setError(err?.response?.data?.detail || '加载订单列表失败');
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
    } catch (err: any) {
      addToast('error', '加载订单详情失败', err?.response?.data?.detail || '请稍后重试');
    } finally {
      setDetailLoading(false);
    }
  }, [currentWorkspace, addToast]);

  const openDetail = (order: Order) => {
    setSelectedOrder(order);
    setShowDetail(true);
    fetchOrderDetail(order.id);
  };

  // ---------- 状态变更 ----------
  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    if (!currentWorkspace) return;
    try {
      await orderService.updateOrderStatus(currentWorkspace.slug, orderId, newStatus);
      addToast('success', '状态已更新');
      fetchOrders();
      if (selectedOrder?.id === orderId) {
        fetchOrderDetail(orderId);
      }
    } catch (err: any) {
      addToast('error', '更新失败', err?.response?.data?.detail || '请稍后重试');
    }
  };

  // ---------- 创建订单 ----------
  const handleCreateOrder = async () => {
    if (!currentWorkspace) return;
    const validItems = createForm.items.filter((item) => item.product_name.trim());
    if (validItems.length === 0) {
      addToast('warning', '请添加商品', '至少需要一个订单行项目。');
      return;
    }
    for (const item of validItems) {
      if (item.quantity < 1) {
        addToast('warning', '数量无效', `${item.product_name} 的数量必须大于 0。`);
        return;
      }
      if (item.unit_price < 0) {
        addToast('warning', '价格无效', `${item.product_name} 的单价不能为负数。`);
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
      addToast('success', '订单已创建');
      setShowCreateModal(false);
      setCreateForm(emptyCreateForm);
      fetchOrders();
    } catch (err: any) {
      addToast('error', '创建失败', err?.response?.data?.detail || '请稍后重试');
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
      addToast('success', '订单已更新');
      setShowEditModal(false);
      fetchOrders();
      fetchOrderDetail(selectedOrder.id);
    } catch (err: any) {
      addToast('error', '更新失败', err?.response?.data?.detail || '请稍后重试');
    } finally {
      setEditLoading(false);
    }
  };

  // ---------- 删除订单 ----------
  const handleDeleteOrder = async () => {
    if (!currentWorkspace || !selectedOrder) return;
    setDeleteLoading(true);
    try {
      await orderService.deleteOrder(currentWorkspace.slug, selectedOrder.id);
      addToast('success', '订单已删除');
      setShowDeleteModal(false);
      setShowDetail(false);
      setSelectedOrder(null);
      fetchOrders();
    } catch (err: any) {
      addToast('error', '删除失败', err?.response?.data?.detail || '请稍后重试');
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

  // ---------- 错误状态 ----------
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">加载失败</h3>
        <p className="text-sm text-gray-500 mt-1">{error}</p>
        <Button variant="outline" className="mt-4" onClick={fetchOrders}>重试</Button>
      </div>
    );
  }

  // ============================================================
  // 表格列定义
  // ============================================================
  const columns = [
    {
      key: 'order_number',
      header: '订单号',
      render: (o: Order) => (
        <div>
          <p className="text-sm font-medium text-slate-900">{o.order_number}</p>
          <p className="text-xs text-gray-500">{formatDate(o.created_at)}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: '客户',
      render: (o: Order) => (
        <div>
          <p className="text-sm text-slate-900">{o.customer_name || o.customer_id || '-'}</p>
          {o.customer_email && (
            <p className="text-xs text-gray-500">{o.customer_email}</p>
          )}
        </div>
      ),
    },
    {
      key: 'items',
      header: '商品',
      render: (o: Order) => (
        <span className="text-sm text-gray-600">{o.items?.length ?? 0} 件商品</span>
      ),
    },
    {
      key: 'total',
      header: '金额',
      render: (o: Order) => (
        <span className="text-sm font-semibold text-slate-900">{formatPrice(o.total)}</span>
      ),
    },
    {
      key: 'status',
      header: '状态',
      render: (o: Order) => {
        const s = statusConfig[o.status] || { label: o.status, variant: 'gray' as const };
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      key: 'payment',
      header: '支付',
      render: (o: Order) => {
        const p = paymentStatusConfig[o.payment_status] || { label: o.payment_status, variant: 'gray' as const };
        return <Badge variant={p.variant}>{p.label}</Badge>;
      },
    },
    {
      key: 'store',
      header: '来源',
      render: (o: Order) => (
        <span className="text-sm text-gray-500">{o.platform || '-'}</span>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      className: 'text-right',
      render: (o: Order) => (
        <Button variant="ghost" size="sm" onClick={() => openDetail(o)}>
          详情
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
          <h2 className="text-2xl font-bold text-slate-900">订单管理</h2>
          <p className="mt-1 text-sm text-gray-500">管理和跟踪所有订单</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchOrders} isLoading={isLoading}>
            <RefreshCw size={14} className="mr-1" />
            刷新
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus size={14} className="mr-1" />
            创建订单
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <StatsOverview stats={stats} isLoading={statsLoading} />

      {/* 状态筛选 Tabs */}
      <Card padding>
        <div className="flex flex-wrap items-center gap-1">
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
              placeholder="搜索订单号或客户名称..."
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
                <X size={14} /> 清除
              </Button>
            )}
          </div>
          {searchQuery && (
            <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')}>
              <X size={14} /> 清除
            </Button>
          )}
        </div>
      </Card>

      {/* 订单列表 + 详情面板 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={showDetail ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <Card padding={false}>
            <Table
              columns={columns}
              data={orders}
              keyExtractor={(o) => o.id}
              isLoading={isLoading}
              emptyTitle="暂无订单"
              emptyDescription="还没有任何订单记录"
            />
            {/* 分页 */}
            {totalPages > 1 && !isLoading && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <span className="text-sm text-gray-500">
                  共 {total} 条，第 {page}/{totalPages} 页
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
              title={selectedOrder ? `订单 ${selectedOrder.order_number}` : '订单详情'}
              actions={
                <div className="flex items-center gap-1">
                  {selectedOrder && !isTerminalStatus && (
                    <>
                      <Button variant="ghost" size="sm" onClick={openEditModal}>
                        <Edit size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDeleteModal(true)}
                      >
                        <Trash2 size={14} className="text-red-500" />
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setShowDetail(false)}>
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
                    <p className="text-xs font-medium text-gray-500 uppercase mb-2">客户信息</p>
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
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2">收货地址</p>
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
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2">备注</p>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-600">{selectedOrder.notes}</p>
                      </div>
                    </div>
                  )}

                  {/* 订单商品 */}
                  {selectedOrder.items && selectedOrder.items.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2">商品明细</p>
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
                  <div className="border-t border-gray-100 pt-3 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">小计</span>
                      <span className="text-slate-900">{formatPrice(selectedOrder.subtotal)}</span>
                    </div>
                    {selectedOrder.discount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">优惠</span>
                        <span className="text-red-600">-{formatPrice(selectedOrder.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">运费</span>
                      <span className="text-slate-900">{formatPrice(selectedOrder.shipping)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold pt-2 border-t border-gray-100">
                      <span className="text-slate-900">合计</span>
                      <span className="text-slate-900">{formatPrice(selectedOrder.total)}</span>
                    </div>
                  </div>

                  {/* 状态流转 */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-2">订单状态</p>
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

                  {/* 状态操作按钮 */}
                  {currentStepIndex >= 0 &&
                    !isTerminalStatus &&
                    selectedOrder.status !== 'delivered' && (
                      <div className="border-t border-gray-100 pt-3">
                        <p className="text-xs font-medium text-gray-500 uppercase mb-2">操作</p>
                        <div className="flex flex-wrap gap-2">
                          {getNextStatuses(selectedOrder.status).map((nextStatus) => (
                            <Button
                              key={nextStatus}
                              variant="primary"
                              size="sm"
                              onClick={() => handleStatusChange(selectedOrder.id, nextStatus)}
                            >
                              标记为「{statusConfig[nextStatus].label}」
                            </Button>
                          ))}
                          {selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'refunded' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleStatusChange(selectedOrder.id, 'cancelled')}
                            >
                              取消订单
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                </div>
              ) : (
                <div className="flex items-center justify-center py-12 text-sm text-gray-500">
                  暂无订单详情
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
        title="创建订单"
        size="lg"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">订单号</label>
              <Input
                placeholder="自动生成"
                value={createForm.order_number}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, order_number: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">客户ID</label>
              <Input
                placeholder="可选"
                value={createForm.customer_id}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, customer_id: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">客户名称</label>
              <Input
                placeholder="可选"
                value={createForm.customer_name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, customer_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">客户邮箱</label>
              <Input
                placeholder="可选"
                value={createForm.customer_email}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, customer_email: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">订单状态</label>
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
              <label className="block text-xs font-medium text-gray-700 mb-1">支付状态</label>
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
            <label className="block text-xs font-medium text-gray-700 mb-1">平台</label>
            <Input
              placeholder="例如: 淘宝、京东"
              value={createForm.platform}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, platform: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">备注</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 resize-none"
              rows={2}
              placeholder="订单备注..."
              value={createForm.notes}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          {/* 金额信息 */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">金额信息</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">小计</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={createForm.subtotal ? String(createForm.subtotal) : ''}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, subtotal: Number(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">税费</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={createForm.tax ? String(createForm.tax) : ''}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, tax: Number(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">运费</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={createForm.shipping ? String(createForm.shipping) : ''}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, shipping: Number(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">优惠</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={createForm.discount ? String(createForm.discount) : ''}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, discount: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] text-gray-500 mb-0.5">合计</label>
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
            <p className="text-xs font-medium text-gray-700 mb-2">收货地址</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">收件人</label>
                <Input
                  placeholder="姓名"
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
                <label className="block text-[10px] text-gray-500 mb-0.5">电话</label>
                <Input
                  placeholder="手机号"
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
                <label className="block text-[10px] text-gray-500 mb-0.5">省份</label>
                <Input
                  placeholder="省"
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
                <label className="block text-[10px] text-gray-500 mb-0.5">城市</label>
                <Input
                  placeholder="市"
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
                <label className="block text-[10px] text-gray-500 mb-0.5">区/县</label>
                <Input
                  placeholder="区"
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
                <label className="block text-[10px] text-gray-500 mb-0.5">邮编</label>
                <Input
                  placeholder="邮编"
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
              <label className="block text-[10px] text-gray-500 mb-0.5">详细地址</label>
              <Input
                placeholder="街道、门牌号"
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
              <p className="text-xs font-medium text-gray-700">商品明细</p>
              <Button variant="ghost" size="sm" onClick={addLineItem}>
                <Plus size={12} className="mr-1" /> 添加
              </Button>
            </div>
            <div className="space-y-2">
              {createForm.items.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">商品名称</label>
                      <Input
                        placeholder="商品名"
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
                      <label className="block text-[10px] text-gray-500 mb-0.5">数量</label>
                      <Input
                        type="number"
                        placeholder="1"
                        value={String(item.quantity)}
                        onChange={(e) => updateLineItem(idx, 'quantity', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">单价</label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={item.unit_price ? String(item.unit_price) : ''}
                        onChange={(e) => updateLineItem(idx, 'unit_price', e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] text-gray-500 mb-0.5">
                        小计（自动计算或手动输入）
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
          confirmText="创建订单"
          isLoading={createLoading}
        />
      </Modal>

      {/* ================================================================ */}
      {/* 编辑订单模态框 */}
      {/* ================================================================ */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="编辑订单"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">支付状态</label>
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
            <label className="block text-xs font-medium text-gray-700 mb-1">备注</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 resize-none"
              rows={3}
              placeholder="订单备注..."
              value={editForm.notes}
              onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">收货地址</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">收件人</label>
                <Input
                  placeholder="姓名"
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
                <label className="block text-[10px] text-gray-500 mb-0.5">电话</label>
                <Input
                  placeholder="手机号"
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
                <label className="block text-[10px] text-gray-500 mb-0.5">省份</label>
                <Input
                  placeholder="省"
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
                <label className="block text-[10px] text-gray-500 mb-0.5">城市</label>
                <Input
                  placeholder="市"
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
                <label className="block text-[10px] text-gray-500 mb-0.5">区/县</label>
                <Input
                  placeholder="区"
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
                <label className="block text-[10px] text-gray-500 mb-0.5">邮编</label>
                <Input
                  placeholder="邮编"
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
              <label className="block text-[10px] text-gray-500 mb-0.5">详细地址</label>
              <Input
                placeholder="街道、门牌号"
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
          confirmText="保存修改"
          isLoading={editLoading}
        />
      </Modal>

      {/* ================================================================ */}
      {/* 删除确认模态框 */}
      {/* ================================================================ */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="删除订单"
        size="sm"
      >
        <div className="text-center py-2">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle size={24} className="text-red-500" />
          </div>
          <p className="text-sm text-gray-700">
            确定要删除订单
            <span className="font-semibold text-slate-900">
              {' '}{selectedOrder?.order_number}{' '}
            </span>
            吗？
          </p>
          <p className="text-xs text-gray-500 mt-1">此操作不可撤销</p>
        </div>
        <ModalFooter
          onCancel={() => setShowDeleteModal(false)}
          onConfirm={handleDeleteOrder}
          confirmText="确认删除"
          confirmVariant="danger"
          isLoading={deleteLoading}
        />
      </Modal>
    </div>
  );
};