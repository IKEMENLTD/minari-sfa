// ---------------------------------------------------------------------------
// Netlify Background Function 呼び出しヘルパー
// 注: summarize APIは直接Claude APIを呼ぶ方式に変更済み。
// このヘルパーはtldv webhook等からの非同期呼び出し用に残す。
// ---------------------------------------------------------------------------

/**
 * サイトのベースURLを取得する。
 * Netlify では process.env.URL が自動的に設定される。
 */
function getSiteUrl(): string {
  const netlifyUrl = process.env.URL;
  if (netlifyUrl) return netlifyUrl;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (baseUrl) return baseUrl;

  return 'http://localhost:3000';
}

/**
 * 会議要約API を呼び出す（Webhook等からの自動トリガー用）。
 * Background Functionではなく、直接summarize APIを呼び出す。
 */
export async function invokeSummarizeBackground(meetingId: string): Promise<void> {
  const siteUrl = getSiteUrl();
  const url = `${siteUrl}/api/meetings/${meetingId}/summarize`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `sd_auth=${process.env.INTERNAL_AUTH_TOKEN ?? ''}`,
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`要約API呼び出し失敗 (meeting_id: ${meetingId}, status: ${res.status}):`, body);
    } else {
      console.log(`要約API呼び出し成功 (meeting_id: ${meetingId})`);
    }
  } catch (err: unknown) {
    console.error(
      `要約API呼び出しエラー (meeting_id: ${meetingId}):`,
      err instanceof Error ? err.message : err
    );
  }
}
