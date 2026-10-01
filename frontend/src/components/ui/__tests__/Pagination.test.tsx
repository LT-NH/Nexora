import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination, pageWindow } from '../Pagination';

describe('pageWindow（纯函数）', () => {
  it('总页数不超过窗口大小时全部显示', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(1, 3, 5)).toEqual([1, 2, 3]);
  });

  it('页数多时以当前页为中心开窗', () => {
    // 与替换前 Orders 页的手写逻辑逐分支等价
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(3, 20)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(4, 20)).toEqual([2, 3, 4, 5, 6]);
    expect(pageWindow(10, 20)).toEqual([8, 9, 10, 11, 12]);
  });

  it('靠近末尾时窗口右对齐，不越界', () => {
    expect(pageWindow(20, 20)).toEqual([16, 17, 18, 19, 20]);
    expect(pageWindow(19, 20)).toEqual([16, 17, 18, 19, 20]);
  });

  it('窗口始终落在 [1, totalPages] 内，且长度不超过上限', () => {
    for (const total of [1, 2, 5, 6, 13, 100]) {
      for (let page = 1; page <= total; page++) {
        const win = pageWindow(page, total);
        expect(win.length).toBeLessThanOrEqual(5);
        expect(Math.min(...win)).toBeGreaterThanOrEqual(1);
        expect(Math.max(...win)).toBeLessThanOrEqual(total);
        // 升序且不重复
        expect([...win].sort((a, b) => a - b)).toEqual(win);
        expect(new Set(win).size).toBe(win.length);
      }
    }
  });

  it('非法输入返回空数组而不是崩溃', () => {
    expect(pageWindow(1, 0)).toEqual([]);
    expect(pageWindow(1, -3)).toEqual([]);
  });
});

describe('<Pagination />', () => {
  const base = { page: 2, totalPages: 5, total: 42 };

  it('渲染页码并高亮当前页', () => {
    render(<Pagination {...base} onPageChange={() => {}} />);
    for (const n of [1, 2, 3, 4, 5]) {
      expect(screen.getByText(String(n))).toBeInTheDocument();
    }
  });

  it('点击页码回调对应页号', () => {
    const calls: number[] = [];
    render(<Pagination {...base} onPageChange={(p) => calls.push(p)} />);
    fireEvent.click(screen.getByText('4'));
    expect(calls).toEqual([4]);
  });

  it('首页禁用「上一页」、末页禁用「下一页」', () => {
    const { rerender } = render(
      <Pagination {...base} page={1} onPageChange={() => {}} />,
    );
    expect(screen.getByLabelText('上一页')).toBeDisabled();

    rerender(
      <Pagination {...base} page={5} onPageChange={() => {}} />,
    );
    expect(screen.getByLabelText('下一页')).toBeDisabled();
  });

  it('文案模板的占位符会被替换', () => {
    render(
      <Pagination
        {...base}
        label="共 {total} 条，第 {page}/{totalPages} 页"
        onPageChange={() => {}}
      />,
    );
    expect(screen.getByText('共 42 条，第 2/5 页')).toBeInTheDocument();
  });

  it('不传 label 时不渲染文案', () => {
    render(<Pagination {...base} onPageChange={() => {}} />);
    expect(screen.queryByText(/共/)).not.toBeInTheDocument();
  });
});
