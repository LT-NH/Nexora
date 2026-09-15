// vite.config.ts
import { defineConfig } from "file:///C:/Users/lihaoqi/WorkBuddy/2026-07-14-15-23-38/saas-forge/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/lihaoqi/WorkBuddy/2026-07-14-15-23-38/saas-forge/frontend/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
var __vite_injected_original_dirname = "C:\\Users\\lihaoqi\\WorkBuddy\\2026-07-14-15-23-38\\saas-forge\\frontend";
var vite_config_default = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  server: {
    port: 3e3,
    hmr: false,
    proxy: {
      // 注意：必须用 '/api/' 带斜杠作为前缀，
      // 否则 http-proxy-middleware 会把 /api-keys、/api-docs
      // 这种以 '/api' 开头的任意路径都误代理给后端，
      // 导致 SPA 路由（如 /api-keys）返回 404 JSON 而非 React 页面。
      "/api/": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        secure: false,
        ws: true
      },
      "/health": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        secure: false
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxsaWhhb3FpXFxcXFdvcmtCdWRkeVxcXFwyMDI2LTA3LTE0LTE1LTIzLTM4XFxcXHNhYXMtZm9yZ2VcXFxcZnJvbnRlbmRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXGxpaGFvcWlcXFxcV29ya0J1ZGR5XFxcXDIwMjYtMDctMTQtMTUtMjMtMzhcXFxcc2Fhcy1mb3JnZVxcXFxmcm9udGVuZFxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvbGloYW9xaS9Xb3JrQnVkZHkvMjAyNi0wNy0xNC0xNS0yMy0zOC9zYWFzLWZvcmdlL2Zyb250ZW5kL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtyZWFjdCgpXSxcbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7XG4gICAgICAnQCc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYycpLFxuICAgIH0sXG4gIH0sXG4gIHNlcnZlcjoge1xuICAgIHBvcnQ6IDMwMDAsXG4gICAgaG1yOiBmYWxzZSxcbiAgICBwcm94eToge1xuICAgICAgLy8gXHU2Q0U4XHU2MTBGXHVGRjFBXHU1RkM1XHU5ODdCXHU3NTI4ICcvYXBpLycgXHU1RTI2XHU2NTlDXHU2NzYwXHU0RjVDXHU0RTNBXHU1MjREXHU3RjAwXHVGRjBDXG4gICAgICAvLyBcdTU0MjZcdTUyMTkgaHR0cC1wcm94eS1taWRkbGV3YXJlIFx1NEYxQVx1NjI4QSAvYXBpLWtleXNcdTMwMDEvYXBpLWRvY3NcbiAgICAgIC8vIFx1OEZEOVx1NzlDRFx1NEVFNSAnL2FwaScgXHU1RjAwXHU1OTM0XHU3Njg0XHU0RUZCXHU2MTBGXHU4REVGXHU1Rjg0XHU5MEZEXHU4QkVGXHU0RUUzXHU3NDA2XHU3RUQ5XHU1NDBFXHU3QUVGXHVGRjBDXG4gICAgICAvLyBcdTVCRkNcdTgxRjQgU1BBIFx1OERFRlx1NzUzMVx1RkYwOFx1NTk4MiAvYXBpLWtleXNcdUZGMDlcdThGRDRcdTU2REUgNDA0IEpTT04gXHU4MDBDXHU5NzVFIFJlYWN0IFx1OTg3NVx1OTc2Mlx1MzAwMlxuICAgICAgJy9hcGkvJzoge1xuICAgICAgICB0YXJnZXQ6ICdodHRwOi8vMTI3LjAuMC4xOjgwMDAnLFxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICAgIHNlY3VyZTogZmFsc2UsXG4gICAgICAgIHdzOiB0cnVlLFxuICAgICAgfSxcbiAgICAgICcvaGVhbHRoJzoge1xuICAgICAgICB0YXJnZXQ6ICdodHRwOi8vMTI3LjAuMC4xOjgwMDAnLFxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICAgIHNlY3VyZTogZmFsc2UsXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG59KTsiXSwKICAibWFwcGluZ3MiOiAiO0FBQXNZLFNBQVMsb0JBQW9CO0FBQ25hLE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFGakIsSUFBTSxtQ0FBbUM7QUFJekMsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sQ0FBQztBQUFBLEVBQ2pCLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLEtBQUssS0FBSyxRQUFRLGtDQUFXLE9BQU87QUFBQSxJQUN0QztBQUFBLEVBQ0Y7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLEtBQUs7QUFBQSxJQUNMLE9BQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0wsU0FBUztBQUFBLFFBQ1AsUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLFFBQ2QsUUFBUTtBQUFBLFFBQ1IsSUFBSTtBQUFBLE1BQ047QUFBQSxNQUNBLFdBQVc7QUFBQSxRQUNULFFBQVE7QUFBQSxRQUNSLGNBQWM7QUFBQSxRQUNkLFFBQVE7QUFBQSxNQUNWO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
