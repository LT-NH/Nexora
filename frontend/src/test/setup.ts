/**
 * vitest 全局 setup。
 *
 * 1) 引入 jest-dom 的断言扩展（toBeInTheDocument / toBeDisabled 等）。
 * 2) 注册 afterEach(cleanup) —— vitest 与 jest 不同，**不会**自动卸载上一个用例
 *    渲染的 DOM。不显式清理会让前一个用例的节点残留，后续 getByLabelText /
 *    queryByText 会命中错误节点（本文件最初就踩了这个坑）。
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
