import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

/**
 * 单元测试配置（vitest）。
 *
 * 单独成文件而不是塞进 vite.config.ts：构建配置与测试配置的关注点不同，
 * 后者需要 jsdom 环境与 setup 注入，不该影响生产构建。
 * alias 等共用项通过 mergeConfig 从 vite.config 继承，避免两处维护。
 *
 * 版本约束：vitest 锁在 2.x —— 3/4/5 要求 vite ≥6，而本项目的 vite 是 5.4。
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/__tests__/**/*.{test,spec}.{ts,tsx}'],
      exclude: ['node_modules', 'dist', 'e2e'],
    },
  }),
);
