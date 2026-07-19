import React from 'react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { usePageTitle } from '@/hooks/usePageTitle';

export const Register: React.FC = () => {
  usePageTitle('注册');
  return (
    <AuthLayout
      title="创建您的账户"
      subtitle="今天开始构建您的 SaaS 平台"
    >
      <RegisterForm />
    </AuthLayout>
  );
};