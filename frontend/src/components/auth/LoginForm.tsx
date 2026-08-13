import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Shield } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/services/api';

export const LoginForm: React.FC = () => {
  const { login } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {}
  );
  const [requires2FA, setRequires2FA] = useState(false);
  const [totpCode, setTotpCode] = useState('');

  const validate = (): boolean => {
    const newErrors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      newErrors.email = '请输入邮箱地址';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = '请输入有效的邮箱地址';
    }
    if (!password) {
      newErrors.password = '请输入密码';
    } else if (password.length < 6) {
      newErrors.password = '密码至少需要 6 个字符';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      const result = await login({ email, password, remember_me: rememberMe, totp_code: totpCode || undefined });
      if (result && (result as any).requires_2fa) {
        setRequires2FA(true);
        setIsLoading(false);
        return;
      }
      addToast('success', '欢迎回来！', '您已成功登录。');
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      addToast('error', '登录失败', extractErrorMessage(err));
      setRequires2FA(false);
    } finally {
      setIsLoading(false);
    }
  };

  // 2FA step
  if (requires2FA) {
    return (
      <div className="space-y-5">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
            <Shield size={24} className="text-primary-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">双重认证</h3>
          <p className="text-sm text-gray-500 mt-1">
            请输入您的验证器应用中的 6 位验证码
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="验证码"
            type="text"
            placeholder="000000"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            maxLength={6}
            autoComplete="one-time-code"
          />
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isLoading}
            className="w-full"
          >
            验证
          </Button>
          <button
            type="button"
            onClick={() => setRequires2FA(false)}
            className="w-full text-center text-sm text-primary-600 hover:text-primary-500 transition-colors"
          >
            返回登录
          </button>
        </form>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Input
        label="邮箱地址"
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        leftIcon={<Mail size={18} />}
        autoComplete="email"
      />

      <div>
        <Input
          label="密码"
          type={showPassword ? 'text' : 'password'}
          placeholder="请输入您的密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          leftIcon={<Lock size={18} />}
          rightIcon={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="focus:outline-none"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          }
          autoComplete="current-password"
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm text-gray-600">记住我</span>
        </label>
        <Link
          to="/forgot-password"
          className="text-sm font-medium text-primary-600 hover:text-primary-500 transition-colors"
        >
          忘记密码？
        </Link>
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        isLoading={isLoading}
        className="w-full"
      >
        登录
      </Button>

      <p className="text-center text-sm text-gray-500">
        还没有账户？{' '}
        <Link
          to="/register"
          className="font-medium text-primary-600 hover:text-primary-500 transition-colors"
        >
          创建账户
        </Link>
      </p>
    </form>
  );
};