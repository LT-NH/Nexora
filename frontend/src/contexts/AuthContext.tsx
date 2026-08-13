import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { User, AuthResponse, LoginRequest, RegisterRequest } from '@/types';
import { authService } from '@/services/auth';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (data: LoginRequest) => Promise<AuthResponse | { requires_2fa: boolean; user_id: string }>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Auto-load user from localStorage and verify token on mount
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('access_token');
      const storedUser = localStorage.getItem('user');

      if (storedToken && storedUser) {
        try {
          // Verify token is still valid by calling GET /me
          const validUser = await authService.getMe();
          setToken(storedToken);
          setUser(validUser);
          // Update stored user data with fresh data
          localStorage.setItem('user', JSON.stringify(validUser));
        } catch (err: any) {
          // Only clear auth on 401 (invalid/expired token), not on network errors
          if (err?.response?.status === 401) {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('user');
            setToken(null);
            setUser(null);
          }
          // For network errors, keep token - user can retry
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = useCallback(async (data: LoginRequest): Promise<AuthResponse | { requires_2fa: boolean; user_id: string }> => {
    const response = await authService.login(data);
    // Handle 2FA required
    if ('requires_2fa' in response && response.requires_2fa) {
      return response;
    }
    const authResponse = response as AuthResponse;
    setToken(authResponse.access_token);
    setUser(authResponse.user);
    return authResponse;
  }, []);

  const register = useCallback(async (data: RegisterRequest): Promise<void> => {
    const response: AuthResponse = await authService.register(data);
    setToken(response.access_token);
    setUser(response.user);
  }, []);

  const logout = useCallback((): void => {
    authService.logout();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: !!token && !!user,
      isLoading,
      login,
      register,
      logout,
      setUser,
    }),
    [user, token, isLoading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};