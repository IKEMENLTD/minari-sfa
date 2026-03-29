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
