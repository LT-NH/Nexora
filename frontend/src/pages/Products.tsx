import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  Package,
  X,
  Layers,
  Sparkles,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  RefreshCw,
  ChevronLeft,
  AlertTriangle,
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
import { Table } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { AIProductGenerator } from '@/components/ecommerce/AIProductGenerator';
import { productService } from '@/services/ecommerce';
import type { PaginatedResult } from '@/services/ecommerce';
import type { Product, ProductVariant, ProductCategory } from '@/types/ecommerce';

const PAGE_SIZE = 10;

const statusMap: Record<string, { label: string; variant: 'green' | 'yellow' | 'gray' }> = {
  active: { label: '在售', variant: 'green' },
  draft: { label: '草稿', variant: 'yellow' },
  archived: { label: '已归档', variant: 'gray' },
};

const statusOrder = [
  { value: 'active', label: '在售', color: 'bg-green-500' },
  { value: 'draft', label: '草稿', color: 'bg-yellow-500' },
  { value: 'archived', label: '已归档', color: 'bg-gray-400' },
];

const formatPrice = (price: number) => `¥${price.toFixed(2)}`;

export const Products: React.FC = () => {
  usePageTitle('商品管理');
  const { currentWorkspace } = useWorkspace();
  const { addToast } = useToast();
  const { errors, setFieldError, clearErrors } = useFormErrors();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search with debounce
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [searchQuery]);

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Modal states
  const [showProductModal, setShowProductModal] = useState(false);
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isLoading?: boolean;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Form states
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formWeight, setFormWeight] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formComparePrice, setFormComparePrice] = useState('');
  const [formCostPrice, setFormCostPrice] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStatus, setFormStatus] = useState<'draft' | 'active' | 'archived'>('draft');
  const [formTags, setFormTags] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Variant form
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [variantName, setVariantName] = useState('');
  const [variantSku, setVariantSku] = useState('');
  const [variantPrice, setVariantPrice] = useState('');
  const [variantStock, setVariantStock] = useState('');
  const [variantAttr, setVariantAttr] = useState('');
  const [variantSubmitting, setVariantSubmitting] = useState(false);

  // Category form
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryParent, setCategoryParent] = useState('');
  const [categorySubmitting, setCategorySubmitting] = useState(false);

  // Expanded categories
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const fetchProducts = useCallback(async () => {
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
      if (categoryFilter) params.category = categoryFilter;
      const paginated: PaginatedResult<Product> = await productService.getProductsPaginated(
        currentWorkspace.slug,
        params,
      );
      setProducts(paginated.items);
      setTotalPages(paginated.total_pages);
      setTotalItems(paginated.total);
    } catch (err: any) {
      setError(err?.response?.data?.detail || '加载商品列表失败');
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace, debouncedSearch, statusFilter, categoryFilter, page]);

  const fetchCategories = useCallback(async () => {
    if (!currentWorkspace) return;
    try {
      const data = await productService.getCategories(currentWorkspace.slug);
      setCategories(data);
    } catch {
      // Silently handle
    }
  }, [currentWorkspace]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, categoryFilter]);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, [fetchProducts, fetchCategories]);

  const resetForm = () => {
    setFormName('');
    setFormSlug('');
    setFormCategory('');
    setFormBrand('');
    setFormBarcode('');
    setFormWeight('');
    setFormPrice('');
    setFormComparePrice('');
    setFormCostPrice('');
    setFormSku('');
    setFormDescription('');
    setFormStatus('draft');
    setFormTags('');
    clearErrors();
  };

  const openCreateModal = () => {
    setEditingProduct(null);
    resetForm();
    setShowProductModal(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormName(product.name);
    setFormSlug(product.slug || '');
    setFormCategory(product.category ?? '');
    setFormBrand(product.brand ?? '');
    setFormBarcode(product.barcode || '');
    setFormWeight(product.weight != null ? String(product.weight) : '');
    setFormPrice(String(product.price));
    setFormComparePrice(product.compare_at_price ? String(product.compare_at_price) : '');
    setFormCostPrice(product.cost_price ? String(product.cost_price) : '');
    setFormSku(product.sku ?? '');
    setFormDescription(product.description ?? '');
    setFormStatus(product.status);
    setFormTags(Array.isArray(product.tags) ? product.tags.join(', ') : '');
    setShowProductModal(true);
  };

  const handleProductSubmit = async () => {
    if (!currentWorkspace) return;
    clearErrors();
    let hasError = false;
    if (!formName.trim()) {
      setFieldError('name', '商品名称不能为空');
      hasError = true;
    }
    if (!formSku.trim()) {
      setFieldError('sku', 'SKU 不能为空');
      hasError = true;
    }
    if (!formPrice) {
      setFieldError('price', '价格不能为空');
      hasError = true;
    } else {
      const price = parseFloat(formPrice);
      if (isNaN(price) || price < 0) {
        setFieldError('price', '请输入有效的价格');
        hasError = true;
      }
    }
    if (hasError) return;
    setFormSubmitting(true);
    try {
      const slug = formSlug.trim() || formName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const payload: Record<string, unknown> = {
        name: formName.trim(),
        slug,
        description: formDescription.trim() || undefined,
        category: formCategory.trim() || undefined,
        brand: formBrand.trim() || undefined,
        barcode: formBarcode.trim() || undefined,
        weight: formWeight ? parseFloat(formWeight) : undefined,
        price: parseFloat(formPrice),
        compare_at_price: formComparePrice ? parseFloat(formComparePrice) : undefined,
        cost_price: formCostPrice ? parseFloat(formCostPrice) : undefined,
        sku: formSku.trim(),
        status: formStatus,
        tags: formTags.split(',').map((t) => t.trim()).filter(Boolean),
      };

      // Remove undefined values for clean payload
      Object.keys(payload).forEach((key) => {
        if (payload[key] === undefined) delete payload[key];
      });

      if (editingProduct) {
        await productService.updateProduct(currentWorkspace.slug, { id: editingProduct.id, ...payload } as any);
        addToast('success', '商品已更新');
      } else {
        await productService.createProduct(currentWorkspace.slug, payload as any);
        addToast('success', '商品已创建');
      }
      setShowProductModal(false);
      fetchProducts();
    } catch (err: any) {
      addToast('error', '操作失败', err?.response?.data?.detail || '请稍后重试');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteProduct = (product: Product) => {
    setConfirmModal({
      isOpen: true,
      title: '确认删除',
      message: `确定要删除商品「${product.name}」吗？此操作不可撤销。`,
      onConfirm: async () => {
        if (!currentWorkspace) return;
        setConfirmModal((prev) => ({ ...prev, isLoading: true }));
        try {
          await productService.deleteProduct(currentWorkspace.slug, product.id);
          addToast('success', '商品已删除');
          fetchProducts();
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        } catch (err: any) {
          addToast('error', '删除失败', err?.response?.data?.detail || '请稍后重试');
        } finally {
          setConfirmModal((prev) => ({ ...prev, isLoading: false }));
        }
      },
    });
  };

  const resetVariantForm = () => {
    setEditingVariantId(null);
    setVariantName('');
    setVariantSku('');
    setVariantPrice('');
    setVariantStock('0');
    setVariantAttr('');
  };

  const openVariantModal = (product: Product) => {
    setSelectedProduct(product);
    resetVariantForm();
    setShowVariantModal(true);
  };

  const openEditVariant = (product: Product, variant: ProductVariant) => {
    setSelectedProduct(product);
    setEditingVariantId(variant.id);
    setVariantName(variant.name);
    setVariantSku(variant.sku ?? '');
    setVariantPrice(variant.price != null ? String(variant.price) : '');
    setVariantStock(String(variant.stock));
    setVariantAttr(
      Object.entries(variant.attributes)
        .map(([k, v]) => `${k}:${v}`)
        .join(', '),
    );
    setShowVariantModal(true);
  };

  const handleVariantSubmit = async () => {
    if (!currentWorkspace || !selectedProduct) return;
    if (!variantName.trim() || !variantSku.trim()) {
      addToast('warning', '请填写必填项', '变体名称和 SKU 不能为空');
      return;
    }
    setVariantSubmitting(true);
    try {
      let attributes: Record<string, string> = {};
      if (variantAttr.trim()) {
        variantAttr.split(',').forEach((pair) => {
          const [k, v] = pair.split(':').map((s) => s.trim());
          if (k && v) attributes[k] = v;
        });
      }

      const parsedPrice = variantPrice.trim() === '' ? null : parseFloat(variantPrice);

      if (editingVariantId) {
        await productService.updateVariant(
          currentWorkspace.slug,
          selectedProduct.id,
          editingVariantId,
          {
            name: variantName.trim(),
            sku: variantSku.trim(),
            price: parsedPrice,
            stock: parseInt(variantStock) || 0,
            attributes,
          } as any,
        );
        addToast('success', '变体已更新');
      } else {
        await productService.addVariant(currentWorkspace.slug, selectedProduct.id, {
          name: variantName.trim(),
          sku: variantSku.trim(),
          price: parsedPrice,
          stock: parseInt(variantStock) || 0,
          attributes,
        } as any);
        addToast('success', '变体已添加');
      }
      setShowVariantModal(false);
      resetVariantForm();
      fetchProducts();
    } catch (err: any) {
      addToast('error', editingVariantId ? '更新失败' : '添加失败', err?.response?.data?.detail || '请稍后重试');
    } finally {
      setVariantSubmitting(false);
    }
  };

  const handleDeleteVariant = (productId: string, variant: ProductVariant) => {
    setConfirmModal({
      isOpen: true,
      title: '确认删除变体',
      message: `确定要删除变体「${variant.name}」吗？`,
      onConfirm: async () => {
        if (!currentWorkspace) return;
        try {
          await productService.deleteVariant(currentWorkspace.slug, productId, variant.id);
          addToast('success', '变体已删除');
          fetchProducts();
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        } catch (err: any) {
          addToast('error', '删除失败', err?.response?.data?.detail || '请稍后重试');
        }
      },
    });
  };

  const resetCategoryForm = () => {
    setEditingCategoryId(null);
    setCategoryName('');
    setCategoryParent('');
  };

  const openEditCategory = (cat: ProductCategory) => {
    setEditingCategoryId(cat.id);
    setCategoryName(cat.name);
    setCategoryParent(cat.parent_id || '');
  };

  const handleCategorySubmit = async () => {
    if (!currentWorkspace) return;
    if (!categoryName.trim()) {
      addToast('warning', '请输入分类名称');
      return;
    }
    setCategorySubmitting(true);
    try {
      if (editingCategoryId) {
        await productService.updateCategory(currentWorkspace.slug, editingCategoryId, {
          name: categoryName.trim(),
          parent_id: categoryParent || null,
        });
        addToast('success', '分类已更新');
      } else {
        const slug = categoryName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        await productService.createCategory(currentWorkspace.slug, {
          name: categoryName.trim(),
          slug,
          parent_id: categoryParent || null,
        });
        addToast('success', '分类已创建');
      }
      resetCategoryForm();
      fetchCategories();
    } catch (err: any) {
      addToast('error', editingCategoryId ? '更新失败' : '创建失败', err?.response?.data?.detail || '请稍后重试');
    } finally {
      setCategorySubmitting(false);
    }
  };

  const handleDeleteCategory = (cat: ProductCategory) => {
    setConfirmModal({
      isOpen: true,
      title: '确认删除分类',
      message: `确定要删除分类「${cat.name}」吗？${(cat.children ?? []).length > 0 ? '该分类下的子分类将保持不变。' : ''}`,
      onConfirm: async () => {
        if (!currentWorkspace) return;
        try {
          await productService.deleteCategory(currentWorkspace.slug, cat.id);
          addToast('success', '分类已删除');
          fetchCategories();
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        } catch (err: any) {
          addToast('error', '删除失败', err?.response?.data?.detail || '请稍后重试');
        }
      },
    });
  };

  const handleAIApply = (result: { title: string; description: string; highlights: string[]; tags: string[] }) => {
    if (result.title && !formName) {
      setFormName(result.title);
    }
    setFormDescription(result.description);
    if (result.highlights.length > 0) {
      setFormDescription((prev) => {
        const highlightsText = '\n\n核心卖点：\n' + result.highlights.map((h) => '• ' + h).join('\n');
        return prev + highlightsText;
      });
    }
    setFormTags(result.tags.join(', '));
    setShowAIModal(false);
    addToast('success', 'AI 描述已应用');
  };

  const toggleCategory = (id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderCategoryTree = (cats: ProductCategory[], depth: number = 0): React.ReactNode => {
    return cats.map((cat) => {
      const children = cat.children ?? [];
      return (
      <div key={cat.id}>
        <button
          onClick={() => {
            toggleCategory(cat.id);
            setCategoryFilter(cat.id);
          }}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
            categoryFilter === cat.id ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
          }`}
          style={{ paddingLeft: `${12 + depth * 20}px` }}
        >
          {children.length > 0 ? (
            expandedCategories.has(cat.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />
          ) : (
            <span className="w-4" />
          )}
          {children.length > 0 ? (
            expandedCategories.has(cat.id) ? <FolderOpen size={16} /> : <Folder size={16} />
          ) : (
            <Folder size={16} />
          )}
          <span className="flex-1 truncate">{cat.name}</span>
        </button>
        {expandedCategories.has(cat.id) && children.length > 0 && (
          <div>{renderCategoryTree(children, depth + 1)}</div>
        )}
      </div>
    )});
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <X size={24} className="text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">加载失败</h3>
        <p className="text-sm text-gray-500 mt-1">{error}</p>
        <Button variant="outline" className="mt-4" onClick={fetchProducts}>重试</Button>
      </div>
    );
  }

  const columns = [
    { key: 'name', header: '商品名称', render: (p: Product) => (
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
          {p.images?.[0] ? (
            <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
          ) : (
            <Package size={18} className="text-gray-500" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
          <p className="text-xs text-gray-500">{p.sku}</p>
        </div>
      </div>
    )},
    { key: 'category', header: '类目', render: (p: Product) => (
      <span className="text-sm text-gray-600">{p.category || '-'}</span>
    )},
    { key: 'price', header: '价格', render: (p: Product) => (
      <div>
        <span className="text-sm font-medium text-slate-900">{formatPrice(p.price)}</span>
        {p.compare_at_price && (
          <span className="text-xs text-gray-500 line-through ml-1.5">{formatPrice(p.compare_at_price)}</span>
        )}
      </div>
    )},
    { key: 'status', header: '状态', render: (p: Product) => {
      const s = statusMap[p.status] || { label: p.status, variant: 'gray' as const };
      return <Badge variant={s.variant}>{s.label}</Badge>;
    }},
    { key: 'tags', header: '标签', render: (p: Product) => {
      const tags = Array.isArray(p.tags) ? p.tags : [];
      return (
      <div className="flex flex-wrap gap-1">
        {tags.slice(0, 3).map((tag) => (
          <Badge key={tag} variant="blue">{tag}</Badge>
        ))}
        {tags.length > 3 && <Badge variant="gray">+{tags.length - 3}</Badge>}
      </div>
    )}},
    { key: 'actions', header: '操作', className: 'text-right', render: (p: Product) => (
      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={() => openVariantModal(p)} leftIcon={<Layers size={14} />}>
          变体
        </Button>
        <Button variant="ghost" size="sm" onClick={() => openEditModal(p)} leftIcon={<Edit3 size={14} />} />
        <Button variant="ghost" size="sm" onClick={() => handleDeleteProduct(p)} leftIcon={<Trash2 size={14} className="text-red-500" />} />
      </div>
    )},
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">商品管理</h2>
          <p className="mt-1 text-sm text-gray-500">管理你的商品目录、分类和变体</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchProducts()}
            leftIcon={<RefreshCw size={16} />}
          >
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowCategoryModal(true)} leftIcon={<FolderOpen size={16} />}>
            分类管理
          </Button>
          <Button variant="primary" size="sm" onClick={openCreateModal} leftIcon={<Plus size={16} />}>
            添加商品
          </Button>
        </div>
      </div>

      {/* 筛选栏 */}
      <Card padding>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="搜索商品名称或 SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search size={16} />}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500"
          >
            <option value="">全部状态</option>
            {statusOrder.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {/* 状态筛选指示器 */}
          {statusFilter && (
            <div className="flex items-center gap-1.5">
              <span className={`inline-block w-2 h-2 rounded-full ${statusOrder.find((s) => s.value === statusFilter)?.color || 'bg-gray-400'}`} />
              <span className="text-xs text-gray-500">
                {statusOrder.find((s) => s.value === statusFilter)?.label}
              </span>
            </div>
          )}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500"
          >
            <option value="">全部分类</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {(searchQuery || statusFilter || categoryFilter) && (
            <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setStatusFilter(''); setCategoryFilter(''); }}>
              <X size={14} /> 清除筛选
            </Button>
          )}
        </div>
      </Card>

      {/* 分类树 + 商品列表 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 分类树 */}
        <Card title="商品分类" className="lg:col-span-1" padding>
          {categories.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">暂无分类</p>
          ) : (
            <div className="space-y-0.5 -mx-2">
              <button
                onClick={() => setCategoryFilter('')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                  !categoryFilter ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Folder size={16} />
                <span>全部分类</span>
                <Badge variant="gray">{totalItems}</Badge>
              </button>
              {renderCategoryTree(categories)}
            </div>
          )}
        </Card>

        {/* 商品列表 */}
        <div className="lg:col-span-3">
          <Card padding={false}>
            <Table
              columns={columns}
              data={products}
              keyExtractor={(p) => p.id}
              isLoading={isLoading}
              emptyTitle="暂无商品"
              emptyDescription="点击「添加商品」按钮创建你的第一个商品"
            />
            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <span className="text-sm text-gray-500">
                  共 {totalItems} 条，第 {page}/{totalPages} 页
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    leftIcon={<ChevronLeft size={14} />}
                  >
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    下一页
                    <ChevronRight size={14} className="ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* 商品创建/编辑 Modal */}
      <Modal
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        title={editingProduct ? '编辑商品' : '添加商品'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="商品名称" placeholder="商品名称" value={formName} onChange={(e) => setFormName(e.target.value)} error={errors.name} />
            <Input label="Slug" placeholder="url-friendly-slug" value={formSlug} onChange={(e) => setFormSlug(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="类目" placeholder="商品类目" value={formCategory} onChange={(e) => setFormCategory(e.target.value)} />
            <Input label="品牌" placeholder="品牌名称" value={formBrand} onChange={(e) => setFormBrand(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="SKU" placeholder="商品编码" value={formSku} onChange={(e) => setFormSku(e.target.value)} error={errors.sku} />
            <Input label="条形码" placeholder="条形码" value={formBarcode} onChange={(e) => setFormBarcode(e.target.value)} />
            <Input label="重量 (kg)" type="number" placeholder="0.00" value={formWeight} onChange={(e) => setFormWeight(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="售价" type="number" placeholder="0.00" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} error={errors.price} />
            <Input label="原价" type="number" placeholder="0.00" value={formComparePrice} onChange={(e) => setFormComparePrice(e.target.value)} />
            <Input label="成本价" type="number" placeholder="0.00" value={formCostPrice} onChange={(e) => setFormCostPrice(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">商品描述</label>
            <div className="flex items-center gap-2 mb-2">
              <Button variant="outline" size="sm" onClick={() => setShowAIModal(true)} leftIcon={<Sparkles size={14} />}>
                AI 生成描述
              </Button>
            </div>
            <textarea
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 transition-colors duration-200 resize-none"
              rows={4}
              placeholder="商品描述..."
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="标签" placeholder="用逗号分隔，如：夏季新品,纯棉" value={formTags} onChange={(e) => setFormTags(e.target.value)} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">状态</label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as 'draft' | 'active' | 'archived')}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500"
              >
                <option value="draft">草稿</option>
                <option value="active">在售</option>
                <option value="archived">已归档</option>
              </select>
            </div>
          </div>
          <ModalFooter
            onCancel={() => setShowProductModal(false)}
            onConfirm={handleProductSubmit}
            confirmText={editingProduct ? '保存修改' : '创建商品'}
            isLoading={formSubmitting}
          />
        </div>
      </Modal>

      {/* 变体管理 Modal */}
      <Modal
        isOpen={showVariantModal}
        onClose={() => { setShowVariantModal(false); resetVariantForm(); }}
        title={`变体管理 - ${selectedProduct?.name || ''}`}
        size="md"
      >
        <div className="space-y-4">
          {/* 现有变体 */}
          {selectedProduct?.variants && selectedProduct.variants.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">已有变体</p>
              {selectedProduct.variants.map((v: ProductVariant) => (
                <div key={v.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{v.name}</p>
                    <p className="text-xs text-gray-500">
                      SKU: {v.sku} | {formatPrice(v.price ?? 0)} | 库存: {v.stock}
                    </p>
                    {Object.keys(v.attributes).length > 0 && (
                      <p className="text-xs text-gray-500">
                        {Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditVariant(selectedProduct!, v)}
                    >
                      <Edit3 size={14} className="text-gray-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteVariant(selectedProduct!.id, v)}
                    >
                      <Trash2 size={14} className="text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 添加/编辑变体 */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">
              {editingVariantId ? '编辑变体' : '添加变体'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="变体名称" placeholder="如：红色-XL" value={variantName} onChange={(e) => setVariantName(e.target.value)} />
              <Input label="SKU" placeholder="变体编码" value={variantSku} onChange={(e) => setVariantSku(e.target.value)} />
              <Input label="价格" type="number" placeholder="0.00" value={variantPrice} onChange={(e) => setVariantPrice(e.target.value)} />
              <Input label="库存" type="number" placeholder="0" value={variantStock} onChange={(e) => setVariantStock(e.target.value)} />
            </div>
            <div className="mt-3">
              <Input label="属性" placeholder="格式：颜色:红色,尺码:XL" value={variantAttr} onChange={(e) => setVariantAttr(e.target.value)} />
            </div>
            {editingVariantId && (
              <div className="mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resetVariantForm()}
                >
                  <X size={14} className="mr-1" /> 取消编辑
                </Button>
              </div>
            )}
          </div>
          <ModalFooter
            onCancel={() => { setShowVariantModal(false); resetVariantForm(); }}
            onConfirm={handleVariantSubmit}
            confirmText={editingVariantId ? '保存变体' : '添加变体'}
            isLoading={variantSubmitting}
          />
        </div>
      </Modal>

      {/* 分类管理 Modal */}
      <Modal
        isOpen={showCategoryModal}
        onClose={() => { setShowCategoryModal(false); resetCategoryForm(); }}
        title="分类管理"
        size="md"
      >
        <div className="space-y-4">
          {/* 现有分类树 */}
          {categories.length > 0 && (
            <div className="border border-gray-300 rounded-lg p-3 max-h-48 overflow-y-auto">
              <p className="text-xs font-medium text-gray-500 mb-2">现有分类</p>
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between py-1 text-sm text-gray-700">
                  <div className="flex items-center gap-2 min-w-0">
                    <Folder size={14} className="text-gray-500 flex-shrink-0" />
                    <span className="truncate">{cat.name}</span>
                    {(cat.children ?? []).length > 0 && (
                      <span className="text-xs text-gray-500">({(cat.children ?? []).length} 子分类)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditCategory(cat)}
                    >
                      <Edit3 size={14} className="text-gray-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteCategory(cat)}
                    >
                      <Trash2 size={14} className="text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 添加/编辑分类 */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">
              {editingCategoryId ? '编辑分类' : '添加分类'}
            </p>
            <div className="space-y-3">
              <Input label="分类名称" placeholder="如：服装" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">父分类</label>
                <select
                  value={categoryParent}
                  onChange={(e) => setCategoryParent(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500"
                >
                  <option value="">无（顶级分类）</option>
                  {categories
                    .filter((c) => c.id !== editingCategoryId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
              </div>
            </div>
            {editingCategoryId && (
              <div className="mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetCategoryForm}
                >
                  <X size={14} className="mr-1" /> 取消编辑
                </Button>
              </div>
            )}
          </div>
          <ModalFooter
            onCancel={() => { setShowCategoryModal(false); resetCategoryForm(); }}
            onConfirm={handleCategorySubmit}
            confirmText={editingCategoryId ? '保存分类' : '创建分类'}
            isLoading={categorySubmitting}
          />
        </div>
      </Modal>

      {/* AI 生成 Modal */}
      <Modal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        title="AI 商品描述生成"
        size="lg"
      >
        <AIProductGenerator onApply={handleAIApply} />
      </Modal>

      {/* 确认删除 Modal */}
      <Modal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        title={confirmModal.title}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
            <p className="text-sm text-gray-600 pt-1.5">{confirmModal.message}</p>
          </div>
          <ModalFooter
            onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
            onConfirm={confirmModal.onConfirm}
            confirmText="确认删除"
            isLoading={confirmModal.isLoading}
            confirmVariant="danger"
          />
        </div>
      </Modal>
    </div>
  );
};