import { describe, it, expect } from 'vitest';
import { htmlToPlainText } from '../text';

describe('htmlToPlainText', () => {
  it('把富文本降级为纯文本（商品描述列用它替代 dangerouslySetInnerHTML）', () => {
    expect(htmlToPlainText('<p>纯棉 <strong>T 恤</strong></p>')).toBe('纯棉 T 恤');
    expect(htmlToPlainText('第一行<br/>第二行')).toBe('第一行 第二行');
  });

  it('整体丢弃 script / style 块，而不是把内容当正文显示', () => {
    expect(htmlToPlainText('<script>alert(1)</script>正常文字')).toBe('正常文字');
    expect(htmlToPlainText('<style>.a{color:red}</style>正常')).toBe('正常');
  });

  it('解码常见实体', () => {
    expect(htmlToPlainText('A&amp;B')).toBe('A&B');
    expect(htmlToPlainText('&lt;tag&gt;')).toBe('<tag>');
    expect(htmlToPlainText('&nbsp;空格')).toBe('空格');
  });

  it('XSS 载荷被降级为文字，而不是保留可执行的标签', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const out = htmlToPlainText(payload);
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
  });

  it('空值返回空串', () => {
    expect(htmlToPlainText(null)).toBe('');
    expect(htmlToPlainText(undefined)).toBe('');
    expect(htmlToPlainText('')).toBe('');
  });

  it('压缩多余空白，适配窄列单行显示', () => {
    expect(htmlToPlainText('<p>a</p>\n\n   <p>b</p>')).toBe('a b');
  });
});
