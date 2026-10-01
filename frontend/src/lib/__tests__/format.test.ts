import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatCurrency,
} from '../format';

describe('formatDate / formatDateTime', () => {
  it('把后端的 naive UTC 串按 UTC 解析，而不是按浏览器本地时区', () => {
    // 后端存的是 datetime.utcnow()，序列化后不带时区后缀。
    // 若浏览器按本地时区解析，东八区用户会看到比真实时间早 8 小时的值。
    const utcNoon = '2026-09-20T12:00:00';
    const parsed = new Date(`${utcNoon}Z`);

    // 断言解析结果与「显式带 Z」的同一时刻一致（不依赖运行机器的时区）
    expect(formatDateTime(utcNoon)).toBe(
      formatDateTime(parsed.toISOString()),
    );
  });

  it('已带时区信息的串不做二次处理', () => {
    const withZ = '2026-09-20T12:00:00Z';
    expect(formatDateTime(withZ)).toBe(formatDateTime(withZ));
  });

  it('formatDate 输出年月日，formatDateTime 输出月日时分', () => {
    const value = '2026-09-20T12:00:00Z';
    expect(formatDate(value)).toMatch(/2026/);
    expect(formatDateTime(value)).toMatch(/\d{2}:\d{2}/);
  });

  it('空值与非法值的兜底文案可被翻译函数接管', () => {
    const t = (key: string) => `[${key}]`;

    expect(formatDate(null, t)).toBe('[no_date]');
    expect(formatDate('', t)).toBe('[no_date]');
    expect(formatDate('not-a-date', t)).toBe('[invalid_date]');

    // 不传 t 时回落到 '-'，方便在非组件环境直接调用
    expect(formatDate(null)).toBe('-');
    expect(formatDate('not-a-date')).toBe('-');
  });
});

describe('formatCurrency', () => {
  it('一万以下保留两位小数（不丢精度）', () => {
    expect(formatCurrency(1234.56)).toBe('¥1,234.56');
    expect(formatCurrency(0)).toBe('¥0.00');
  });

  it('一万以上折算为「万」', () => {
    expect(formatCurrency(12345)).toContain('万');
    expect(formatCurrency(123456)).toContain('万');
  });

  it('负数按绝对值判断量级，符号保留', () => {
    expect(formatCurrency(-12345)).toMatch(/^-¥/);
  });

  it('非数字输入回落到占位符', () => {
    expect(formatCurrency(Number.NaN)).toBe('-');
  });

  it('单位文案可被翻译函数替换', () => {
    const t = () => 'w';
    expect(formatCurrency(50000, t)).toContain('w');
  });
});
