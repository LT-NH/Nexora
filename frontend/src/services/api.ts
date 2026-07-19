import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { ApiError } from '@/types';

const API_BASE_URL = '/api/v1';

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

// Request interceptor: attach JWT token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
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

export default api;