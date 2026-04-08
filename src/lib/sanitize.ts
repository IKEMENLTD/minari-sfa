/**
 * HTMLタグを除去するサニタイズ関数。
 * XSS防止のため、全テキスト入力フィールドに適用する。
 */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}
