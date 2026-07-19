import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/services/api';

export const RegisterForm: React.FC = () => {
  const { register } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    terms?: string;
  }>({});

  const validate = (): boolean => {
    const newErrors: typeof errors = {};
    if (!fullName.trim()) {
      newErrors.fullName = '请输入姓名';
    }
    if (!email.trim()) {
      newErrors.email = '请输入邮箱地址';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = '请输入有效的邮箱地址';
    }
    if (!password) {
      newErrors.password = '请输入密码';
    } else if (password.length < 8) {
      newErrors.password = '密码至少需要 8 个字符';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      newErrors.password =
        '密码必须包含大写字母、小写字母和数字';
    }
    if (password !== confirmPassword) {
      newErrors.confirmPassword = '两次输入的密码不一致';
    }
    if (!agreeTerms) {
      newErrors.terms = '您必须同意服务条款';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      await register({ email, password, full_name: fullName });
      addToast(
        'success',
        '账户已创建！',
        '欢迎来到 Nexora。您的工作空间已准备就绪。'
      );
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      addToast('error', '注册失败', extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Input
        label="姓名"
        type="text"
        placeholder="张三"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        error={errors.fullName}
        leftIcon={<User size={18} />}
        autoComplete="name"
      />

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

      <Input
        label="密码"
        type={showPassword ? 'text' : 'password'}
        placeholder="创建一个强密码"
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
        hint="至少 8 个字符，包含大写字母、小写字母和数字"
        autoComplete="new-password"
      />

      <Input
        label="确认密码"
        type={showPassword ? 'text' : 'password'}
        placeholder="请再次输入密码"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        error={errors.confirmPassword}
        leftIcon={<Lock size={18} />}
        autoComplete="new-password"
      />

      <div>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={agreeTerms}
            onChange={(e) => setAgreeTerms(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 mt-0.5"
          />
          <span className="text-sm text-gray-600">
            我同意{' '}
            <Link to="/terms" className="text-primary-600 hover:underline">
              服务条款
            </Link>{' '}
            和{' '}
            <Link to="/privacy" className="text-primary-600 hover:underline">
              隐私政策
            </Link>
          </span>
        </label>
        {errors.terms && (
          <p className="mt-1.5 text-sm text-red-600">{errors.terms}</p>
        )}
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        isLoading={isLoading}
        className="w-full"
      >
        创建账户
      </Button>

      <p className="text-center text-sm text-gray-500">
        已有账户？{' '}
        <Link
          to="/login"
          className="font-medium text-primary-600 hover:text-primary-500 transition-colors"
        >
          登录
        </Link>
      </p>
    </form>
  );
};