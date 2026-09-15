// vite.config.ts
import { defineConfig } from "file:///C:/Users/lihaoqi/Desktop/nexora-preview/nexora-optimized/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/lihaoqi/Desktop/nexora-preview/nexora-optimized/frontend/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
var __vite_injected_original_dirname = "C:\\Users\\lihaoqi\\Desktop\\nexora-preview\\nexora-optimized\\frontend";
var vite_config_default = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  server: {
    port: 3e3,
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
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-markdown": ["react-markdown", "remark-gfm"],
          echarts: ["echarts", "echarts-for-react"],
          tiptap: [
            "@tiptap/react",
            "@tiptap/starter-kit",
            "@tiptap/extension-image",
            "@tiptap/extension-link",
            "@tiptap/extension-placeholder"
          ]
        }
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxsaWhhb3FpXFxcXERlc2t0b3BcXFxcbmV4b3JhLXByZXZpZXdcXFxcbmV4b3JhLW9wdGltaXplZFxcXFxmcm9udGVuZFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcbGloYW9xaVxcXFxEZXNrdG9wXFxcXG5leG9yYS1wcmV2aWV3XFxcXG5leG9yYS1vcHRpbWl6ZWRcXFxcZnJvbnRlbmRcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL2xpaGFvcWkvRGVza3RvcC9uZXhvcmEtcHJldmlldy9uZXhvcmEtb3B0aW1pemVkL2Zyb250ZW5kL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtyZWFjdCgpXSxcbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7XG4gICAgICAnQCc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYycpLFxuICAgIH0sXG4gIH0sXG4gIHNlcnZlcjoge1xuICAgIHBvcnQ6IDMwMDAsXG4gICAgcHJveHk6IHtcbiAgICAgIC8vIFx1NkNFOFx1NjEwRlx1RkYxQVx1NUZDNVx1OTg3Qlx1NzUyOCAnL2FwaS8nIFx1NUUyNlx1NjU5Q1x1Njc2MFx1NEY1Q1x1NEUzQVx1NTI0RFx1N0YwMFx1RkYwQ1xuICAgICAgLy8gXHU1NDI2XHU1MjE5IGh0dHAtcHJveHktbWlkZGxld2FyZSBcdTRGMUFcdTYyOEEgL2FwaS1rZXlzXHUzMDAxL2FwaS1kb2NzXG4gICAgICAvLyBcdThGRDlcdTc5Q0RcdTRFRTUgJy9hcGknIFx1NUYwMFx1NTkzNFx1NzY4NFx1NEVGQlx1NjEwRlx1OERFRlx1NUY4NFx1OTBGRFx1OEJFRlx1NEVFM1x1NzQwNlx1N0VEOVx1NTQwRVx1N0FFRlx1RkYwQ1xuICAgICAgLy8gXHU1QkZDXHU4MUY0IFNQQSBcdThERUZcdTc1MzFcdUZGMDhcdTU5ODIgL2FwaS1rZXlzXHVGRjA5XHU4RkQ0XHU1NkRFIDQwNCBKU09OIFx1ODAwQ1x1OTc1RSBSZWFjdCBcdTk4NzVcdTk3NjJcdTMwMDJcbiAgICAgICcvYXBpLyc6IHtcbiAgICAgICAgdGFyZ2V0OiAnaHR0cDovLzEyNy4wLjAuMTo4MDAwJyxcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgICBzZWN1cmU6IGZhbHNlLFxuICAgICAgICB3czogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICAnL2hlYWx0aCc6IHtcbiAgICAgICAgdGFyZ2V0OiAnaHR0cDovLzEyNy4wLjAuMTo4MDAwJyxcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgICBzZWN1cmU6IGZhbHNlLFxuICAgICAgfSxcbiAgICB9LFxuICB9LFxuICBidWlsZDoge1xuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIG91dHB1dDoge1xuICAgICAgICBtYW51YWxDaHVua3M6IHtcbiAgICAgICAgICAncmVhY3QtbWFya2Rvd24nOiBbJ3JlYWN0LW1hcmtkb3duJywgJ3JlbWFyay1nZm0nXSxcbiAgICAgICAgICBlY2hhcnRzOiBbJ2VjaGFydHMnLCAnZWNoYXJ0cy1mb3ItcmVhY3QnXSxcbiAgICAgICAgICB0aXB0YXA6IFtcbiAgICAgICAgICAgICdAdGlwdGFwL3JlYWN0JyxcbiAgICAgICAgICAgICdAdGlwdGFwL3N0YXJ0ZXIta2l0JyxcbiAgICAgICAgICAgICdAdGlwdGFwL2V4dGVuc2lvbi1pbWFnZScsXG4gICAgICAgICAgICAnQHRpcHRhcC9leHRlbnNpb24tbGluaycsXG4gICAgICAgICAgICAnQHRpcHRhcC9leHRlbnNpb24tcGxhY2Vob2xkZXInLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG59KTsiXSwKICAibWFwcGluZ3MiOiAiO0FBQW1ZLFNBQVMsb0JBQW9CO0FBQ2hhLE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFGakIsSUFBTSxtQ0FBbUM7QUFJekMsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sQ0FBQztBQUFBLEVBQ2pCLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLEtBQUssS0FBSyxRQUFRLGtDQUFXLE9BQU87QUFBQSxJQUN0QztBQUFBLEVBQ0Y7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0wsU0FBUztBQUFBLFFBQ1AsUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLFFBQ2QsUUFBUTtBQUFBLFFBQ1IsSUFBSTtBQUFBLE1BQ047QUFBQSxNQUNBLFdBQVc7QUFBQSxRQUNULFFBQVE7QUFBQSxRQUNSLGNBQWM7QUFBQSxRQUNkLFFBQVE7QUFBQSxNQUNWO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLGVBQWU7QUFBQSxNQUNiLFFBQVE7QUFBQSxRQUNOLGNBQWM7QUFBQSxVQUNaLGtCQUFrQixDQUFDLGtCQUFrQixZQUFZO0FBQUEsVUFDakQsU0FBUyxDQUFDLFdBQVcsbUJBQW1CO0FBQUEsVUFDeEMsUUFBUTtBQUFBLFlBQ047QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRjtBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
