import api from './api';
import type { AuthResponse, LoginRequest, RegisterRequest, User } from '@/types';

/** Backend login response — tokens only, no user */
interface TokenOnlyResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export const authService = {
  async login(data: LoginRequest): Promise<AuthResponse | { requires_2fa: boolean; user_id: string }> {
    // Step 1: Get tokens from login endpoint (may return requires_2fa)
    const loginRes = await api.post<TokenOnlyResponse | { requires_2fa: boolean; user_id: string }>('/auth/login', {
      email: data.email,
      password: data.password,
      remember_me: data.remember_me,
      totp_code: data.totp_code,
    });

    // Handle 2FA required
    if ((loginRes.data as any).requires_2fa) {
      return loginRes.data as { requires_2fa: boolean; user_id: string };
    }

    const tokenData = loginRes.data as TokenOnlyResponse;
    const { access_token, refresh_token, token_type } = tokenData;
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    if (data.remember_me) {
      localStorage.setItem('remember_me', 'true');
    }

    // Step 2: Fetch user data with the new token
    const userRes = await api.get<User>('/auth/me');
    const user = userRes.data;
    localStorage.setItem('user', JSON.stringify(user));

    return { access_token, refresh_token, token_type, user };
  },

  async register(data: RegisterRequest): Promise<AuthResponse> {
    // Step 1: Register the user (returns UserResponse, no tokens)
    await api.post<User>('/auth/register', data);

    // Step 2: Login to get tokens
    const loginRes = await api.post<TokenOnlyResponse>('/auth/login', {
      email: data.email,
      password: data.password,
    });

    const { access_token, refresh_token, token_type } = loginRes.data;
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);

    // Step 3: Fetch user data with the new token
    const userRes = await api.get<User>('/auth/me');
    const user = userRes.data;
    localStorage.setItem('user', JSON.stringify(user));

    return { access_token, refresh_token, token_type, user };
  },

  async getMe(): Promise<User> {
    const response = await api.get<User>('/auth/me');
    return response.data;
  },

  async forgotPassword(email: string): Promise<{ message: string; reset_token?: string }> {
    const response = await api.post<{ message: string; reset_token?: string }>('/auth/forgot-password', { email });
    return response.data;
  },

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const response = await api.post<{ message: string }>('/auth/reset-password', {
      token,
      new_password: newPassword,
    });
    return response.data;
  },

  async uploadAvatar(file: File): Promise<User> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<User>('/auth/upload-avatar', formData);
    // Update local user cache
    localStorage.setItem('user', JSON.stringify(response.data));
    return response.data;
  },

  logout(): void {
    // 「退出登录」语义 = 彻底登出：无论是否勾选过"记住我"，都清除会话凭证，
    // 否则退出后点登录会被 GuestRoute 自动重定向回原账号，无法切换账号。
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    // 同时清除工作空间选择，避免下次登录沿用旧账号的 workspace（账号切换残留）
    localStorage.removeItem('current_workspace_id');
    localStorage.removeItem('remember_me');
  },
};