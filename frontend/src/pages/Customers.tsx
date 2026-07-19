import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
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
import type { Customer, CustomerTag, RFMAnalysis } from '@/types/ecommerce';

const tagConfig: Record<CustomerTag, { label: string; variant: 'green' | 'blue' | 'yellow' | 'red' | 'gray' }> = {
  vip: { label: 'VIP', variant: 'green' },
  high_value: { label: '高价值', variant: 'green' },
  regular: { label: '常客', variant: 'blue' },
  new: { label: '新客', variant: 'yellow' },
  at_risk: { label: '流失风险', variant: 'red' },
};

const allTags: CustomerTag[] = ['vip', 'high_value', 'regular', 'new', 'at_risk'];

const formatPrice = (price: number) => `¥${price.toFixed(2)}`;
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '暂无';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '无效日期';
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

const PAGE_SIZE = 10;

export const Customers: React.FC = () => {
  usePageTitle('客户管理');
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
      setError(err?.response?.data?.detail || '加载客户列表失败');
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
      setFieldError('name', '客户姓名不能为空');
      hasError = true;
    }
    if (!formEmail.trim()) {
      setFieldError('email', '邮箱不能为空');
      hasError = true;
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formEmail.trim())) {
        setFieldError('email', '请输入有效的邮箱地址');
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
        addToast('success', '客户信息已更新');
      } else {
        await customerService.createCustomer(currentWorkspace.slug, payload as any);
        addToast('success', '客户已创建');
      }
      setShowFormModal(false);
      fetchCustomers();
    } catch (err: any) {
      addToast('error', '操作失败', err?.response?.data?.detail || '请稍后重试');
    } finally {
      setFormSubmitting(false);
    }
  };

  const toggleFormTag = (tag: CustomerTag) => {
    setFormTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
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
      addToast('error', '加载失败', '无法获取客户详情');
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

  const handleDeleteConfirm = async () => {
    if (!currentWorkspace || !deletingCustomer) return;
    setDeleteLoading(true);
    try {
      await customerService.deleteCustomer(currentWorkspace.slug, deletingCustomer.id);
      addToast('success', '客户已删除');
      setShowDeleteModal(false);
      setDeletingCustomer(null);
      // If the deleted customer was shown in detail, close the panel
      if (selectedCustomer?.id === deletingCustomer.id) {
        setShowDetail(false);
        setSelectedCustomer(null);
      }
      fetchCustomers();
    } catch (err: any) {
      addToast('error', '删除失败', err?.response?.data?.detail || '请稍后重试');
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
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">加载失败</h3>
        <p className="text-sm text-gray-500 mt-1">{error}</p>
        <Button variant="outline" className="mt-4" onClick={handleRefresh}>重试</Button>
      </div>
    );
  }

  // ============================================================
  // Table columns
  // ============================================================
  const columns = [
    { key: 'name', header: '客户', render: (c: Customer) => (
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
          <p className="text-sm font-medium text-slate-900 truncate">{c.name}</p>
          <p className="text-xs text-gray-500">{c.email}</p>
        </div>
      </div>
    )},
    { key: 'phone', header: '电话', render: (c: Customer) => (
      <span className="text-sm text-gray-600">{c.phone || '-'}</span>
    )},
    { key: 'tags', header: '标签', render: (c: Customer) => (
      <div className="flex flex-wrap gap-1">
        {c.tags.map((tag) => {
          const t = tagConfig[tag] || { label: tag, variant: 'gray' as const };
          return <Badge key={tag} variant={t.variant}>{t.label}</Badge>;
        })}
        {c.tags.length === 0 && <span className="text-xs text-gray-500">-</span>}
      </div>
    )},
    { key: 'orders', header: '订单', render: (c: Customer) => (
      <div>
        <p className="text-sm font-medium text-slate-900">{c.total_orders} 笔</p>
        <p className="text-xs text-gray-500">{formatPrice(c.total_spent)}</p>
      </div>
    )},
    { key: 'last_order', header: '最近购买', render: (c: Customer) => (
      <span className="text-sm text-gray-600">{formatDate(c.last_order_at)}</span>
    )},
    { key: 'actions', header: '操作', className: 'text-right', render: (c: Customer) => (
      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={() => openEditModal(c)}>编辑</Button>
        <Button variant="ghost" size="sm" onClick={() => openDetail(c)}>详情</Button>
        <Button variant="ghost" size="sm" onClick={() => openDeleteModal(c)}>
          <Trash2 size={14} className="text-red-500" />
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
          <h2 className="text-2xl font-bold text-slate-900">客户 CRM</h2>
          <p className="mt-1 text-sm text-gray-500">管理客户关系和 RFM 分析</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            leftIcon={<RefreshCw size={16} />}
          >
            刷新
          </Button>
          <Button variant="primary" size="sm" onClick={openCreateModal} leftIcon={<User size={16} />}>
            添加客户
          </Button>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <Card padding>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="搜索客户名称或邮箱..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              leftIcon={<Search size={16} />}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => { setTagFilter(''); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                tagFilter === '' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              全部
            </button>
            {allTags.map((tag) => {
              const t = tagConfig[tag];
              return (
                <button
                  key={tag}
                  onClick={() => { setTagFilter(tagFilter === tag ? '' : tag); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                    tagFilter === tag
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          {(searchQuery || tagFilter) && (
            <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setDebouncedSearchQuery(''); setTagFilter(''); setPage(1); }}>
              <X size={14} /> 清除
            </Button>
          )}
        </div>
      </Card>

      {/* 客户列表 + RFM 分析 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={showDetail ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <Card padding={false}>
            <Table
              columns={columns}
              data={customers}
              keyExtractor={(c) => c.id}
              isLoading={isLoading}
              emptyTitle="暂无客户"
              emptyDescription="点击「添加客户」按钮创建你的第一个客户"
            />
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-300">
                <span className="text-sm text-gray-500">
                  共 {total} 条记录，第 {page} / {totalPages} 页
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
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
              title="客户详情"
              actions={
                <Button variant="ghost" size="sm" onClick={() => { setShowDetail(false); setSelectedCustomer(null); }}>
                  <X size={16} />
                </Button>
              }
            >
              {detailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw size={24} className="text-gray-500 animate-spin" />
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
                      <p className="text-lg font-semibold text-slate-900">{selectedCustomer.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedCustomer.tags.map((tag) => {
                          const t = tagConfig[tag] || { label: tag, variant: 'gray' as const };
                          return <Badge key={tag} variant={t.variant}>{t.label}</Badge>;
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail size={14} className="text-gray-500" />
                      {selectedCustomer.email}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone size={14} className="text-gray-500" />
                      {selectedCustomer.phone || '未填写'}
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
                    查看订单
                  </Button>

                  {/* 消费统计 */}
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-medium text-gray-500 uppercase">消费统计</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-gray-500">累计订单</p>
                        <p className="text-lg font-bold text-slate-900">{selectedCustomer.total_orders}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">累计消费</p>
                        <p className="text-lg font-bold text-slate-900">{formatPrice(selectedCustomer.total_spent)}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">最近购买</p>
                      <p className="text-sm text-slate-900">{formatDate(selectedCustomer.last_order_at)}</p>
                    </div>
                  </div>

                  {selectedCustomer.source && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-1">来源</p>
                      <p className="text-sm text-gray-600">{selectedCustomer.source}</p>
                    </div>
                  )}

                  {selectedCustomer.notes && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-1">备注</p>
                      <p className="text-sm text-gray-600">{selectedCustomer.notes}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-gray-500">暂无数据</div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* RFM 分析面板 */}
      {rfmAnalysis && (
        <Card title="RFM 客户分层分析" subtitle={`共 ${rfmAnalysis.total_customers} 位客户`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 分层分布 */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">客户分层分布</p>
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
                          <span className="text-sm text-gray-700">{seg.segment}</span>
                        </div>
                        <span className="text-sm text-gray-500">
                          {seg.customer_count} 人 ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
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
              <p className="text-sm font-medium text-gray-700 mb-3">各分层 RFM 指标</p>
              <div className="space-y-2">
                {rfmAnalysis.segments.map((seg) => {
                  const segColor = rfmSegmentColors[seg.segment] || '#6b7280';
                  return (
                    <div key={seg.segment} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: segColor }}
                        />
                        <span className="text-sm font-medium text-gray-800">{seg.segment}</span>
                        <span className="text-xs text-gray-500 ml-auto">{seg.customer_count} 人</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                          <p className="text-xs text-gray-500">R</p>
                          <p className="text-sm font-bold text-blue-600">{seg.r_score}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">F</p>
                          <p className="text-sm font-bold text-indigo-600">{seg.f_score}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">M</p>
                          <p className="text-sm font-bold text-purple-600">{seg.m_score}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">综合</p>
                          <p className="text-sm font-bold text-gray-800">{seg.rfm_score}</p>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-gray-500 text-right">
                        人均消费: {formatPrice(seg.average_total_spent)}
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
        title={editingCustomer ? '编辑客户' : '添加客户'}
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="姓名" placeholder="客户姓名" value={formName} onChange={(e) => setFormName(e.target.value)} error={formErrors.name} />
            <Input label="邮箱" placeholder="customer@example.com" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} error={formErrors.email} />
          </div>
          <Input label="电话" placeholder="手机号码" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
          <Input
            label="来源"
            placeholder="例如：门店、网站、抖音..."
            value={formSource}
            onChange={(e) => setFormSource(e.target.value)}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">标签</label>
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => {
                const t = tagConfig[tag];
                const isSelected = formTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleFormTag(tag)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                      isSelected
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">备注</label>
            <textarea
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 transition-colors duration-200 resize-none"
              rows={3}
              placeholder="备注信息..."
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
            />
          </div>
          <ModalFooter
            onCancel={() => setShowFormModal(false)}
            onConfirm={handleFormSubmit}
            confirmText={editingCustomer ? '保存修改' : '创建客户'}
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
        title="确认删除"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} className="text-red-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">
                确定要删除客户「{deletingCustomer?.name}」吗？
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                此操作不可撤销，该客户的所有关联数据将被永久删除。
              </p>
            </div>
          </div>
          <ModalFooter
            onCancel={() => { setShowDeleteModal(false); setDeletingCustomer(null); }}
            onConfirm={handleDeleteConfirm}
            confirmText="确认删除"
            confirmVariant="danger"
            isLoading={deleteLoading}
          />
        </div>
      </Modal>
    </div>
  );
};