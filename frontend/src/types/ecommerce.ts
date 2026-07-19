// ============================================================
// Nexora - 电商零售类型定义 (与后端 schema 对齐)
// ============================================================

// --- 商品 ---
export interface Product {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  price: number;
  compare_at_price: number | null;
  cost_price: number | null;
  sku: string | null;
  barcode: string | null;
  weight: number | null;
  status: 'draft' | 'active' | 'archived';
  has_variants: boolean;
  tags: string[];
  images: string[];
  created_at: string;
  updated_at: string;
  variants?: ProductVariant[];
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: number | null;
  stock: number;
  attributes: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface ProductCategory {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  children?: ProductCategory[];
}

export interface ProductCreateRequest {
  name: string;
  slug: string;
  description?: string;
  category?: string;
  brand?: string;
  price: number;
  compare_at_price?: number;
  cost_price?: number;
  sku?: string;
  barcode?: string;
  weight?: number;
  status?: 'draft' | 'active' | 'archived';
  has_variants?: boolean;
  tags?: string[];
  images?: string[];
}

export interface ProductUpdateRequest extends Partial<ProductCreateRequest> {
  id: string;
}

export interface ProductVariantRequest {
  name: string;
  sku?: string;
  price?: number;
  stock?: number;
  attributes?: Record<string, string>;
}

export interface CategoryCreateRequest {
  name: string;
  slug: string;
  parent_id?: string | null;
  sort_order?: number;
}

// --- 订单 ---
export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
export type PaymentStatus = 'unpaid' | 'paid' | 'partially_refunded' | 'refunded';

export interface Order {
  id: string;
  workspace_id: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  order_number: string;
  status: OrderStatus;
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
  shipping_address: Record<string, string> | null;
  shipped_at: string | null;
  delivered_at: string | null;
  notes: string | null;
  payment_status: PaymentStatus;
  platform: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
}

export interface OrderCreateRequest {
  customer_id?: string;
  customer_name?: string;
  customer_email?: string;
  order_number?: string;
  status?: OrderStatus;
  subtotal?: number;
  tax?: number;
  shipping?: number;
  discount?: number;
  total?: number;
  shipping_address?: Record<string, string>;
  notes?: string;
  payment_status?: PaymentStatus;
  platform?: string;
  items: {
    product_id?: string;
    variant_id?: string;
    product_name: string;
    sku?: string;
    quantity: number;
    unit_price: number;
    total_price?: number;
  }[];
}

export interface OrderStats {
  today_orders: number;
  today_revenue: number;
  week_orders: number;
  week_revenue: number;
  month_orders: number;
  month_revenue: number;
  total_orders: number;
  total_revenue: number;
  trend: { date: string; orders: number; revenue: number }[];
  status_breakdown: Record<string, number>;
}

// --- 客户 ---
export type CustomerTag = 'vip' | 'regular' | 'new' | 'at_risk' | 'high_value';

export interface Customer {
  id: string;
  workspace_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  tags: CustomerTag[];
  total_orders: number;
  total_spent: number;
  last_order_at: string | null;
  notes: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerCreateRequest {
  name: string;
  email?: string;
  phone?: string;
  tags?: CustomerTag[];
  notes?: string;
  source?: string;
}

export interface CustomerUpdateRequest extends Partial<CustomerCreateRequest> {
  id: string;
}

export interface RFMAnalysis {
  workspace_id: string;
  total_customers: number;
  segments: {
    segment: string;
    r_score: number;
    f_score: number;
    m_score: number;
    rfm_score: number;
    customer_count: number;
    average_total_spent: number;
  }[];
  analyzed_at: string;
}

// --- 店铺 ---
export type StorePlatform = 'taobao' | 'jd' | 'pdd' | 'douyin' | 'shopify' | 'amazon' | 'sandbox' | 'other';
export type StoreStatus = 'connected' | 'disconnected' | 'error';

export interface Store {
  id: string;
  workspace_id: string;
  name: string;
  platform: StorePlatform;
  store_url: string | null;
  api_key: string | null;
  access_token: string | null;
  status: StoreStatus;
  last_sync_at: string | null;
  created_at: string;
}

export interface StoreCreateRequest {
  name: string;
  platform: StorePlatform;
  store_url?: string;
  api_key?: string;
  api_secret?: string;
  access_token?: string;
}

export interface StoreUpdateRequest extends Partial<StoreCreateRequest> {
  id: string;
  status?: StoreStatus;
}

// --- AI 生成 ---
export interface AIGenerateRequest {
  product_name: string;
  category: string;
  selling_points: string;
  platform: 'general' | 'taobao' | 'douyin' | 'xiaohongshu';
  style: 'professional' | 'lively' | 'premium';
}

export interface AIGenerateResponse {
  title: string;
  description: string;
  highlights: string[];
  tags: string[];
}