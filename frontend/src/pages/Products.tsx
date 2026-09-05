import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  Package,
  Tag,
  Check,
  History,
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
  Download,
  Upload,
  MessageSquare,
  Image as ImageIcon,
  Eye,
  EyeOff,
  Reply,
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
import { Table } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { AIProductGenerator } from '@/components/ecommerce/AIProductGenerator';
import StarRating from '@/components/ecommerce/StarRating';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import { productService, reviewService } from '@/services/ecommerce';
import api from '@/services/api';
import { useSearchParams } from 'react-router-dom';
import type { PaginatedResult } from '@/services/ecommerce';
import type { Product, ProductVariant, ProductCategory, ReviewStats, Review } from '@/types/ecommerce';
import { usePageT, type Lang } from '@/i18n';

const PAGE_SIZE = 10;

// ============================================================
// i18n 页面字典
// ============================================================

const D = {
  zh: {
    page_title: '商品管理',
    page_subtitle: '管理你的商品目录、分类和变体',
    export_excel: '导出Excel',
    import_csv: '导入CSV',
    refresh: '刷新',
    category_manage: '分类管理',
    add_product: '添加商品',
    search_placeholder: '搜索商品名称或 SKU...',
    search_aria: '搜索商品',
    all_statuses: '全部状态',
    all_categories: '全部分类',
    clear_filters: '清除筛选',
    load_failed: '加载失败',
    retry: '重试',
    err_load_products: '加载商品列表失败',
    name_required: '商品名称不能为空',
    sku_required: 'SKU 不能为空',
    price_required: '价格不能为空',
    price_invalid: '请输入有效的价格',
    product_updated: '商品已更新',
    shopify_sync_warn: 'Shopify 同步提示',
    product_created: '商品已创建',
    op_failed: '操作失败',
    pls_retry: '请稍后重试',
    confirm_delete: '确认删除',
    delete_product_msg: '确定要删除商品「{name}」吗？删除后可在 5 秒内撤销。',
    product_deleted: '商品已删除',
    removed_msg: '「{name}」已移除',
    undo: '撤销',
    restored: '已恢复',
    restored_msg: '「{name}」已恢复',
    restore_failed: '恢复失败',
    restore_manual: '请手动重新创建商品',
    delete_failed: '删除失败',
    batch_deleted_msg: '已删除 {n} 个商品',
    batch_restored_msg: '{n} 个商品已恢复',
    batch_restore_failed: '部分商品恢复失败，请手动重新创建',
    batch_delete_failed: '批量删除失败',
    batch_delete_partial: '部分商品删除失败',
    fill_required: '请填写必填项',
    variant_required: '变体名称和 SKU 不能为空',
    variant_updated: '变体已更新',
    variant_added: '变体已添加',
    update_failed: '更新失败',
    add_failed: '添加失败',
    confirm_delete_variant: '确认删除变体',
    delete_variant_msg: '确定要删除变体「{name}」吗？',
    variant_deleted: '变体已删除',
    category_name_required: '请输入分类名称',
    category_updated: '分类已更新',
    category_created: '分类已创建',
    create_failed: '创建失败',
    confirm_delete_category: '确认删除分类',
    delete_category_msg: '确定要删除分类「{name}」吗？',
    children_remain: '该分类下的子分类将保持不变。',
    category_deleted: '分类已删除',
    import_done: '导入完成',
    imported_count: '成功导入 {n} 件商品',
    import_failed: '导入失败',
    error_occurred: '发生错误',
    ai_highlights: '核心卖点：',
    ai_applied: 'AI 描述已应用',
    load_reviews_failed: '加载评论失败',
    replied: '已回复',
    reply_failed: '回复失败',
    approved: '已通过审核',
    hidden: '已隐藏',
    st_active: '在售',
    st_draft: '草稿',
    st_archived: '已归档',
    col_name: '商品名称',
    col_category: '类目',
    col_sku: 'SKU',
    col_desc: '描述',
    col_stock: '库存',
    col_price: '价格',
    col_reviews: '评价',
    col_status: '状态',
    col_tags: '标签',
    col_actions: '操作',
    no_reviews: '暂无评价',
    variant: '变体',
    low_mark: '⚠低',
    edit_product_aria: '编辑商品',
    delete_product_aria: '删除商品',
    product_categories: '商品分类',
    no_categories: '暂无分类',
    tree_aria: '商品分类树',
    selected_count: '已选择 {n} 项',
    deselect: '取消选择',
    batch_delete: '批量删除',
    batch_edit: '批量编辑',
    batch_edit_title: '批量编辑商品',
    batch_price: '批量改价',
    batch_stock: '批量改库存',
    batch_category: '批量改分类',
    batch_edit_done: '批量更新完成',
    batch_edit_fail: '批量更新失败',
    stock_movements: '库存流水',
    no_movements: '暂无库存变动记录',
    empty_products: '暂无商品',
    empty_products_desc: '点击「添加商品」按钮创建你的第一个商品',
    total_pages: '共 {total} 条，第 {page}/{totalPages} 页',
    prev_page: '上一页',
    next_page: '下一页',
    review_manage: '评价管理 - {name}',
    review_count: '{n} 条评价',
    close_reviews_aria: '关闭评价面板',
    loading: '加载中...',
    no_reviews_desc: '该商品还没有收到评价',
    verified_purchase: '已验证购买',
    hide: '隐藏',
    approve: '通过',
    seller_reply: '卖家回复',
    reply_placeholder: '回复此评价...',
    reply: '回复',
    edit_product: '编辑商品',
    product_name_label: '商品名称',
    product_name_placeholder: '商品名称',
    category_label: '类目',
    category_placeholder: '商品类目',
    brand: '品牌',
    brand_placeholder: '品牌名称',
    sku_label: 'SKU',
    sku_placeholder: '商品编码',
    barcode: '条形码',
    barcode_placeholder: '条形码',
    weight: '重量 (kg)',
    stock: '库存',
    low_stock: '低库存预警',
    price_label: '售价',
    compare_price: '原价',
    cost_price: '成本价',
    description: '商品描述',
    ai_generate: 'AI 生成描述',
    desc_placeholder: '输入商品描述，支持加粗、图片、列表...',
    tags: '标签',
    tags_placeholder: '用逗号分隔，如：夏季新品,纯棉',
    status_label: '状态',
    save_changes: '保存修改',
    create_product: '创建商品',
    variant_manage: '变体管理 - {name}',
    existing_variants: '已有变体',
    variant_info: 'SKU: {sku} | {price} | 库存: {stock}',
    edit_variant_aria: '编辑变体',
    delete_variant_aria: '删除变体',
    edit_variant: '编辑变体',
    add_variant: '添加变体',
    variant_name: '变体名称',
    variant_name_placeholder: '如：红色-XL',
    variant_sku_placeholder: '变体编码',
    attr: '属性',
    attr_placeholder: '格式：颜色:红色,尺码:XL',
    cancel_edit: '取消编辑',
    save_variant: '保存变体',
    existing_categories: '现有分类',
    subcategories_count: '({n} 子分类)',
    edit_category_aria: '编辑分类',
    delete_category_aria: '删除分类',
    edit_category: '编辑分类',
    add_category: '添加分类',
    category_name_label: '分类名称',
    category_name_placeholder: '如：服装',
    parent_category: '父分类',
    no_parent: '无（顶级分类）',
    save_category: '保存分类',
    create_category: '创建分类',
    ai_title: 'AI 商品描述生成',
  },
  en: {
    page_title: 'Products',
    page_subtitle: 'Manage your catalog, categories and variants',
    export_excel: 'Export Excel',
    import_csv: 'Import CSV',
    refresh: 'Refresh',
    category_manage: 'Categories',
    add_product: 'Add product',
    search_placeholder: 'Search by product name or SKU...',
    search_aria: 'Search products',
    all_statuses: 'All statuses',
    all_categories: 'All categories',
    clear_filters: 'Clear filters',
    load_failed: 'Failed to load',
    retry: 'Retry',
    err_load_products: 'Failed to load products',
    name_required: 'Product name is required',
    sku_required: 'SKU is required',
    price_required: 'Price is required',
    price_invalid: 'Please enter a valid price',
    product_updated: 'Product updated',
    shopify_sync_warn: 'Shopify sync notice',
    product_created: 'Product created',
    op_failed: 'Operation failed',
    pls_retry: 'Please try again later',
    confirm_delete: 'Delete',
    delete_product_msg: 'Delete product "{name}"? You can undo within 5 seconds.',
    product_deleted: 'Product deleted',
    removed_msg: '"{name}" removed',
    undo: 'Undo',
    restored: 'Restored',
    restored_msg: '"{name}" restored',
    restore_failed: 'Restore failed',
    restore_manual: 'Please recreate the product manually',
    delete_failed: 'Delete failed',
    batch_deleted_msg: 'Deleted {n} products',
    batch_restored_msg: '{n} products restored',
    batch_restore_failed: 'Some products failed to restore. Please recreate them manually',
    batch_delete_failed: 'Batch delete failed',
    batch_delete_partial: 'Some products failed to delete',
    fill_required: 'Please fill required fields',
    variant_required: 'Variant name and SKU are required',
    variant_updated: 'Variant updated',
    variant_added: 'Variant added',
    update_failed: 'Update failed',
    add_failed: 'Add failed',
    confirm_delete_variant: 'Delete variant',
    delete_variant_msg: 'Delete variant "{name}"?',
    variant_deleted: 'Variant deleted',
    category_name_required: 'Please enter a category name',
    category_updated: 'Category updated',
    category_created: 'Category created',
    create_failed: 'Create failed',
    confirm_delete_category: 'Delete category',
    delete_category_msg: 'Delete category "{name}"?',
    children_remain: 'Subcategories under it will remain unchanged.',
    category_deleted: 'Category deleted',
    import_done: 'Import complete',
    imported_count: 'Successfully imported {n} products',
    import_failed: 'Import failed',
    error_occurred: 'An error occurred',
    ai_highlights: 'Key highlights:',
    ai_applied: 'AI description applied',
    load_reviews_failed: 'Failed to load reviews',
    replied: 'Replied',
    reply_failed: 'Reply failed',
    approved: 'Approved',
    hidden: 'Hidden',
    st_active: 'Active',
    st_draft: 'Draft',
    st_archived: 'Archived',
    col_name: 'Product name',
    col_category: 'Category',
    col_sku: 'SKU',
    col_desc: 'Description',
    col_stock: 'Stock',
    col_price: 'Price',
    col_reviews: 'Reviews',
    col_status: 'Status',
    col_tags: 'Tags',
    col_actions: 'Actions',
    no_reviews: 'No reviews',
    variant: 'Variants',
    low_mark: '⚠Low',
    edit_product_aria: 'Edit product',
    delete_product_aria: 'Delete product',
    product_categories: 'Categories',
    no_categories: 'No categories',
    tree_aria: 'Product categories tree',
    selected_count: '{n} selected',
    deselect: 'Deselect',
    batch_delete: 'Batch delete',
    empty_products: 'No products yet',
    empty_products_desc: 'Click "Add product" to create your first product',
    total_pages: '{total} total, page {page}/{totalPages}',
    prev_page: 'Previous',
    next_page: 'Next',
    review_manage: 'Reviews - {name}',
    review_count: '{n} reviews',
    close_reviews_aria: 'Close reviews panel',
    loading: 'Loading...',
    no_reviews_desc: 'This product has no reviews yet',
    verified_purchase: 'Verified purchase',
    hide: 'Hide',
    approve: 'Approve',
    seller_reply: 'Seller reply',
    reply_placeholder: 'Reply to this review...',
    reply: 'Reply',
    edit_product: 'Edit product',
    product_name_label: 'Product name',
    product_name_placeholder: 'Product name',
    category_label: 'Category',
    category_placeholder: 'Product category',
    brand: 'Brand',
    brand_placeholder: 'Brand name',
    sku_label: 'SKU',
    sku_placeholder: 'Product code',
    barcode: 'Barcode',
    barcode_placeholder: 'Barcode',
    weight: 'Weight (kg)',
    stock: 'Stock',
    low_stock: 'Low stock alert',
    price_label: 'Price',
    compare_price: 'Compare at',
    cost_price: 'Cost price',
    description: 'Description',
    ai_generate: 'AI generate description',
    desc_placeholder: 'Enter description, supports bold, images, lists...',
    tags: 'Tags',
    tags_placeholder: 'Comma separated, e.g. summer, cotton',
    status_label: 'Status',
    save_changes: 'Save changes',
    create_product: 'Create product',
    variant_manage: 'Variants - {name}',
    existing_variants: 'Existing variants',
    variant_info: 'SKU: {sku} | {price} | Stock: {stock}',
    edit_variant_aria: 'Edit variant',
    delete_variant_aria: 'Delete variant',
    edit_variant: 'Edit variant',
    add_variant: 'Add variant',
    variant_name: 'Variant name',
    variant_name_placeholder: 'e.g. Red-XL',
    variant_sku_placeholder: 'Variant code',
    attr: 'Attributes',
    attr_placeholder: 'Format: color:red,size:XL',
    cancel_edit: 'Cancel editing',
    save_variant: 'Save variant',
    existing_categories: 'Existing categories',
    subcategories_count: '({n} subcategories)',
    edit_category_aria: 'Edit category',
    delete_category_aria: 'Delete category',
    edit_category: 'Edit category',
    add_category: 'Add category',
    category_name_label: 'Category name',
    category_name_placeholder: 'e.g. Clothing',
    parent_category: 'Parent category',
    no_parent: 'None (top-level)',
    save_category: 'Save category',
    create_category: 'Create category',
    ai_title: 'AI product description generator',
  },
} as Record<Lang, Record<string, string>>;

