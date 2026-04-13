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

function getApiKey(): string {
  const key = process.env.TLDV_API_KEY;
  if (!key) {
    throw new Error('環境変数 TLDV_API_KEY が設定されていません');
  }
  return key;
}

async function tldvFetch(path: string, signal?: AbortSignal): Promise<Response> {
  const response = await fetch(`${TLDV_BASE_URL}${path}`, {
    headers: {
      'x-api-key': getApiKey(),
      'Content-Type': 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`TLDV API エラー (${response.status}):`, body);
    throw new Error(`TLDV API エラー (${response.status})`);
  }

  return response;
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
