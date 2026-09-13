/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 前端错误监控 DSN（留空不启用） */
  readonly VITE_SENTRY_DSN?: string;
  /** 静态托管模式（花生壳等无 SPA fallback 的服务器）：1 = 使用 HashRouter */
  readonly VITE_STATIC_HOST?: string;
  /** 后端 API 基址（默认走同源 /api 代理） */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
