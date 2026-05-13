// =============================================================================
// AI観察追記 helper (PhaseE)
//
// 設計原則:
//   - **人判断の領域には触らない** (phase/probability/revenue確定値等)
//   - **append only**: 既存 status_detail/revenue_note を上書きしない
//   - **片方向更新**: has_movement は false→true のみ自動(true→false は人判断)
//   - **同日重複防止**: 同日同種ブロックは追加しない
// =============================================================================

export type TemperatureSignal = 'positive' | 'neutral' | 'negative';

export const TEMPERATURE_LABEL: Record<TemperatureSignal, string> = {
  positive: '前向き',
  neutral: '中立',
  negative: '後ろ向き',
};

/**
 * 既存テキストに「[AI観察 YYYY-MM-DD] <label>=<value>」を append。
 * 同日同 label のブロックが既にあれば追加しない(冪等)。
 */
export function appendAiObservation(
  existing: string | null | undefined,
  isoDate: string,
  label: string,
  value: string
): string {
  const marker = `[AI観察 ${isoDate}] ${label}`;
  const base = existing ?? '';
  if (base.includes(marker)) return base; // 既に同日同種あり → no-op
  const block = `${marker}=${value}`;
  return base ? `${base}\n${block}` : block;
}

/**
 * has_movement の片方向自動更新ロジック:
 *   - current=false, signal=positive → true (更新)
 *   - それ以外 → 変更しない(null返却)
 */
export function shouldFlipHasMovement(
  current: boolean,
  signal: TemperatureSignal | null
): boolean | null {
  if (signal === 'positive' && current === false) return true;
  return null;
}

/**
 * AI観察行のパターン: `[AI観察 YYYY-MM-DD] <label>=<value>`
 */
const AI_OBS_LINE = /^\[AI観察 (\d{4}-\d{2}-\d{2})\] (.+?)=(.*)$/;

export interface AiObservationLine {
  raw: string;
  date: string;
  label: string;
  value: string;
}

/**
 * テキストから AI観察行をすべて抽出する(行ベース)。
 */
export function extractAiObservations(text: string | null | undefined): AiObservationLine[] {
  if (!text) return [];
  const result: AiObservationLine[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(AI_OBS_LINE);
    if (m) {
      result.push({ raw: line, date: m[1], label: m[2], value: m[3] });
    }
  }
  return result;
}

/**
 * 指定の AI観察行をテキストから除去する。
 * 削除後、隣接する連続改行は1個に圧縮。
 */
export function removeAiObservation(
  text: string | null | undefined,
  rawLineToRemove: string
): string {
  if (!text) return '';
  return text
    .split('\n')
    .filter((line) => line !== rawLineToRemove)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
