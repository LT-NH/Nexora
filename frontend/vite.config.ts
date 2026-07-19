import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    hmr: false,
    proxy: {
      // 注意：必须用 '/api/' 带斜杠作为前缀，
      // 否则 http-proxy-middleware 会把 /api-keys、/api-docs
      // 这种以 '/api' 开头的任意路径都误代理给后端，
      // 导致 SPA 路由（如 /api-keys）返回 404 JSON 而非 React 页面。
      '/api/': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/health': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});