/**
 * HTMLタグを除去するサニタイズ関数。
 * XSS防止のため、全テキスト入力フィールドに適用する。
 */
export function stripHtml(input: string): string {
  let result = input
    // HTMLエンティティをデコード
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    // HTMLタグを除去（複数パスでネスト対応）
    .replace(/<[^>]*>/g, '')
    .replace(/<[^>]*>/g, '')
    // javascript: / data: URIスキームを除去
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:/gi, '')
    // イベントハンドラ属性を除去
    .replace(/on\w+\s*=/gi, '');
  return result.trim();
}