type T = (key: string, fallback?: string) => string;

const getStatusMap = (t: T): Record<string, { label: string; variant: 'success' | 'warning' | 'neutral' }> => ({
  active: { label: t('st_active'), variant: 'success' },
  draft: { label: t('st_draft'), variant: 'warning' },
  archived: { label: t('st_archived'), variant: 'neutral' },
});

const getStatusOrder = (t: T) => [
  { value: 'active', label: t('st_active'), color: 'bg-green-500' },
  { value: 'draft', label: t('st_draft'), color: 'bg-yellow-500' },
  { value: 'archived', label: t('st_archived'), color: 'bg-gray-400' },
];

const formatPrice = (price: number) => `¥${price.toFixed(2)}`;

// 商品来源徽章：从同步写入的 SKU 前缀推断平台（shopify-* / dy-* / sandbox-*）
const PLATFORM_FROM_SKU: Array<[RegExp, string, string]> = [
  [/^shopify-/i, 'Shopify', 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'],
  [/^dy-/i, '抖音', 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600'],
  [/^sandbox-/i, '沙盒', 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800'],
];
const PlatformSourceBadge: React.FC<{ sku?: string | null }> = ({ sku }) => {
  if (!sku) return null;
  const hit = PLATFORM_FROM_SKU.find(([re]) => re.test(sku));
  if (!hit) return null;
  return (
    <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border ${hit[2]}`}>
      {hit[1]}
    </span>
  );
};

export const Products: React.FC = () => {
  const t = usePageT(D);
  usePageTitle(t('page_title'));
  const statusMap = getStatusMap(t);
  const statusOrder = getStatusOrder(t);
  const { currentWorkspace } = useWorkspace();
  const { addToast } = useToast();
  const { errors, setFieldError, clearErrors } = useFormErrors();
  const [searchParams, setSearchParams] = useSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [productRatings, setProductRatings] = useState<Record<string, ReviewStats>>({});
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set());
  const [selectedProductForReviews, setSelectedProductForReviews] = useState<Product | null>(null);
  const [productReviews, setProductReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [batchField, setBatchField] = useState<'price' | 'stock' | 'category' | null>(null);
  const [batchValue, setBatchValue] = useState('');
  const [isBatchEditing, setIsBatchEditing] = useState(false);
  const [stockMovements, setStockMovements] = useState<any[]>([]);
  const [showMovements, setShowMovements] = useState(false);
  const [movementsLoading, setMovementsLoading] = useState(false);

  // Search with debounce — initialized from URL params
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('q') || '');
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

  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || '');
  const [categoryFilter, setCategoryFilter] = useState<string>(searchParams.get('category') || '');

  // Sorting
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);

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
  const [formStock, setFormStock] = useState('');
  const [formLowStockThreshold, setFormLowStockThreshold] = useState('');
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

  // CSV Import
  const fileInputRef2 = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

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

      // Load review stats for all products
      const ratingsMap: Record<string, ReviewStats> = {};
      await Promise.all(
        paginated.items.map(async (product) => {
          try {
            const stats = await reviewService.getProductReviewStats(
              currentWorkspace.slug,
              product.id,
            );
            ratingsMap[product.id] = stats;
          } catch {
            // Silently skip
          }
        })
      );
      setProductRatings(ratingsMap);
    } catch (err: any) {
      setError(err?.response?.data?.detail || t('err_load_products'));
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

  // Sync filters to URL for shareable/bookmarkable links
  useEffect(() => {
    const params: Record<string, string> = {};
    if (debouncedSearch) params.q = debouncedSearch;
    if (statusFilter) params.status = statusFilter;
    if (categoryFilter) params.category = categoryFilter;
    setSearchParams(params, { replace: true });
  }, [debouncedSearch, statusFilter, categoryFilter, setSearchParams]);

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
    setFormStock('0');
    setFormLowStockThreshold('10');
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
    setFormStock(String(product.stock ?? 0));
    setFormLowStockThreshold(String(product.low_stock_threshold ?? 10));
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
      setFieldError('name', t('name_required'));
      hasError = true;
    }
    if (!formSku.trim()) {
      setFieldError('sku', t('sku_required'));
      hasError = true;
    }
    if (!formPrice) {
      setFieldError('price', t('price_required'));
      hasError = true;
    } else {
      const price = parseFloat(formPrice);
      if (isNaN(price) || price < 0) {
        setFieldError('price', t('price_invalid'));
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
        stock: parseInt(formStock) || 0,
        low_stock_threshold: parseInt(formLowStockThreshold) || 10,
        status: formStatus,
        tags: formTags.split(',').map((t) => t.trim()).filter(Boolean),
      };

      // Remove undefined values for clean payload
      Object.keys(payload).forEach((key) => {
        if (payload[key] === undefined) delete payload[key];
      });

      if (editingProduct) {
        const resp: any = await productService.updateProduct(currentWorkspace.slug, { id: editingProduct.id, ...payload } as any);
        addToast('success', t('product_updated'));
        // 双向同步：提示 Shopify 写入结果
        if (resp?.shopify_sync_warning) {
          addToast('warning', t('shopify_sync_warn'), resp.shopify_sync_warning);
        }
      } else {
        await productService.createProduct(currentWorkspace.slug, payload as any);
        addToast('success', t('product_created'));
      }
      setShowProductModal(false);
      fetchProducts();
    } catch (err: any) {
      addToast('error', t('op_failed'), err?.response?.data?.detail || t('pls_retry'));
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteProduct = (product: Product) => {
    setConfirmModal({
      isOpen: true,
      title: t('confirm_delete'),
      message: t('delete_product_msg').replace('{name}', product.name),
      onConfirm: async () => {
        if (!currentWorkspace) return;
        setConfirmModal((prev) => ({ ...prev, isLoading: true }));
        try {
          // Save product data for potential undo
          const deletedProduct = { ...product };
          await productService.deleteProduct(currentWorkspace.slug, product.id);
          addToast('success', t('product_deleted'), t('removed_msg').replace('{name}', product.name), {
            label: t('undo'),
            onClick: async () => {
              try {
                const { id, ...restoreData } = deletedProduct;
                await productService.createProduct(currentWorkspace.slug, restoreData as any);
                addToast('success', t('restored'), t('restored_msg').replace('{name}', product.name));
                fetchProducts();
              } catch {
                addToast('error', t('restore_failed'), t('restore_manual'));
              }
            },
          });
          fetchProducts();
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        } catch (err: any) {
          addToast('error', t('delete_failed'), err?.response?.data?.detail || t('pls_retry'));
        } finally {
          setConfirmModal((prev) => ({ ...prev, isLoading: false }));
        }
      },
    });
  };

  const openStockMovements = async (product: any) => {
    if (!currentWorkspace) return;
    setMovementsLoading(true);
    setShowMovements(true);
    try {
      const res: any = await api.get(`/workspaces/${currentWorkspace.slug}/products/${product.id}/movements`);
      setStockMovements(res.data?.items || []);
    } catch {
      setStockMovements([]);
    } finally {
      setMovementsLoading(false);
    }
  };

  const handleBatchEdit = async () => {
    if (!currentWorkspace || !batchField || selectedIds.size === 0) return;
    setIsBatchEditing(true);
    try {
      const payload: any = { ids: [...selectedIds] };
      if (batchField === 'price') payload.price = parseFloat(batchValue);
      else if (batchField === 'stock') payload.stock = parseInt(batchValue, 10);
      else if (batchField === 'category') payload.category = batchValue.trim();
      const res: any = await api.post(`/workspaces/${currentWorkspace.slug}/products/batch-edit`, payload);
      addToast('success', t('batch_edit_done'), res.data?.message || '');
      setBatchField(null);
      setBatchValue('');
      setSelectedIds(new Set());
      fetchProducts();
    } catch (err: any) {
      addToast('error', t('batch_edit_fail'), err?.response?.data?.detail || '');
    } finally {
      setIsBatchEditing(false);
    }
  };

  const handleBatchDelete = async () => {
    if (!currentWorkspace || selectedIds.size === 0) return;
    setIsBatchDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      // Save deleted products for potential undo
      const deletedProducts = products.filter((p) => ids.includes(p.id));
      await Promise.all(ids.map((id) => productService.deleteProduct(currentWorkspace.slug, id)));
      addToast('success', t('batch_deleted_msg').replace('{n}', String(ids.length)), undefined, {
        label: t('undo'),
        onClick: async () => {
          try {
            await Promise.all(deletedProducts.map((p) => {
              const { id, ...restoreData } = p;
              return productService.createProduct(currentWorkspace.slug, restoreData as any);
            }));
            addToast('success', t('restored'), t('batch_restored_msg').replace('{n}', String(deletedProducts.length)));
            fetchProducts();
          } catch {
            addToast('error', t('restore_failed'), t('batch_restore_failed'));
          }
        },
      });
      setSelectedIds(new Set());
      fetchProducts();
    } catch (err: any) {
      addToast('error', t('batch_delete_failed'), err?.response?.data?.detail || t('batch_delete_partial'));
    } finally {
      setIsBatchDeleting(false);
    }
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
      addToast('warning', t('fill_required'), t('variant_required'));
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
        addToast('success', t('variant_updated'));
      } else {
        await productService.addVariant(currentWorkspace.slug, selectedProduct.id, {
          name: variantName.trim(),
          sku: variantSku.trim(),
          price: parsedPrice,
          stock: parseInt(variantStock) || 0,
          attributes,
        } as any);
        addToast('success', t('variant_added'));
      }
      setShowVariantModal(false);
      resetVariantForm();
      fetchProducts();
    } catch (err: any) {
      addToast('error', editingVariantId ? t('update_failed') : t('add_failed'), err?.response?.data?.detail || t('pls_retry'));
    } finally {
      setVariantSubmitting(false);
    }
  };

  const handleDeleteVariant = (productId: string, variant: ProductVariant) => {
    setConfirmModal({
      isOpen: true,
      title: t('confirm_delete_variant'),
      message: t('delete_variant_msg').replace('{name}', variant.name),
      onConfirm: async () => {
        if (!currentWorkspace) return;
        try {
          await productService.deleteVariant(currentWorkspace.slug, productId, variant.id);
          addToast('success', t('variant_deleted'));
          fetchProducts();
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        } catch (err: any) {
          addToast('error', t('delete_failed'), err?.response?.data?.detail || t('pls_retry'));
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
      addToast('warning', t('category_name_required'));
      return;
    }
    setCategorySubmitting(true);
    try {
      if (editingCategoryId) {
        await productService.updateCategory(currentWorkspace.slug, editingCategoryId, {
          name: categoryName.trim(),
          parent_id: categoryParent || null,
        });
        addToast('success', t('category_updated'));
      } else {
        const slug = categoryName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        await productService.createCategory(currentWorkspace.slug, {
          name: categoryName.trim(),
          slug,
          parent_id: categoryParent || null,
        });
        addToast('success', t('category_created'));
      }
      resetCategoryForm();
      fetchCategories();
    } catch (err: any) {
      addToast('error', editingCategoryId ? t('update_failed') : t('create_failed'), err?.response?.data?.detail || t('pls_retry'));
    } finally {
      setCategorySubmitting(false);
    }
  };

  const handleDeleteCategory = (cat: ProductCategory) => {
    setConfirmModal({
      isOpen: true,
      title: t('confirm_delete_category'),
      message: t('delete_category_msg').replace('{name}', cat.name) + ((cat.children ?? []).length > 0 ? t('children_remain') : ''),
      onConfirm: async () => {
        if (!currentWorkspace) return;
        try {
          await productService.deleteCategory(currentWorkspace.slug, cat.id);
          addToast('success', t('category_deleted'));
          fetchCategories();
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        } catch (err: any) {
          addToast('error', t('delete_failed'), err?.response?.data?.detail || t('pls_retry'));
        }
      },
    });
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentWorkspace) return;
    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const slug = currentWorkspace.slug;
      const resp = await api.post(`/workspaces/${slug}/import/products`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      addToast('success', t('import_done'), t('imported_count').replace('{n}', String(resp.data.imported)));
      fetchProducts();
    } catch (err: any) {
      addToast('error', t('import_failed'), err?.response?.data?.detail || t('error_occurred'));
    } finally {
      setIsImporting(false);
      if (fileInputRef2.current) fileInputRef2.current.value = '';
    }
  };

  const handleAIApply = (result: { title: string; description: string; highlights: string[]; tags: string[] }) => {
    if (result.title && !formName) {
      setFormName(result.title);
    }
    setFormDescription(result.description);
    if (result.highlights.length > 0) {
      setFormDescription((prev) => {
        const highlightsText = '\n\n' + t('ai_highlights') + '\n' + result.highlights.map((h) => '• ' + h).join('\n');
        return prev + highlightsText;
      });
    }
    setFormTags(result.tags.join(', '));
    setShowAIModal(false);
    addToast('success', t('ai_applied'));
  };

  const toggleCategory = (id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadReviews = async (product: Product) => {
    if (!currentWorkspace) return;
    setSelectedProductForReviews(product);
    setReviewsLoading(true);
    try {
      const reviews = await reviewService.getReviews(currentWorkspace.slug, product.id);
      setProductReviews(reviews);
    } catch {
      addToast('error', t('load_reviews_failed'));
    } finally {
      setReviewsLoading(false);
    }
  };

  const handleReplySubmit = async (reviewId: string) => {
    if (!currentWorkspace || !replyText[reviewId]?.trim()) return;
    try {
      const updated = await reviewService.replyReview(currentWorkspace.slug, reviewId, { reply: replyText[reviewId].trim() });
      setProductReviews((prev) => prev.map((r) => (r.id === reviewId ? updated : r)));
      setReplyText((prev) => ({ ...prev, [reviewId]: '' }));
      addToast('success', t('replied'));
    } catch (err: any) {
      addToast('error', t('reply_failed'), err?.response?.data?.detail || '');
    }
  };

  const handleToggleApproval = async (reviewId: string) => {
    if (!currentWorkspace) return;
    try {
      const updated = await reviewService.toggleApproval(currentWorkspace.slug, reviewId);
      setProductReviews((prev) => prev.map((r) => (r.id === reviewId ? updated : r)));
      addToast('success', updated.is_approved ? t('approved') : t('hidden'));
    } catch (err: any) {
      addToast('error', t('op_failed'), err?.response?.data?.detail || '');
    }
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
          role="treeitem"
          aria-expanded={children.length > 0 ? expandedCategories.has(cat.id) : undefined}
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
        <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">{t('load_failed')}</h3>
        <p className="text-sm text-gray-500 mt-1">{error}</p>
        <Button variant="outline" className="mt-4" onClick={fetchProducts}>{t('retry')}</Button>
      </div>
    );
  }

  const handleSort = (key: string, direction: 'asc' | 'desc' | null) => {
    setSortKey(direction ? key : null);
    setSortDirection(direction);
  };

  const sortedProducts = useMemo(() => {
    if (!sortKey || !sortDirection) return products;
    const sorted = [...products];
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
  }, [products, sortKey, sortDirection]);

  const columns = [
    { key: 'name', header: t('col_name'), sortable: true, render: (p: Product) => (
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
          {p.images?.[0] ? (
            <img src={p.images[0]} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
          ) : (
            <Package size={18} className="text-gray-500 dark:text-gray-400" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-gray-100 truncate">{p.name}</p>
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{p.sku}</p>
            <PlatformSourceBadge sku={p.sku} />
          </div>
        </div>
      </div>
    )},
    { key: 'category', header: t('col_category'), render: (p: Product) => (
      <span className="text-sm text-gray-600">{p.category || '-'}</span>
    )},
    { key: 'sku', header: t('col_sku'), render: (p: Product) => (
      <span className="text-sm text-gray-600 font-mono">{p.sku || '-'}</span>
    )},
    { key: 'description', header: t('col_desc'), render: (p: Product) => (
      <div className="prose dark:prose-invert text-xs max-w-[200px] truncate" dangerouslySetInnerHTML={{ __html: p.description || '-' }} />
    )},
    { key: 'stock', header: t('col_stock'), sortable: true, render: (p: Product) => {
      const isLow = (p.stock ?? 0) <= (p.low_stock_threshold ?? 10);
      return (
        <span className={`text-sm font-semibold ${isLow ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
          {p.stock ?? 0}
          {isLow && <span className="ml-1 text-xs text-red-500 dark:text-red-400">{t('low_mark')}</span>}
        </span>
      );
    }},
    { key: 'price', header: t('col_price'), sortable: true, render: (p: Product) => (
      <div>
        <span className="text-sm font-medium text-slate-900 dark:text-gray-100">{formatPrice(p.price)}</span>
        {p.compare_at_price && (
          <span className="text-xs text-gray-500 line-through ml-1.5">{formatPrice(p.compare_at_price)}</span>
        )}
      </div>
    )},
    { key: 'reviews', header: t('col_reviews'), render: (p: Product) => {
      const stats = productRatings[p.id];
      if (!stats || stats.total_reviews === 0) {
        return (
          <button onClick={() => loadReviews(p)} className="text-xs text-gray-400 hover:text-primary-600 transition-colors cursor-pointer">
            {t('no_reviews')}
          </button>
        );
      }
      return (
        <button onClick={() => loadReviews(p)} className="flex items-center gap-1 cursor-pointer">
          <StarRating rating={stats.average_rating} count={stats.total_reviews} />
        </button>
      );
    }},
    { key: 'status', header: t('col_status'), render: (p: Product) => {
      const s = statusMap[p.status] || { label: p.status, variant: 'neutral' as const };
      return <Badge variant={s.variant}>{s.label}</Badge>;
    }},
    { key: 'tags', header: t('col_tags'), render: (p: Product) => {
      const tags = Array.isArray(p.tags) ? p.tags : [];
      return (
      <div className="flex flex-wrap gap-1">
        {tags.slice(0, 3).map((tag) => (
          <Badge key={tag} variant="primary">{tag}</Badge>
        ))}
        {tags.length > 3 && <Badge variant="neutral">+{tags.length - 3}</Badge>}
      </div>
    )}},
    { key: 'actions', header: t('col_actions'), className: 'text-right', render: (p: Product) => (
      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={() => openVariantModal(p)} leftIcon={<Layers size={14} />}>
          {t('variant')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => openStockMovements(p)} leftIcon={<History size={13} />} aria-label="库存流水" title="库存流水" />
        <Button variant="ghost" size="sm" onClick={() => openEditModal(p)} leftIcon={<Edit3 size={14} />} aria-label={t('edit_product_aria')} />
        <Button variant="ghost" size="sm" onClick={() => handleDeleteProduct(p)} leftIcon={<Trash2 size={14} className="text-red-500" />} aria-label={t('delete_product_aria')} />
      </div>
    )},
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 页面标题 */}
      <PageHeader
        title={t('page_title')}
        subtitle={t('page_subtitle')}
        actions={
          <>
            <a
              href={`/api/v1/workspaces/${currentWorkspace?.slug}/export/products`}
              download
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm" leftIcon={<Download size={16} />}>
                {t('export_excel')}
              </Button>
            </a>
            <input ref={fileInputRef2} type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef2.current?.click()}
              isLoading={isImporting}
              leftIcon={<Upload size={16} />}
            >
              {t('import_csv')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchProducts()}
              leftIcon={<RefreshCw size={16} />}
            >
              {t('refresh')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowCategoryModal(true)} leftIcon={<FolderOpen size={16} />}>
              {t('category_manage')}
            </Button>
            <Button variant="primary" size="sm" onClick={openCreateModal} leftIcon={<Plus size={16} />}>
              {t('add_product')}
            </Button>
          </>
        }
      />

      {/* 筛选栏 */}
      <Card padding>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder={t('search_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search size={16} />}
              aria-label={t('search_aria')}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500"
          >
            <option value="">{t('all_statuses')}</option>
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
            <option value="">{t('all_categories')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {(searchQuery || statusFilter || categoryFilter) && (
            <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setStatusFilter(''); setCategoryFilter(''); }}>
              <X size={14} /> {t('clear_filters')}
            </Button>
          )}
        </div>
      </Card>

      {/* 分类树 + 商品列表 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 分类树 */}
        <Card title={t('product_categories')} className="lg:col-span-1" padding>
          {categories.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">{t('no_categories')}</p>
          ) : (
            <div className="space-y-0.5 -mx-2" role="tree" aria-label={t('tree_aria')}>
              <button
                onClick={() => setCategoryFilter('')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                  !categoryFilter ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                }`}
                role="treeitem"
              >
                <Folder size={16} />
                <span>{t('all_categories')}</span>
                <Badge variant="neutral">{totalItems}</Badge>
              </button>
              {renderCategoryTree(categories)}
            </div>
          )}
        </Card>

        {/* 商品列表 */}
        <div className="lg:col-span-3">
          <Card padding={false}>
            {/* Batch Action Bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 bg-primary-50 dark:bg-primary-900/20 border-b border-primary-200 dark:border-primary-800 animate-fade-in">
                <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
                  {t('selected_count').replace('{n}', String(selectedIds.size))}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    {t('deselect')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBatchField('price')}
                    leftIcon={<span className="text-xs">¥</span>}
                  >
                    {t('batch_price')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBatchField('stock')}
                    leftIcon={<Package size={13} />}
                  >
                    {t('batch_stock')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBatchField('category')}
                    leftIcon={<Tag size={13} />}
                  >
                    {t('batch_category')}
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
              data={sortedProducts}
              keyExtractor={(p) => p.id}
              isLoading={isLoading}
              emptyTitle={t('empty_products')}
              emptyDescription={t('empty_products_desc')}
              onSort={handleSort}
              selectable
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
            />
            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <span className="text-sm text-gray-500">
                  {t('total_pages')
                    .replace('{total}', String(totalItems))
                    .replace('{page}', String(page))
                    .replace('{totalPages}', String(totalPages))}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    leftIcon={<ChevronLeft size={14} />}
                  >
                    {t('prev_page')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    {t('next_page')}
                    <ChevronRight size={14} className="ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Review Detail Panel */}
      {selectedProductForReviews && (
        <Card padding>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">
                {t('review_manage').replace('{name}', selectedProductForReviews.name)}
              </h3>
              <p className="text-sm text-gray-500">
                {t('review_count').replace('{n}', String(productReviews.length))}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedProductForReviews(null)} aria-label={t('close_reviews_aria')}>
              <X size={16} />
            </Button>
          </div>
          {reviewsLoading ? (
            <div className="text-center py-8 text-gray-500">{t('loading')}</div>
          ) : productReviews.length === 0 ? (
            <EmptyState icon={<MessageSquare size={40} />} title={t('no_reviews')} description={t('no_reviews_desc')} />
          ) : (
            <div className="space-y-4">
              {productReviews.map((review) => (
                <div key={review.id} className={`border rounded-lg p-4 ${review.is_approved ? 'bg-white' : 'bg-gray-50 border-dashed'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-sm font-semibold text-primary-700">
                        {review.customer_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900 dark:text-gray-100">{review.customer_name}</span>
                          <StarRating rating={review.rating} />
                          {review.is_verified && <Badge variant="success">{t('verified_purchase')}</Badge>}
                          {!review.is_approved && <Badge variant="warning">{t('hidden')}</Badge>}
                        </div>
                        <span className="text-xs text-gray-500">{new Date(review.created_at.includes('T') && !/Z|[+-]\d{2}:?\d{2}$/.test(review.created_at) ? review.created_at + 'Z' : review.created_at).toLocaleDateString('zh-CN')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleApproval(review.id)}
                        leftIcon={review.is_approved ? <EyeOff size={14} /> : <Eye size={14} />}
                      >
                        {review.is_approved ? t('hide') : t('approve')}
                      </Button>
                    </div>
                  </div>
                  {review.content && (
                    <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">{review.content}</p>
                  )}
                  {/* Review Images */}
                  {review.image_urls && review.image_urls.length > 0 && (
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {review.image_urls.map((url, idx) => (
                        <button
                          key={idx}
                          onClick={() => setEnlargedImage(url)}
                          className="w-16 h-16 rounded-lg border border-gray-200 overflow-hidden hover:ring-2 hover:ring-primary-400 transition-all cursor-pointer"
                        >
                          <img src={url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Seller Reply */}
                  {review.reply && (
                    <div className="mt-3 ml-8 pl-4 border-l-4 border-primary-400 bg-primary-50 rounded-r-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Reply size={14} className="text-primary-500" />
                        <span className="text-xs font-medium text-primary-600">{t('seller_reply')}</span>
                        {review.replied_at && (
                          <span className="text-xs text-gray-400">{new Date(review.replied_at).toLocaleDateString('zh-CN')}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{review.reply}</p>
                    </div>
                  )}
                  {/* Reply Input */}
                  {!review.reply && (
                    <div className="mt-3 ml-8 flex gap-2">
                      <Input
                        placeholder={t('reply_placeholder')}
                        value={replyText[review.id] || ''}
                        onChange={(e) => setReplyText((prev) => ({ ...prev, [review.id]: e.target.value }))}
                        className="flex-1"
                      />
                      <Button variant="primary" size="sm" onClick={() => handleReplySubmit(review.id)}>
                        <Reply size={14} className="mr-1" /> {t('reply')}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Image Lightbox（背景淡入 + 图片缩放浮现） */}
      {enlargedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer animate-fade-in"
          onClick={() => setEnlargedImage(null)}
        >
          <img
            src={enlargedImage}
            alt="Enlarged"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl animate-img-zoom-in"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            onClick={() => setEnlargedImage(null)}
          >
            <X size={32} />
          </button>
        </div>
      )}

      {/* 商品创建/编辑 Modal */}
      <Modal
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        title={editingProduct ? t('edit_product') : t('add_product')}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('product_name_label')} placeholder={t('product_name_placeholder')} value={formName} onChange={(e) => setFormName(e.target.value)} error={errors.name} />
            <Input label="Slug" placeholder="url-friendly-slug" value={formSlug} onChange={(e) => setFormSlug(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('category_label')} placeholder={t('category_placeholder')} value={formCategory} onChange={(e) => setFormCategory(e.target.value)} />
            <Input label={t('brand')} placeholder={t('brand_placeholder')} value={formBrand} onChange={(e) => setFormBrand(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label={t('sku_label')} placeholder={t('sku_placeholder')} value={formSku} onChange={(e) => setFormSku(e.target.value)} error={errors.sku} />
            <Input label={t('barcode')} placeholder={t('barcode_placeholder')} value={formBarcode} onChange={(e) => setFormBarcode(e.target.value)} />
            <Input label={t('weight')} type="number" placeholder="0.00" value={formWeight} onChange={(e) => setFormWeight(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label={t('stock')} type="number" placeholder="0" value={formStock} onChange={(e) => setFormStock(e.target.value)} />
            <Input label={t('low_stock')} type="number" placeholder="10" value={formLowStockThreshold} onChange={(e) => setFormLowStockThreshold(e.target.value)} />
            <div />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label={t('price_label')} type="number" placeholder="0.00" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} error={errors.price} />
            <Input label={t('compare_price')} type="number" placeholder="0.00" value={formComparePrice} onChange={(e) => setFormComparePrice(e.target.value)} />
            <Input label={t('cost_price')} type="number" placeholder="0.00" value={formCostPrice} onChange={(e) => setFormCostPrice(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('description')}</label>
            <div className="flex items-center gap-2 mb-2">
              <Button variant="outline" size="sm" onClick={() => setShowAIModal(true)} leftIcon={<Sparkles size={14} />}>
                {t('ai_generate')}
              </Button>
            </div>
            <RichTextEditor
              content={formDescription}
              onChange={setFormDescription}
              placeholder={t('desc_placeholder')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('tags')} placeholder={t('tags_placeholder')} value={formTags} onChange={(e) => setFormTags(e.target.value)} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('status_label')}</label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as 'draft' | 'active' | 'archived')}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500"
              >
                <option value="draft">{t('st_draft')}</option>
                <option value="active">{t('st_active')}</option>
                <option value="archived">{t('st_archived')}</option>
              </select>
            </div>
          </div>
          <ModalFooter
            onCancel={() => setShowProductModal(false)}
            onConfirm={handleProductSubmit}
            confirmText={editingProduct ? t('save_changes') : t('create_product')}
            isLoading={formSubmitting}
          />
        </div>
      </Modal>

      {/* 变体管理 Modal */}
      <Modal
        isOpen={showVariantModal}
        onClose={() => { setShowVariantModal(false); resetVariantForm(); }}
        title={t('variant_manage').replace('{name}', selectedProduct?.name || '')}
        size="md"
      >
        <div className="space-y-4">
          {/* 现有变体 */}
          {selectedProduct?.variants && selectedProduct.variants.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">{t('existing_variants')}</p>
              {selectedProduct.variants.map((v: ProductVariant) => (
                <div key={v.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-gray-100">{v.name}</p>
                    <p className="text-xs text-gray-500">
                      {t('variant_info')
                        .replace('{sku}', v.sku ?? '')
                        .replace('{price}', formatPrice(v.price ?? 0))
                        .replace('{stock}', String(v.stock))}
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
                      aria-label={t('edit_variant_aria')}
                    >
                      <Edit3 size={14} className="text-gray-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteVariant(selectedProduct!.id, v)}
                      aria-label={t('delete_variant_aria')}
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
              {editingVariantId ? t('edit_variant') : t('add_variant')}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Input label={t('variant_name')} placeholder={t('variant_name_placeholder')} value={variantName} onChange={(e) => setVariantName(e.target.value)} />
              <Input label={t('sku_label')} placeholder={t('variant_sku_placeholder')} value={variantSku} onChange={(e) => setVariantSku(e.target.value)} />
              <Input label={t('price_label')} type="number" placeholder="0.00" value={variantPrice} onChange={(e) => setVariantPrice(e.target.value)} />
              <Input label={t('stock')} type="number" placeholder="0" value={variantStock} onChange={(e) => setVariantStock(e.target.value)} />
            </div>
            <div className="mt-3">
              <Input label={t('attr')} placeholder={t('attr_placeholder')} value={variantAttr} onChange={(e) => setVariantAttr(e.target.value)} />
            </div>
            {editingVariantId && (
              <div className="mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resetVariantForm()}
                >
                  <X size={14} className="mr-1" /> {t('cancel_edit')}
                </Button>
              </div>
            )}
          </div>
          <ModalFooter
            onCancel={() => { setShowVariantModal(false); resetVariantForm(); }}
            onConfirm={handleVariantSubmit}
            confirmText={editingVariantId ? t('save_variant') : t('add_variant')}
            isLoading={variantSubmitting}
          />
        </div>
      </Modal>

      {/* 分类管理 Modal */}
      <Modal
        isOpen={showCategoryModal}
        onClose={() => { setShowCategoryModal(false); resetCategoryForm(); }}
        title={t('category_manage')}
        size="md"
      >
        <div className="space-y-4">
          {/* 现有分类树 */}
          {categories.length > 0 && (
            <div className="border border-gray-300 rounded-lg p-3 max-h-48 overflow-y-auto">
              <p className="text-xs font-medium text-gray-500 mb-2">{t('existing_categories')}</p>
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between py-1 text-sm text-gray-700">
                  <div className="flex items-center gap-2 min-w-0">
                    <Folder size={14} className="text-gray-500 flex-shrink-0" />
                    <span className="truncate">{cat.name}</span>
                    {(cat.children ?? []).length > 0 && (
                      <span className="text-xs text-gray-500">{t('subcategories_count').replace('{n}', String((cat.children ?? []).length))}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditCategory(cat)}
                      aria-label={t('edit_category_aria')}
                    >
                      <Edit3 size={14} className="text-gray-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteCategory(cat)}
                      aria-label={t('delete_category_aria')}
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
              {editingCategoryId ? t('edit_category') : t('add_category')}
            </p>
            <div className="space-y-3">
              <Input label={t('category_name_label')} placeholder={t('category_name_placeholder')} value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('parent_category')}</label>
                <select
                  value={categoryParent}
                  onChange={(e) => setCategoryParent(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500"
                >
                  <option value="">{t('no_parent')}</option>
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
                  <X size={14} className="mr-1" /> {t('cancel_edit')}
                </Button>
              </div>
            )}
          </div>
          <ModalFooter
            onCancel={() => { setShowCategoryModal(false); resetCategoryForm(); }}
            onConfirm={handleCategorySubmit}
            confirmText={editingCategoryId ? t('save_category') : t('create_category')}
            isLoading={categorySubmitting}
          />
        </div>
      </Modal>

      {/* AI 生成 Modal */}
      <Modal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        title={t('ai_title')}
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
            confirmText={t('confirm_delete')}
            isLoading={confirmModal.isLoading}
            confirmVariant="danger"
          />
        </div>
      </Modal>
      {/* 批量编辑模态 */}
      {batchField && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setBatchField(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 dark:text-gray-100 mb-1">{t('batch_edit_title')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('selected_count').replace('{n}', String(selectedIds.size))}</p>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">
              {batchField === 'price' ? t('label_price') : batchField === 'stock' ? t('label_stock') : t('label_category')}
            </label>
            <input
              type={batchField === 'category' ? 'text' : 'number'}
              value={batchValue}
              onChange={(e) => setBatchValue(e.target.value)}
              placeholder={batchField === 'category' ? t('label_category') : batchField === 'price' ? '0.00' : '0'}
              autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-200 mb-4"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setBatchField(null)}>{t('cancel')}</Button>
              <Button size="sm" onClick={handleBatchEdit} isLoading={isBatchEditing} leftIcon={<Check size={14} />}>
                {t('confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 库存流水弹窗 */}
      {showMovements && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowMovements(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-gray-100">{t('stock_movements')}</h3>
              <button onClick={() => setShowMovements(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={18} />
              </button>
            </div>
            {movementsLoading ? (
              <div className="py-8 text-center text-sm text-gray-400">{t('loading')}</div>
            ) : stockMovements.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">{t('no_movements')}</div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {stockMovements.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-700/40 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-bold flex-shrink-0 ${m.change >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {m.change >= 0 ? '+' : ''}{m.change}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 truncate">{m.reason || m.movement_type}</span>
                    </div>
                    <span className="text-gray-400 text-xs flex-shrink-0">
                      库存 {m.stock_after} · {m.created_at ? new Date(m.created_at.replace('+00:00', 'Z')).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};