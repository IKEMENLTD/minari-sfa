import { API_TIMEOUT_MS } from '@/lib/constants';
import type { JamrollTranscript } from '@/types';

// ---------------------------------------------------------------------------
// Jamroll API 連携
// ---------------------------------------------------------------------------

const JAMROLL_API_BASE = 'https://api.jamroll.jp/v1';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Jamroll から新しい議事録を取得する
 * @param from - 取得開始日 (YYYY-MM-DD) optional
 * @param to - 取得終了日 (YYYY-MM-DD) optional
 */
export async function fetchNewTranscripts(from?: string, to?: string): Promise<JamrollTranscript[]> {
  const apiKey = process.env.JAMROLL_API_KEY;
  if (!apiKey || apiKey === 'your-jamroll-api-key') {
    throw new Error('JAMROLL_API_KEY が未設定です');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    // from/to指定時は日付範囲で取得（statusフィルタなし）、未指定時は従来通り新規のみ
    let url: string;
    if (from || to) {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      url = `${JAMROLL_API_BASE}/transcripts?${params.toString()}`;
    } else {
      url = `${JAMROLL_API_BASE}/transcripts?status=new`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Jamroll API エラー詳細 (${response.status}):`, errorBody);
      throw new Error(`Jamroll API エラー (${response.status}): リクエストに失敗しました`);
    }

    const data = (await response.json()) as { transcripts: JamrollTranscript[] };
    return data.transcripts;
  } finally {
    clearTimeout(timeoutId);
  }
}
