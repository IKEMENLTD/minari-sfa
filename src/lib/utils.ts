import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';

/**
 * 日付を YYYY/MM/DD 形式にフォーマットする
 */
export function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'yyyy/MM/dd', { locale: ja });
  } catch {
    return dateStr;
  }
}

/**
 * 日時を YYYY/MM/DD HH:mm 形式にフォーマットする
 */
export function formatDateTime(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'yyyy/MM/dd HH:mm', { locale: ja });
  } catch {
    return dateStr;
  }
}

/**
 * テキストを指定文字数で切り詰める
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * UUID v4 を生成する
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * USE_MOCK 環境変数が true かどうかを判定する
 */
export function isMockMode(): boolean {
  return process.env.USE_MOCK === 'true';
}
