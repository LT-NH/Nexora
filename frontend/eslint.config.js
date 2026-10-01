import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

/**
 * Nexora 前端 ESLint 配置（flat config / ESLint 9）。
 *
 * 目标：让 `npm run lint` 真正可用并可进 CI。
 * 此前 package.json 里声明了 lint 脚本，但 devDependencies 没有任何 eslint 包、
 * 也没有配置文件，脚本从未成功执行过一次（代码里却有 11 处 eslint-disable，
 * 说明作者以为它在跑）。
 *
 * 规则取舍：类型逃逸（no-explicit-any）与未使用变量先以 warning 暴露，
 * 让 lint 立刻可用且不被历史存量淹没；待存量收敛后再提升为 error。
 */
export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'shots-new',
      'test-results',
      'playwright-report',
      '*.cjs',
      '*.timestamp-*.mjs',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // —— 存量债：先暴露、不阻断 ——
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // —— React Compiler 相关的渐进性建议（降为 warning）——
      // 这三条是 eslint-plugin-react-hooks 7.x 才引入的新检查，衡量的是
      // 「对 React Compiler 是否友好」，而不是运行时会出错的硬性问题。
      // 存量约 48 处、散布 46 个文件；根治方式是引入数据获取层
      // （TanStack Query）替代手写 useEffect + setState，属独立重构任务。
      //
      // 注意：react-hooks/rules-of-hooks 保持 error —— 条件调用 Hook 会真实
      // 导致 "Rendered more hooks than during the previous render" 崩溃。
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',

      // —— 代码质量：这些应当是 error ——
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-debugger': 'error',
      eqeqeq: ['error', 'smart'],
      // 中英文混排排版中，JSX 文本里的全角空格（U+3000）用于制造视觉间隔，
      // 属有意用法（例：打印单据上的「姓名　电话」），因此跳过 JSX 文本节点
      'no-irregular-whitespace': ['error', { skipJSXText: true }],
      // 短路表达式当语句（`ref.current && clearInterval(ref.current)`）是
      // 项目中大量使用的合法写法，按业界惯例放开
      '@typescript-eslint/no-unused-expressions': [
        'error',
        { allowShortCircuit: true, allowTernary: true },
      ],
    },
  },
  // vite.config.ts / 配置脚本运行在 Node 环境
  {
    files: ['*.config.ts', 'vite.config.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
);
