import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { ApiError } from '@/types';

/**
 * API base URL 解析顺序：
 * 1. 构建时注入的 VITE_API_BASE（生产环境指向 Render 后端，如 https://nexora-api.onrender.com/api/v1）
 * 2. 默认相对路径 /api/v1（本地开发走 Vite 代理）
 */
const API_BASE_URL =
  (import.meta.env?.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ??
  '/api/v1';

/**
 * Extract a human-readable error message from various API error response formats.
 * Handles:
 *   - string detail: "Invalid credentials"
 *   - Pydantic validation: [{type, loc, msg, input}, ...]
 *   - No response: "网络错误"
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const detail = error.response?.data?.detail;
    if (!detail) return error.message || '网络错误';

    // Pydantic validation errors: array of {type, loc, msg, input}
    if (Array.isArray(detail)) {
      return detail
        .map((e: { loc?: string[]; msg?: string }) => {
          const field = e.loc?.join('.') || 'unknown';
          return `${field}: ${e.msg || '验证失败'}`;
        })
        .join('; ');
    }

    // Simple string detail
    return String(detail);
  }
  if (error instanceof Error) return error.message;
  return '未知错误';
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// =========================================================================
// GET 短期缓存（2s TTL）
// -------------------------------------------------------------------------
// 痛点：进入工作台时多个组件会并发/重复拉取同一接口（如 /workspaces/:slug
// 曾被重复请求 9 次，拖慢加载）。对 GET 结果做 2s TTL 缓存：
// 首次真实请求后，同 2s 内的重复请求由 request interceptor 短路返回缓存。
// 需要强制刷新时可在请求头加 X-Skip-Cache: '1'。
// =========================================================================
const getCache = new Map<string, { exp: number; data: unknown }>();
// 缓存 key 必须包含 query 参数，否则 ?page=1 与 ?page=2 会命中同一条缓存
function cacheKey(cfg: { baseURL?: string; url?: string; params?: unknown }): string {
  try {
    return api.getUri({ baseURL: cfg.baseURL, url: cfg.url, params: cfg.params });
  } catch {
    return `${cfg.baseURL ?? ''}${cfg.url ?? ''}`;
  }
}
const GET_TTL = 10000;

// Track if we are currently refreshing the token
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else if (token) {
      resolve(token);
    }
  });
  failedQueue = [];
};

// Request interceptor: attach JWT token + GET 短期缓存短路
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // GET 缓存命中：给该请求注入一个直接返回缓存结果的 adapter（标准 axios 机制）
    const method = (config.method || 'get').toUpperCase();
    const skipCache = (config.headers as Record<string, unknown> | undefined)?.['X-Skip-Cache'] === '1';
    if (method === 'GET' && !skipCache) {
      const url = cacheKey(config);
      const hit = getCache.get(url);
      if (hit && Date.now() < hit.exp) {
        config.adapter = async (cfg) => ({
          data: hit.data,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: cfg,
          request: {},
        });
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 成功响应：写入 GET 缓存（TTL 内重复请求直接命中）
api.interceptors.response.use(
  (response) => {
    const cfg = response.config;
    const method = (cfg.method || 'get').toUpperCase();
    // 写操作（POST/PUT/PATCH/DELETE）成功后，立即清空 GET 缓存。
    // 否则「操作成功后立即刷新列表」会命中旧数据的缓存，导致页面不更新、
    // 必须手动刷新浏览器才能看到变化（用户反馈的核心 bug）。
    if (method !== 'GET') {
      getCache.clear();
      return response;
    }
    const skipCache = (cfg.headers as Record<string, unknown> | undefined)?.['X-Skip-Cache'] === '1';
    if (method === 'GET' && !skipCache) {
      const url = cacheKey(cfg);
      getCache.set(url, { exp: Date.now() + GET_TTL, data: response.data });
    }
    return response;
  },
  (error) => Promise.reject(error)
);

// Retry interceptor for idempotent GET requests
api.interceptors.response.use(undefined, async (error: AxiosError<ApiError>) => {
  const config = error.config as InternalAxiosRequestConfig & {
    _retryCount?: number;
    _retry?: boolean;
  };

  // Only retry GET requests (idempotent)
  if (config?.method?.toUpperCase() !== 'GET') {
    return Promise.reject(error);
  }

  // Only retry on 5xx server errors (500-599) and network errors (no response).
  // Do not retry client errors such as 400/401/403/404/422.
  const status = error.response?.status;
  const isServerError = status !== undefined && status >= 500 && status <= 599;
  const isNetworkError = !error.response;

  if (!isServerError && !isNetworkError) {
    return Promise.reject(error);
  }

  // Initialize retry count
  const retryCount = config._retryCount || 0;
  const maxRetries = 2;

  if (retryCount >= maxRetries) {
    return Promise.reject(error);
  }

  // Exponential backoff: 1s, 2s
  const delay = Math.pow(2, retryCount) * 1000;

  config._retryCount = retryCount + 1;

  await new Promise((resolve) => setTimeout(resolve, delay));

  return api(config);
});

// Response interceptor: handle 401 and token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // If 401 and not already retrying
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');

      if (!refreshToken) {
        isRefreshing = false;
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });

        const { access_token, refresh_token: newRefreshToken } = response.data;
        localStorage.setItem('access_token', access_token);
        if (newRefreshToken) {
          localStorage.setItem('refresh_token', newRefreshToken);
        }

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
        }

        processQueue(null, access_token);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export { api };
export default api;