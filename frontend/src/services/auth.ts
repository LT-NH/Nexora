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
  async login(data: LoginRequest): Promise<AuthResponse> {
    // Step 1: Get tokens from login endpoint
    const loginRes = await api.post<TokenOnlyResponse>('/auth/login', {
      email: data.email,
      password: data.password,
      remember_me: data.remember_me,
    });

    const { access_token, refresh_token, token_type } = loginRes.data;
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);

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
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  },
};