import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider } from '@/contexts/AuthContext';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { ToastProvider } from '@/components/ui/Toast';
import App from './App';
import './index.css';

// ── Stale-state guard ───────────────────────────────────────────
// Clears localStorage when a new app version is detected, OR when
// the URL contains ?reset=1 (useful for the in-app preview panel
// where Ctrl+Shift+R isn't a page reload).
const APP_VERSION = 'nexora-v3-20260714-1923';
const params = new URLSearchParams(window.location.search);
const forceReset = params.get('reset') === '1';
const storedVersion = localStorage.getItem('app_version');
if (forceReset || storedVersion !== APP_VERSION) {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('current_workspace_id');
  localStorage.setItem('app_version', APP_VERSION);
  // If coming from ?reset=1, clean up the URL and reload
  if (forceReset) {
    const clean = window.location.href.replace(/[?&]reset=1/, '').replace(/[?&]$/, '');
    window.history.replaceState(null, '', clean);
  }
}
// ─────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
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