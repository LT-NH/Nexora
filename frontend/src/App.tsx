import React, { Suspense, useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui/Spinner';
import { SplashScreen } from '@/components/SplashScreen';
import { CookieBanner } from '@/components/CookieBanner';
import { BackToTop } from '@/components/BackToTop';
import { CommandPalette } from '@/components/CommandPalette';

/** 已登录用户访问登录/注册页时自动跳转到仪表板 */
const GuestRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

// Lazy loaded pages
const Landing = React.lazy(() =>
  import('@/pages/Landing').then((m) => ({ default: m.Landing }))
);
const Login = React.lazy(() =>
  import('@/pages/Login').then((m) => ({ default: m.Login }))
);
const Register = React.lazy(() =>
  import('@/pages/Register').then((m) => ({ default: m.Register }))
);
const Dashboard = React.lazy(() =>
  import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard }))
);
const Team = React.lazy(() =>
  import('@/pages/Team').then((m) => ({ default: m.Team }))
);
const Billing = React.lazy(() =>
  import('@/pages/Billing').then((m) => ({ default: m.Billing }))
);
const ApiKeys = React.lazy(() =>
  import('@/pages/ApiKeys').then((m) => ({ default: m.ApiKeys }))
);
const WorkspaceSettings = React.lazy(() =>
  import('@/pages/WorkspaceSettings').then((m) => ({
    default: m.WorkspaceSettings,
  }))
);
const AdminDashboard = React.lazy(() =>
  import('@/pages/AdminDashboard').then((m) => ({
    default: m.AdminDashboard,
  }))
);
const Products = React.lazy(() =>
  import('@/pages/Products').then((m) => ({ default: m.Products }))
);
const Orders = React.lazy(() =>
  import('@/pages/Orders').then((m) => ({ default: m.Orders }))
);
const Customers = React.lazy(() =>
  import('@/pages/Customers').then((m) => ({ default: m.Customers }))
);
const Stores = React.lazy(() =>
  import('@/pages/Stores').then((m) => ({ default: m.Stores }))
);
const Analytics = React.lazy(() =>
  import('@/pages/Analytics').then((m) => ({ default: m.Analytics }))
);
const ForgotPassword = React.lazy(() =>
  import('@/pages/ForgotPassword').then((m) => ({ default: m.ForgotPassword }))
);
const ResetPassword = React.lazy(() =>
  import('@/pages/ResetPassword').then((m) => ({ default: m.ResetPassword }))
);
const Profile = React.lazy(() =>
  import('@/pages/Profile').then((m) => ({ default: m.Profile }))
);
const Terms = React.lazy(() =>
  import('@/pages/Terms').then((m) => ({ default: m.Terms }))
);
const Privacy = React.lazy(() =>
  import('@/pages/Privacy').then((m) => ({ default: m.Privacy }))
);
const Changelog = React.lazy(() =>
  import('@/pages/Changelog').then((m) => ({ default: m.default }))
);
const Status = React.lazy(() =>
  import('@/pages/Status').then((m) => ({ default: m.default }))
);
const NotFound = React.lazy(() =>
  import('@/pages/NotFound').then((m) => ({ default: m.NotFound }))
);

const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <Spinner size="lg" />
  </div>
);

const App: React.FC = () => {
  const location = useLocation();
  const [showSplash, setShowSplash] = useState(false);

  // Show splash only on landing page, only once per session,
  // or when ?splash=1 is in the URL
  useEffect(() => {
    const force = new URLSearchParams(location.search).get('splash') === '1';
    const shown = sessionStorage.getItem('splash_v2');
    if (location.pathname === '/' && (force || !shown)) {
      setShowSplash(true);
      sessionStorage.setItem('splash_v2', '1');
    }
  }, [location.pathname, location.search]);

  return (
    <>
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
      <CookieBanner />
      <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* 公开路由 */}
        <Route path="/" element={<Landing />} />
        <Route 
          path="/login" 
          element={
            <GuestRoute>
              <Login />
            </GuestRoute>
          } 
        />
        <Route 
          path="/register" 
          element={
            <GuestRoute>
              <Register />
            </GuestRoute>
          } 
        />
        <Route 
          path="/forgot-password" 
          element={
            <GuestRoute>
              <ForgotPassword />
            </GuestRoute>
          } 
        />
        <Route 
          path="/reset-password" 
          element={
            <GuestRoute>
              <ResetPassword />
            </GuestRoute>
          } 
        />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/changelog" element={<Changelog />} />
        <Route path="/status" element={<Status />} />

        {/* 需要认证的路由 — 共享同一个 AppLayout，避免每次切换都重建 Sidebar */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/team" element={<Team />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/api-keys" element={<ApiKeys />} />
          <Route path="/settings" element={<WorkspaceSettings />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/products" element={<Products />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/stores" element={<Stores />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
        <BackToTop />
        <CommandPalette />
    </Suspense>
    </>
  );
};

export default App;