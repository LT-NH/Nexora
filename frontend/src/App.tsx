import React, { Suspense, useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { RouteErrorBoundary } from '@/components/ErrorBoundary';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui/Spinner';
import { SplashScreen } from '@/components/SplashScreen';
import { CookieBanner } from '@/components/CookieBanner';
import { BackToTop } from '@/components/BackToTop';
import { CommandPalette } from '@/components/CommandPalette';
import { RouteProgress } from '@/components/RouteProgress';

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
const Coupons = React.lazy(() =>
  import('@/pages/Coupons').then((m) => ({ default: m.Coupons }))
);
const Webhooks = React.lazy(() =>
  import('@/pages/Webhooks').then((m) => ({ default: m.Webhooks }))
);
const Analytics = React.lazy(() =>
  import('@/pages/Analytics').then((m) => ({ default: m.Analytics }))
);
const Permissions = React.lazy(() =>
  import('@/pages/Permissions').then((m) => ({ default: m.Permissions }))
);
const Refunds = React.lazy(() =>
  import('@/pages/Refunds').then((m) => ({ default: m.Refunds }))
);
const AIChat = React.lazy(() =>
  import('@/pages/AIChat').then((m) => ({ default: m.AIChat }))
);
const Payments = React.lazy(() =>
  import('@/pages/Payments').then((m) => ({ default: m.Payments }))
);
const ForgotPassword = React.lazy(() =>
  import('@/pages/ForgotPassword').then((m) => ({ default: m.ForgotPassword }))
);
const Profit = React.lazy(() =>
  import('@/pages/Profit').then((m) => ({ default: m.Profit }))
);
const AICommandCenter = React.lazy(() =>
  import('@/pages/AICommandCenter').then((m) => ({ default: m.AICommandCenter }))
);
const About = React.lazy(() =>
  import('@/pages/About').then((m) => ({ default: m.About }))
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
  <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/25 animate-pulse-glow">
      <span className="text-white font-extrabold text-xl select-none">N</span>
    </div>
    <Spinner size="sm" />
  </div>
);

const App: React.FC = () => {
  const location = useLocation();
  const [showSplash, setShowSplash] = useState(false);

  // Show splash only on landing page, only once per session,
  // or when ?splash=1 is in the URL. ?demo=1 / ?demo=2 skips it entirely
  // for instant access during live demos.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const force = params.get('splash') === '1';
    const skip = params.has('demo');
    const shown = sessionStorage.getItem('splash_v2');
    if (location.pathname === '/' && !skip && (force || !shown)) {
      setShowSplash(true);
      sessionStorage.setItem('splash_v2', '1');
    }
  }, [location.pathname, location.search]);

  return (
    <>
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
      <RouteProgress />
      <CookieBanner />
      <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* 公开路由 */}
        <Route path="/" element={<RouteErrorBoundary><Landing /></RouteErrorBoundary>} />
        <Route
          path="/login"
          element={
            <GuestRoute>
              <RouteErrorBoundary><Login /></RouteErrorBoundary>
            </GuestRoute>
          }
        />
        <Route
          path="/register"
          element={
            <GuestRoute>
              <RouteErrorBoundary><Register /></RouteErrorBoundary>
            </GuestRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <GuestRoute>
              <RouteErrorBoundary><ForgotPassword /></RouteErrorBoundary>
            </GuestRoute>
          }
        />
        <Route
          path="/reset-password"
          element={
            <GuestRoute>
              <RouteErrorBoundary><ResetPassword /></RouteErrorBoundary>
            </GuestRoute>
          }
        />
        <Route path="/terms" element={<RouteErrorBoundary><Terms /></RouteErrorBoundary>} />
        <Route path="/privacy" element={<RouteErrorBoundary><Privacy /></RouteErrorBoundary>} />
        <Route path="/changelog" element={<RouteErrorBoundary><Changelog /></RouteErrorBoundary>} />
        <Route path="/status" element={<RouteErrorBoundary><Status /></RouteErrorBoundary>} />
          <Route path="/about" element={<RouteErrorBoundary><About /></RouteErrorBoundary>} />

        {/* 需要认证的路由 — 共享同一个 AppLayout，避免每次切换都重建 Sidebar */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<RouteErrorBoundary><Dashboard /></RouteErrorBoundary>} />
          <Route path="/ai-center" element={<RouteErrorBoundary><AICommandCenter /></RouteErrorBoundary>} />
          <Route path="/team" element={<RouteErrorBoundary><Team /></RouteErrorBoundary>} />
          <Route path="/profit" element={<RouteErrorBoundary><Profit /></RouteErrorBoundary>} />
          <Route path="/billing" element={<RouteErrorBoundary><Billing /></RouteErrorBoundary>} />
          <Route path="/api-keys" element={<RouteErrorBoundary><ApiKeys /></RouteErrorBoundary>} />
          <Route path="/settings" element={<RouteErrorBoundary><WorkspaceSettings /></RouteErrorBoundary>} />
          <Route path="/profile" element={<RouteErrorBoundary><Profile /></RouteErrorBoundary>} />
          <Route path="/products" element={<RouteErrorBoundary><Products /></RouteErrorBoundary>} />
          <Route path="/orders" element={<RouteErrorBoundary><Orders /></RouteErrorBoundary>} />
          <Route path="/customers" element={<RouteErrorBoundary><Customers /></RouteErrorBoundary>} />
          <Route path="/stores" element={<RouteErrorBoundary><Stores /></RouteErrorBoundary>} />
          <Route path="/coupons" element={<RouteErrorBoundary><Coupons /></RouteErrorBoundary>} />
          <Route path="/webhooks" element={<RouteErrorBoundary><Webhooks /></RouteErrorBoundary>} />
          <Route path="/analytics" element={<RouteErrorBoundary><Analytics /></RouteErrorBoundary>} />
          <Route path="/permissions" element={<RouteErrorBoundary><Permissions /></RouteErrorBoundary>} />
          <Route path="/refunds" element={<RouteErrorBoundary><Refunds /></RouteErrorBoundary>} />
          <Route path="/ai-chat" element={<RouteErrorBoundary><AIChat /></RouteErrorBoundary>} />
          <Route path="/payments" element={<RouteErrorBoundary><Payments /></RouteErrorBoundary>} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <RouteErrorBoundary><AdminDashboard /></RouteErrorBoundary>
              </ProtectedRoute>
            }
          />
        </Route>

        {/* 404 */}
        <Route path="*" element={<RouteErrorBoundary><NotFound /></RouteErrorBoundary>} />
      </Routes>
        <BackToTop />
        <CommandPalette />
    </Suspense>
    </>
  );
};

export default App;