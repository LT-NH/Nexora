import React from 'react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { LoginForm } from '@/components/auth/LoginForm';
import { usePageTitle } from '@/hooks/usePageTitle';

export const Login: React.FC = () => {
  usePageTitle('登录');
  return (
    <AuthLayout
      title="欢迎回来"
      subtitle="登录您的账户以继续"
    >
      <LoginForm />
    </AuthLayout>
  );
};