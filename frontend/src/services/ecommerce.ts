import api from './api';
import type {
  Product,
  ProductCreateRequest,
  ProductUpdateRequest,
  ProductVariant,
  ProductVariantRequest,
  ProductCategory,
  CategoryCreateRequest,
  Order,
  OrderCreateRequest,
  OrderStats,
  Customer,
  CustomerCreateRequest,
  CustomerUpdateRequest,
  RFMAnalysis,
  Store,
  StoreCreateRequest,
  StoreUpdateRequest,
  AIGenerateRequest,
  AIGenerateResponse,
  Coupon,
  CouponCreateRequest,
  CouponValidateRequest,
  CouponValidateResponse,
  Review,
  ReviewCreateRequest,
  ReviewReplyRequest,
  ReviewStats,
  Refund,
  RefundCreateRequest,
  RefundUpdateRequest,
  RefundStats,
  MembershipSummary,
  CustomerMembership,
} from '@/types/ecommerce';

/** Extract items from paginated response, or return data as-is if already an array.
 *  Falls back to an empty array when the response is not an array or a valid paginated object. */
function extractItems<T>(data: unknown): T {
  if (Array.isArray(data)) return data as T;
  if (data && typeof data === 'object' && 'items' in data) {
    const items = (data as { items: unknown }).items;
    return (Array.isArray(items) ? items : []) as T;
  }
  return ([] as unknown) as T;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/** Extract full paginated result including metadata */
function extractPaginated<T>(data: unknown): PaginatedResult<T> {
  if (Array.isArray(data)) {
    return { items: data as T[], total: data.length, page: 1, page_size: data.length, total_pages: 1 };
  }
  if (data && typeof data === 'object' && 'items' in data) {
    const d = data as { items: unknown; total?: number; page?: number; page_size?: number; total_pages?: number };
    return {
      items: (Array.isArray(d.items) ? d.items : []) as T[],
      total: d.total ?? 0,
      page: d.page ?? 1,
      page_size: d.page_size ?? 20,
      total_pages: d.total_pages ?? 1,
    };
  }
  return { items: [], total: 0, page: 1, page_size: 20, total_pages: 1 };
}

// ============================================================
// 商品服务
// ============================================================
export const productService = {
  async getProducts(workspaceSlug: string, params?: Record<string, string>): Promise<Product[]> {
    const response = await api.get<Product[]>(`/workspaces/${workspaceSlug}/products`, { params });
    return extractItems<Product[]>(response.data);
  },

  async getProductsPaginated(workspaceSlug: string, params?: Record<string, string>): Promise<PaginatedResult<Product>> {
    const response = await api.get(`/workspaces/${workspaceSlug}/products`, { params });
    return extractPaginated<Product>(response.data);
  },

  async createProduct(workspaceSlug: string, data: ProductCreateRequest): Promise<Product> {
    const response = await api.post<Product>(`/workspaces/${workspaceSlug}/products`, data);
    return response.data;
  },

  async getProduct(workspaceSlug: string, productId: string): Promise<Product> {
    const response = await api.get<Product>(`/workspaces/${workspaceSlug}/products/${productId}`);
    return response.data;
  },

  async updateProduct(workspaceSlug: string, data: ProductUpdateRequest): Promise<Product> {
    const { id, ...body } = data;
    const response = await api.put<Product>(`/workspaces/${workspaceSlug}/products/${id}`, body);
    return response.data;
  },

  async deleteProduct(workspaceSlug: string, productId: string): Promise<void> {
    await api.delete(`/workspaces/${workspaceSlug}/products/${productId}`);
  },

  async addVariant(workspaceSlug: string, productId: string, data: ProductVariantRequest): Promise<ProductVariant> {
    const response = await api.post<ProductVariant>(`/workspaces/${workspaceSlug}/products/${productId}/variants`, data);
    return response.data;
  },

  async listVariants(workspaceSlug: string, productId: string): Promise<ProductVariant[]> {
    const response = await api.get<ProductVariant[]>(`/workspaces/${workspaceSlug}/products/${productId}/variants`);
    return extractItems<ProductVariant[]>(response.data);
  },

  async updateVariant(workspaceSlug: string, productId: string, variantId: string, data: Partial<ProductVariantRequest>): Promise<ProductVariant> {
    const response = await api.put<ProductVariant>(`/workspaces/${workspaceSlug}/products/${productId}/variants/${variantId}`, data);
    return response.data;
  },

  async deleteVariant(workspaceSlug: string, productId: string, variantId: string): Promise<void> {
    await api.delete(`/workspaces/${workspaceSlug}/products/${productId}/variants/${variantId}`);
  },

  async getCategories(workspaceSlug: string): Promise<ProductCategory[]> {
    const response = await api.get<ProductCategory[]>(`/workspaces/${workspaceSlug}/products/categories`);
    return extractItems<ProductCategory[]>(response.data);
  },

  async createCategory(workspaceSlug: string, data: CategoryCreateRequest): Promise<ProductCategory> {
    const response = await api.post<ProductCategory>(`/workspaces/${workspaceSlug}/products/categories`, data);
    return response.data;
  },

  async updateCategory(workspaceSlug: string, categoryId: string, data: Partial<CategoryCreateRequest>): Promise<ProductCategory> {
    const response = await api.put<ProductCategory>(`/workspaces/${workspaceSlug}/products/categories/${categoryId}`, data);
    return response.data;
  },

  async deleteCategory(workspaceSlug: string, categoryId: string): Promise<void> {
    await api.delete(`/workspaces/${workspaceSlug}/products/categories/${categoryId}`);
  },
};

// ============================================================
// 订单服务
// ============================================================
export const orderService = {
  async getOrders(workspaceSlug: string, params?: Record<string, string>): Promise<Order[]> {
    const response = await api.get<Order[]>(`/workspaces/${workspaceSlug}/orders`, { params });
    return extractItems<Order[]>(response.data);
  },

  async getOrdersPaginated(workspaceSlug: string, params?: Record<string, string>): Promise<PaginatedResult<Order>> {
    const response = await api.get(`/workspaces/${workspaceSlug}/orders`, { params });
    return extractPaginated<Order>(response.data);
  },

  async createOrder(workspaceSlug: string, data: OrderCreateRequest): Promise<Order> {
    const response = await api.post<Order>(`/workspaces/${workspaceSlug}/orders`, data);
    return response.data;
  },

  async getOrder(workspaceSlug: string, orderId: string): Promise<Order> {
    const response = await api.get<Order>(`/workspaces/${workspaceSlug}/orders/${orderId}`);
    return response.data;
  },

  async updateOrder(workspaceSlug: string, orderId: string, data: Partial<OrderCreateRequest>): Promise<Order> {
    const response = await api.put<Order>(`/workspaces/${workspaceSlug}/orders/${orderId}`, data);
    return response.data;
  },

  async updateOrderStatus(workspaceSlug: string, orderId: string, status: string): Promise<Order> {
    const response = await api.put<Order>(`/workspaces/${workspaceSlug}/orders/${orderId}/status`, { status });
    return response.data;
  },

  async deleteOrder(workspaceSlug: string, orderId: string): Promise<void> {
    await api.delete(`/workspaces/${workspaceSlug}/orders/${orderId}`);
  },

  async getOrderStats(workspaceSlug: string): Promise<OrderStats> {
    const response = await api.get<OrderStats>(`/workspaces/${workspaceSlug}/orders/stats`);
    return response.data;
  },
};

// ============================================================
// 客户服务
// ============================================================
export const customerService = {
  async getCustomers(workspaceSlug: string, params?: Record<string, string>): Promise<Customer[]> {
    const response = await api.get<Customer[]>(`/workspaces/${workspaceSlug}/customers`, { params });
    return extractItems<Customer[]>(response.data);
  },

  async getCustomersPaginated(workspaceSlug: string, params?: Record<string, string>): Promise<PaginatedResult<Customer>> {
    const response = await api.get(`/workspaces/${workspaceSlug}/customers`, { params });
    return extractPaginated<Customer>(response.data);
  },

  async createCustomer(workspaceSlug: string, data: CustomerCreateRequest): Promise<Customer> {
    const response = await api.post<Customer>(`/workspaces/${workspaceSlug}/customers`, data);
    return response.data;
  },

  async getCustomer(workspaceSlug: string, customerId: string): Promise<Customer> {
    const response = await api.get<Customer>(`/workspaces/${workspaceSlug}/customers/${customerId}`);
    return response.data;
  },

  async updateCustomer(workspaceSlug: string, data: CustomerUpdateRequest): Promise<Customer> {
    const { id, ...body } = data;
    const response = await api.put<Customer>(`/workspaces/${workspaceSlug}/customers/${id}`, body);
    return response.data;
  },

  async deleteCustomer(workspaceSlug: string, customerId: string): Promise<void> {
    await api.delete(`/workspaces/${workspaceSlug}/customers/${customerId}`);
  },

  async getRFMAnalysis(workspaceSlug: string): Promise<RFMAnalysis> {
    const response = await api.get<RFMAnalysis>(`/workspaces/${workspaceSlug}/customers/rfm-analysis`);
    return response.data;
  },
};

// ============================================================
// 店铺服务
// ============================================================
export const storeService = {
  async getStores(workspaceSlug: string): Promise<Store[]> {
    const response = await api.get<Store[]>(`/workspaces/${workspaceSlug}/stores`);
    return extractItems<Store[]>(response.data);
  },

  async getStore(workspaceSlug: string, storeId: string): Promise<Store> {
    const response = await api.get<Store>(`/workspaces/${workspaceSlug}/stores/${storeId}`);
    return response.data;
  },

  async createStore(workspaceSlug: string, data: StoreCreateRequest): Promise<Store> {
    const response = await api.post<Store>(`/workspaces/${workspaceSlug}/stores`, data);
    return response.data;
  },

  async updateStore(workspaceSlug: string, data: StoreUpdateRequest): Promise<Store> {
    const { id, ...body } = data;
    const response = await api.put<Store>(`/workspaces/${workspaceSlug}/stores/${id}`, body);
    return response.data;
  },

  async deleteStore(workspaceSlug: string, storeId: string): Promise<void> {
    await api.delete(`/workspaces/${workspaceSlug}/stores/${storeId}`);
  },

  async syncStore(workspaceSlug: string, storeId: string): Promise<Store> {
    const response = await api.post<Store>(`/workspaces/${workspaceSlug}/stores/${storeId}/sync`);
    return response.data;
  },

  async testConnection(workspaceSlug: string, storeId: string): Promise<{ ok: boolean; message: string }> {
    const response = await api.post<{ ok: boolean; message: string }>(
      `/workspaces/${workspaceSlug}/stores/${storeId}/test`,
    );
    return response.data;
  },
};

// ============================================================
// AI 服务
// ============================================================
export const aiService = {
  async generateProductDescription(workspaceSlug: string, data: AIGenerateRequest): Promise<AIGenerateResponse> {
    const response = await api.post<AIGenerateResponse>(`/workspaces/${workspaceSlug}/products/ai/generate-description`, data);
    return response.data;
  },

  async generateSEOKewords(workspaceSlug: string, data: { product_name: string; category: string; platform?: string }): Promise<Record<string, string[]>> {
    const response = await api.post(`/workspaces/${workspaceSlug}/ai/seo-keywords`, data);
    return response.data;
  },

  async analyzeSalesTrend(workspaceSlug: string): Promise<Record<string, unknown>> {
    const response = await api.post(`/workspaces/${workspaceSlug}/ai/analyze-sales`, {});
    return response.data;
  },

  async customerInsights(workspaceSlug: string): Promise<Record<string, unknown>> {
    const response = await api.post(`/workspaces/${workspaceSlug}/ai/customer-insights`, {});
    return response.data;
  },

  async generateMarketingCopy(workspaceSlug: string, data: { product_name: string; category: string; price?: number; features?: string[]; channel?: string }): Promise<{ channel: string; copy: string }> {
    const response = await api.post(`/workspaces/${workspaceSlug}/ai/marketing-copy`, data);
    return response.data;
  },
};

// ============================================================
// 优惠券服务
// ============================================================
export const couponService = {
  async getCoupons(workspaceSlug: string): Promise<Coupon[]> {
    const response = await api.get<Coupon[]>(`/workspaces/${workspaceSlug}/coupons`);
    return extractItems<Coupon[]>(response.data);
  },

  async createCoupon(workspaceSlug: string, data: CouponCreateRequest): Promise<Coupon> {
    const response = await api.post<Coupon>(`/workspaces/${workspaceSlug}/coupons`, data);
    return response.data;
  },

  async toggleCoupon(workspaceSlug: string, couponId: string): Promise<Coupon> {
    const response = await api.patch<Coupon>(`/workspaces/${workspaceSlug}/coupons/${couponId}`);
    return response.data;
  },

  async deleteCoupon(workspaceSlug: string, couponId: string): Promise<void> {
    await api.delete(`/workspaces/${workspaceSlug}/coupons/${couponId}`);
  },

  async validateCoupon(workspaceSlug: string, data: CouponValidateRequest): Promise<CouponValidateResponse> {
    const response = await api.post<CouponValidateResponse>(`/workspaces/${workspaceSlug}/coupons/validate`, data);
    return response.data;
  },
};

// ============================================================
// 评价服务
// ============================================================
export const reviewService = {
  async getReviews(workspaceSlug: string, productId: string): Promise<Review[]> {
    const response = await api.get<Review[]>(`/workspaces/${workspaceSlug}/products/${productId}/reviews`);
    return extractItems<Review[]>(response.data);
  },

  async createReview(workspaceSlug: string, productId: string, data: ReviewCreateRequest): Promise<Review> {
    const response = await api.post<Review>(`/workspaces/${workspaceSlug}/products/${productId}/reviews`, data);
    return response.data;
  },

  async replyReview(workspaceSlug: string, reviewId: string, data: ReviewReplyRequest): Promise<Review> {
    const response = await api.patch<Review>(`/workspaces/${workspaceSlug}/reviews/${reviewId}/reply`, data);
    return response.data;
  },

  async toggleApproval(workspaceSlug: string, reviewId: string): Promise<Review> {
    const response = await api.patch<Review>(`/workspaces/${workspaceSlug}/reviews/${reviewId}/toggle-approval`);
    return response.data;
  },

  async uploadReviewImage(workspaceSlug: string, reviewId: string, file: File): Promise<Review> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<Review>(`/workspaces/${workspaceSlug}/reviews/${reviewId}/image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async getWorkspaceReviewStats(workspaceSlug: string): Promise<ReviewStats> {
    const response = await api.get<ReviewStats>(`/workspaces/${workspaceSlug}/reviews/stats`);
    return response.data;
  },

  async getProductReviewStats(workspaceSlug: string, productId: string): Promise<ReviewStats> {
    const response = await api.get<ReviewStats>(`/workspaces/${workspaceSlug}/products/${productId}/reviews/stats`);
    return response.data;
  },
};

// ============================================================
// 退款/售后服务
// ============================================================
export const refundService = {
  async getRefunds(workspaceSlug: string, params?: Record<string, string>): Promise<Refund[]> {
    const response = await api.get<Refund[]>(`/workspaces/${workspaceSlug}/refunds`, { params });
    return extractItems<Refund[]>(response.data);
  },

  async getRefundsPaginated(workspaceSlug: string, params?: Record<string, string>): Promise<PaginatedResult<Refund>> {
    const response = await api.get(`/workspaces/${workspaceSlug}/refunds`, { params });
    return extractPaginated<Refund>(response.data);
  },

  async createRefund(workspaceSlug: string, data: RefundCreateRequest): Promise<Refund> {
    const response = await api.post<Refund>(`/workspaces/${workspaceSlug}/refunds`, data);
    return response.data;
  },

  async processRefund(workspaceSlug: string, refundId: string, data: RefundUpdateRequest): Promise<Refund> {
    const response = await api.patch<Refund>(`/workspaces/${workspaceSlug}/refunds/${refundId}`, data);
    return response.data;
  },

  async getRefundStats(workspaceSlug: string): Promise<RefundStats> {
    const response = await api.get<RefundStats>(`/workspaces/${workspaceSlug}/refunds/stats`);
    return response.data;
  },
};

// ============================================================
// 会员等级服务
// ============================================================
export const membershipService = {
  async getSummary(workspaceSlug: string): Promise<MembershipSummary> {
    const response = await api.get<MembershipSummary>(`/workspaces/${workspaceSlug}/membership`);
    return response.data;
  },

  async getCustomerMembership(workspaceSlug: string, customerId: string): Promise<CustomerMembership> {
    const response = await api.get<CustomerMembership>(
      `/workspaces/${workspaceSlug}/customers/${customerId}/membership`,
    );
    return response.data;
  },
};