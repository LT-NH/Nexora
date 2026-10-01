/**
 * 日期与金额格式化 —— 全站唯一实现。
 *
 * 背景：这两个函数此前在页面里被复制了 8 份，而且**签名与行为互不一致** ——
 * `Orders` 收 `(dateStr, t)`、`Payments` 只收 `(dateStr)`；`Analytics` 的金额
 * 保留两位小数、`StatsOverview` 却用 `toLocaleString()` 抹掉小数，同一个数字
 * 在两个页面上显示不同值。统一到这里之后，行为只有一处定义。
 *
 * `t` 为可选翻译函数：传入时使用页面字典里的文案（如 `no_date` / `invalid_date`），
 * 不传则回落到中文默认值，便于在非组件环境（测试、工具函数）里直接调用。
 */

type Translate = (key: string) => string;

/** 无值 / 非法值时的兜底显示 */
const EMPTY = '-';

function _toDate(value?: string | number | Date | null): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);

  const text = String(value);
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/.test(text);
  const hasTimePart = text.includes('T');

  // 后端统一用 `datetime.utcnow()` 存 naive UTC，且序列化后**不带时区后缀**。
  // 浏览器会把 `2026-09-20T10:00:00` 当作**本地时间**解析，于是深圳用户看到的时间
  // 比真实值早 8 小时。这里对「带时间但没写时区」的串显式补 `Z` 按 UTC 解析。
  // （stores 页原先手工做过这件事，其余五个页面没有 —— 统一到这里之后才真正一致。）
  const normalized = hasTimezone || !hasTimePart ? text : `${text}Z`;
  const d = new Date(normalized);
  if (!Number.isNaN(d.getTime())) return d;

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function _fallback(
  value: unknown,
  t: Translate | undefined,
  key: 'no_date' | 'invalid_date',
): string {
  const isMissing = value === null || value === undefined || value === '';
  if (!t) return EMPTY;
  return isMissing ? t('no_date') : t('invalid_date');
}

/** 日期：`2026/09/20` */
export function formatDate(
  value?: string | number | Date | null,
  t?: Translate,
): string {
  const d = _toDate(value);
  if (!d) return _fallback(value, t, 'no_date');
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/** 日期 + 时间：`09/20 17:30` */
export function formatDateTime(
  value?: string | number | Date | null,
  t?: Translate,
): string {
  const d = _toDate(value);
  if (!d) return _fallback(value, t, 'no_date');
  return d.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 金额：`¥1,234.56`，达到一万以上自动折算为「万」。
 *
 * 注意：这里统一保留两位小数。此前 `StatsOverview` 用的是 `toLocaleString()`
 * （无小数），会把 1234.56 显示成 ¥1,235 —— 属于精度丢失，一并纠正。
 */
export function formatCurrency(value: number, t?: Translate): string {
  const v = Number(value);
  if (!Number.isFinite(v)) return EMPTY;
  const wan = t ? t('unit_wan') : '万';
  // 负号提到货币符号之前（`-¥12.3万`），而不是 `¥-12.3万` —— 后者是
  // 直接拼接 toFixed 结果的产物，不符合中文财务排版惯例。
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 100000) return `${sign}¥${(abs / 10000).toFixed(1)}${wan}`;
  if (abs >= 10000) return `${sign}¥${(abs / 10000).toFixed(2)}${wan}`;
  return `${sign}¥${abs.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
