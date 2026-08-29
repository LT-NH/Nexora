import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Lock, ArrowLeft, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { authService } from '@/services/auth';

export const ResetPassword: React.FC = () => {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';
  
  const [token, setToken] = useState(tokenFromUrl);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      addToast('error', '缺少令牌', '请输入密码重置令牌');
      return;
    }
    if (newPassword.length < 8) {
      addToast('error', '密码太短', '密码至少需要 8 个字符');
      return;
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{}|;:,.<>?\/~`])/.test(newPassword)) {
      addToast('error', '密码强度不足', '密码需包含大小写字母、数字和特殊字符');
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast('error', '密码不匹配', '两次输入的密码不一致');
      return;
    }
    setIsLoading(true);
    try {
      await authService.resetPassword(token.trim(), newPassword);
      setIsDone(true);
      addToast('success', '密码已重置', '请使用新密码登录');
      timerRef.current = setTimeout(() => navigate('/login'), 2000);
    } catch (err: any) {
      addToast('error', '重置失败', err?.response?.data?.detail || '令牌无效或已过期');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-primary-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-600 to-purple-600 flex items-center justify-center mx-auto">
              <span className="text-white font-bold text-xl">S</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100">重置密码</h1>
          <p className="text-sm text-gray-500 mt-2">
            {isDone ? '密码已重置成功' : '输入重置令牌和新密码'}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 p-8">
          {isDone ? (
            <div className="space-y-6 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <CheckCircle size={32} className="text-green-500" />
              </div>
              <p className="text-sm text-gray-600">密码已成功重置，正在跳转到登录页...</p>
              <Link to="/login">
                <Button variant="primary" className="w-full">立即登录</Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label="重置令牌"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="粘贴密码重置令牌"
                leftIcon={<Lock size={18} />}
              />
              <Input
                label="新密码"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少 8 个字符"
                leftIcon={<Lock size={18} />}
              />
              <Input
                label="确认新密码"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入新密码"
                leftIcon={<Lock size={18} />}
              />
              <Button type="submit" variant="primary" size="lg" isLoading={isLoading} className="w-full">
                重置密码
              </Button>
              <p className="text-center">
                <Link to="/login" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600">
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
