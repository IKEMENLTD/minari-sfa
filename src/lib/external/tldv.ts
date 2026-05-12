import { TLDV_API_TIMEOUT_MS } from '@/lib/constants';
import type { TldvMeeting, TldvTranscript } from '@/types';

// ---------------------------------------------------------------------------
// TLDV API クライアント
// Base URL: https://pasta.tldv.io
// API Version: v1alpha1
// Auth: x-api-key header
// Docs: https://doc.tldv.io/index.html
// ---------------------------------------------------------------------------

const TLDV_BASE_URL = 'https://pasta.tldv.io/v1alpha1';
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

function getApiKey(): string {
  const key = process.env.TLDV_API_KEY;
  if (!key) {
    throw new Error('環境変数 TLDV_API_KEY が設定されていません');
  }
  return key;
}

function isRetryableStatus(status: number): boolean {
  // 429: rate limited, 408: request timeout, 5xx: server error
  return status === 408 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * TLDV API への fetch ラッパー。指数バックオフで最大3回リトライ。
 * - 429/5xx/408 はリトライ対象
 * - 4xx (上記以外) は即fail
 * - signal abort 時はリトライしない
 */
async function tldvFetch(path: string, signal?: AbortSignal): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${TLDV_BASE_URL}${path}`, {
        headers: {
          'x-api-key': getApiKey(),
          'Content-Type': 'application/json',
        },
        signal,
      });

      if (response.ok) return response;

      // リトライ可否判定
      if (attempt < MAX_RETRIES && isRetryableStatus(response.status)) {
        const body = await response.text().catch(() => '');
        console.warn(`[tldv] retry ${attempt + 1}/${MAX_RETRIES} (status ${response.status}):`, body.slice(0, 200));
        // Retry-After ヘッダ尊重(秒指定)
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }

      const body = await response.text().catch(() => '');
      console.error(`TLDV API エラー (${response.status}):`, body);
      throw new Error(`TLDV API エラー (${response.status})`);
    } catch (err) {
      // AbortError はリトライしない
      if (err instanceof Error && err.name === 'AbortError') throw err;
      lastError = err;
      if (attempt < MAX_RETRIES) {
        console.warn(`[tldv] network retry ${attempt + 1}/${MAX_RETRIES}:`, err instanceof Error ? err.message : err);
        await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('TLDV API: 不明なエラー');
}

/**
 * TLDV APIから会議一覧を取得する
 * ページネーション対応
 */
export async function fetchMeetings(
  options?: { pageSize?: number; page?: number }
): Promise<TldvMeeting[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TLDV_API_TIMEOUT_MS);

  try {
    const params = new URLSearchParams();
    if (options?.pageSize) params.set('pageSize', String(options.pageSize));
    if (options?.page) params.set('page', String(options.page));

    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await tldvFetch(`/meetings${query}`, controller.signal);
    const data = await response.json();

    // TLDVのレスポンス形式に合わせてマッピング
    const meetings = Array.isArray(data) ? data : (data.results ?? data.meetings ?? []);

    return meetings.map((m: Record<string, unknown>) => {
      // 参加者: invitees + organizer を統合
      const invitees = Array.isArray(m.invitees) ? m.invitees : [];
      const participantNames: string[] = invitees.map(
        (p: Record<string, unknown>) =>
          typeof p === 'string' ? p : String(p.name ?? p.email ?? '')
      ).filter(Boolean);
      if (m.organizer && typeof m.organizer === 'object') {
        const org = m.organizer as Record<string, unknown>;
        const orgName = String(org.name ?? org.email ?? '');
        if (orgName) participantNames.unshift(orgName);
      }

      // 日付をISO 8601形式に変換（Supabase/PostgreSQLが受け付ける形式）
      const rawDate = String(m.happenedAt ?? m.happened_at ?? m.date ?? m.created_at ?? '');
      let isoDate: string;
      try {
        isoDate = rawDate ? new Date(rawDate).toISOString() : new Date().toISOString();
      } catch {
        isoDate = new Date().toISOString();
      }

      return {
        id: String(m.id ?? ''),
        title: String(m.title ?? m.name ?? ''),
        date: isoDate,
        duration: typeof m.duration === 'number' ? m.duration : null,
        participants: participantNames,
        thumbnail_url: typeof m.thumbnail_url === 'string' ? m.thumbnail_url
          : typeof m.image === 'string' ? m.image
          : typeof m.preview_image === 'string' ? m.preview_image
          : typeof m.thumbnail === 'string' ? m.thumbnail
          : null,
      };
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * TLDV APIから特定の会議の文字起こしを取得する
 */
export async function fetchTranscript(meetingId: string): Promise<TldvTranscript> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TLDV_API_TIMEOUT_MS);

  try {
    const response = await tldvFetch(`/meetings/${meetingId}/transcript`, controller.signal);
    const data = await response.json();

    // 文字起こしのテキストを結合
    let text: string;
    if (typeof data === 'string') {
      text = data;
    } else if (typeof data.text === 'string') {
      text = data.text;
    } else if (Array.isArray(data.data)) {
      // tldv format: { data: [{ speaker, text, startTime, endTime }] }
      text = data.data
        .map((s: Record<string, unknown>) => {
          const speaker = s.speaker_name ?? s.speaker ?? '';
          const content = s.text ?? s.content ?? '';
          return speaker ? `${speaker}: ${content}` : String(content);
        })
        .join('\n');
    } else if (Array.isArray(data.segments ?? data.entries)) {
      const segments = data.segments ?? data.entries;
      text = segments
        .map((s: Record<string, unknown>) => {
          const speaker = s.speaker_name ?? s.speaker ?? '';
          const content = s.text ?? s.content ?? '';
          return speaker ? `${speaker}: ${content}` : String(content);
        })
        .join('\n');
    } else {
      text = JSON.stringify(data);
    }

    return { meeting_id: meetingId, text };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * TLDV APIから新規会議を取得し、既存のsource_idと比較して未取り込みのものを返す
 */
export async function fetchNewMeetings(
  existingSourceIds: Set<string>
): Promise<TldvMeeting[]> {
  const meetings = await fetchMeetings({ pageSize: 50 });
  console.log(`[tldv] fetchMeetings returned ${meetings.length} meetings:`, meetings.map(m => m.id));
  const newOnes = meetings.filter((m) => !existingSourceIds.has(m.id));
  console.log(`[tldv] After filtering existing (${existingSourceIds.size}): ${newOnes.length} new`);
  return newOnes;
}

/**
 * 全ページを巡回して TLDV API から全会議を取得する。
 * - pageSize=100 で固定、ページ番号を1から増やしながら空ページまで継続
 * - maxPages で暴走防止(デフォルト 20 = 最大2000件)
 */
export async function fetchAllMeetings(
  options?: { pageSize?: number; maxPages?: number }
): Promise<TldvMeeting[]> {
  const pageSize = options?.pageSize ?? 100;
  const maxPages = options?.maxPages ?? 20;
  const all: TldvMeeting[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const batch = await fetchMeetings({ pageSize, page });
    if (batch.length === 0) break;
    all.push(...batch);
    // pageSize 未満なら最終ページ
    if (batch.length < pageSize) break;
  }

  return all;
}
