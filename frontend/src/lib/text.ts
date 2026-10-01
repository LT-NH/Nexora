/**
 * 文本降级工具。
 *
 * 商品描述由富文本编辑器（tiptap）写入，是 HTML 字符串。列表页只需要一段
 * 摘要，**绝不能把原始 HTML 直接塞进 DOM** —— 否则任何能写商品描述的人
 * （含 CSV 导入路径）都可以注入 `<img src=x onerror=...>`，脚本会在管理台
 * 上下文里执行，进而窃取 localStorage 中的 access token。
 *
 * 这里的做法是把 HTML 降级为纯文本、再交给 React 转义输出，
 * 从根上消除 innerHTML 注入面。
 */

const ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

/** 把 HTML 字符串降级为单行纯文本摘要（用于表格窄列展示）。 */
export function htmlToPlainText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    // 先整体丢弃 script / style 块，避免其内容被当作正文显示
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    // 去掉其余标签
    .replace(/<[^>]*>/g, ' ')
    // 解码常见实体；未知实体统一降级为空格（保守策略）
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITY_MAP[m.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
