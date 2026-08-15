import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider } from '@/contexts/AuthContext';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import App from './App';
import './index.css';

// ── Stale-state guard ───────────────────────────────────────────
// When a new app version is detected, OR when the URL contains ?reset=1,
// we only clear the cached workspace ID (NOT tokens) and notify the user
// to refresh. This keeps the user logged in across version updates.
const APP_VERSION = 'nexora-v3-20260714-1923';
const params = new URLSearchParams(window.location.search);
const forceReset = params.get('reset') === '1';
const storedVersion = localStorage.getItem('app_version');
if (forceReset || storedVersion !== APP_VERSION) {
  // Only clear the cached workspace ID — keep access_token / refresh_token
  localStorage.removeItem('current_workspace_id');
  localStorage.setItem('app_version', APP_VERSION);
  // Flag for toast notification after React mounts
  (window as any).__APP_UPDATED = true;
  // If coming from ?reset=1, clean up the URL and reload
  if (forceReset) {
    const clean = window.location.href.replace(/[?&]reset=1/, '').replace(/[?&]$/, '');
    window.history.replaceState(null, '', clean);
  }
}
// ─────────────────────────────────────────────────────────────────

/**
 * Shows a toast notification when the app has been updated.
 * Must be rendered inside <ToastProvider> so it can access useToast.
 */
const AppUpdateNotifier: React.FC = () => {
  const { addToast } = useToast();
  useEffect(() => {
    if ((window as any).__APP_UPDATED) {
      addToast('info', '应用已更新，请刷新页面');
      (window as any).__APP_UPDATED = false;
    }
  }, [addToast]);
  return null;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AppUpdateNotifier />
          <AuthProvider>
            <WorkspaceProvider>
              <App />
            </WorkspaceProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
