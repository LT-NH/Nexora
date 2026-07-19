import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { authService } from '@/services/auth';

export const ForgotPassword: React.FC = () => {
  const { addToast } = useToast();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [resetToken, setResetToken] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      addToast('error', '请输入邮箱', '请输入您的注册邮箱地址。');
      return;
    }
    setIsLoading(true);
    try {
      const response = await authService.forgotPassword(email.trim());
      setIsSent(true);
      if (import.meta.env.DEV && response.reset_token) {
        setResetToken(response.reset_token);
      }
      addToast('success', '邮件已发送', '如果该邮箱已注册，您将收到密码重置链接。');
    } catch (err: any) {
      addToast('error', '请求失败', err?.response?.data?.detail || '请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-primary-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-600 to-indigo-600 flex items-center justify-center mx-auto">
              <span className="text-white font-bold text-xl">S</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">忘记密码</h1>
          <p className="text-sm text-gray-500 mt-2">
            {isSent ? '重置令牌已生成' : '输入您的邮箱地址以重置密码'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          {isSent ? (
            <div className="space-y-6 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <CheckCircle size={32} className="text-green-500" />
              </div>
              <p className="text-sm text-gray-600">
                密码重置令牌已生成，请使用以下令牌完成密码重置。
              </p>
              {resetToken && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-300">
                  <p className="text-xs text-gray-500 mb-1">重置令牌 (开发环境直接显示):</p>
                  <p className="text-sm font-mono text-gray-900 break-all">{resetToken}</p>
                </div>
              )}
              <Link to={`/reset-password${resetToken ? `?token=${resetToken}` : ''}`}>
                <Button variant="primary" className="w-full">
                  前往重置密码
                </Button>
              </Link>
              <Link to="/login" className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-500">
                <ArrowLeft size={14} /> 返回登录
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label="邮箱地址"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                leftIcon={<Mail size={18} />}
                autoComplete="email"
              />
              <Button type="submit" variant="primary" size="lg" isLoading={isLoading} className="w-full">
                发送重置链接
              </Button>
              <p className="text-center">
                <Link to="/login" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600 transition-colors">
                  <ArrowLeft size={14} /> 返回登录
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};