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
  stock: number;
  low_stock_threshold: number;
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
  tracking_number: string | null;
  carrier: string | null;
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
  membership_level: string | null;
  membership_points: number;
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
  auto_sync_enabled: boolean;
  sync_interval_minutes: number;
  last_sync_status: 'success' | 'partial' | 'error' | null;
  last_sync_errors: string | null;
  created_at: string;
}

export interface StoreCreateRequest {
  name: string;
  platform: StorePlatform;
  store_url?: string;
  api_key?: string;
  api_secret?: string;
  access_token?: string;
  auto_sync_enabled?: boolean;
  sync_interval_minutes?: number;
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

// --- 优惠券 ---
export type CouponType = 'percent' | 'fixed' | 'free_shipping';

export interface Coupon {
  id: string;
  workspace_id: string;
  code: string;
  type: CouponType;
  value: number;
  min_order_amount: number;
  max_uses: number;
  used_count: number;
  is_active: boolean;
  starts_at: string;
  expires_at: string;
  created_at: string;
}

export interface CouponCreateRequest {
  code: string;
  type: CouponType;
  value: number;
  min_order_amount?: number;
  max_uses?: number;
  expires_at: string;
}

export interface CouponValidateRequest {
  code: string;
  order_amount: number;
}

export interface CouponValidateResponse {
  valid: boolean;
  coupon_id: string | null;
  code: string | null;
  type: CouponType | null;
  discount_amount: number;
  message: string | null;
}

// --- 商品评价 ---
export interface Review {
  id: string;
  workspace_id: string;
  product_id: string;
  customer_name: string;
  rating: number;
  content: string | null;
  image_urls: string[] | null;
  reply: string | null;
  replied_at: string | null;
  is_approved: boolean;
  is_verified: boolean;
  created_at: string;
}

export interface ReviewCreateRequest {
  customer_name: string;
  rating: number;
  content?: string;
  image_urls?: string[];
  is_verified?: boolean;
}

export interface ReviewReplyRequest {
  reply: string;
}

export interface ReviewStats {
  average_rating: number;
  total_reviews: number;
  rating_distribution: Record<string, number>;
}

// --- 退款/售后 ---
export type RefundStatus = 'pending' | 'approved' | 'rejected' | 'processing' | 'completed';
export type RefundReason = 'quality' | 'wrong_item' | 'damaged' | 'not_as_described' | 'other';

export interface Refund {
  id: string;
  workspace_id: string;
  order_id: string;
  amount: number;
  reason: string;
  reason_detail: string | null;
  status: RefundStatus;
  reviewer_note: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RefundCreateRequest {
  order_id: string;
  amount: number;
  reason: string;
  reason_detail?: string;
}

export interface RefundUpdateRequest {
  status?: string;
  reviewer_note?: string;
}

export interface RefundStats {
  pending: number;
  approved: number;
  rejected: number;
  processing: number;
  completed: number;
  total: number;
  total_refunded: number;
}

// --- 会员等级 ---
export interface MembershipLevelData {
  level: string;
  label: string;
  min_spent: number;
  discount: number;
  count: number;
}

export interface MembershipSummary {
  levels: MembershipLevelData[];
  total_customers: number;
}

export interface CustomerMembership {
  customer_id: string;
  customer_name: string;
  current_level: string;
  current_label: string;
  current_discount: number;
  total_spent: number;
  membership_points: number;
  next_level: string | null;
  next_label: string | null;
  spent_needed_for_next: number | null;
}