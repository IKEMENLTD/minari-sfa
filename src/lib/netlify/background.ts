// ---------------------------------------------------------------------------
// Netlify Background Function 呼び出しヘルパー
// V1形式のBackground Function（-backgroundサフィックス）を呼び出す
// Netlifyが自動的に202を返し、バックグラウンドで最大15分実行
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
 * Netlify Background Function で会議要約を非同期実行する。
 * V1形式のBackground Functionは即座に202を返し、最大15分バックグラウンドで実行可能。
 */
export async function invokeSummarizeBackground(meetingId: string): Promise<void> {
  const siteUrl = getSiteUrl();
  const url = `${siteUrl}/.netlify/functions/summarize-meeting-background`;
  const secret = process.env.BACKGROUND_FUNCTION_SECRET;

  if (!secret) {
    console.warn('[security] BACKGROUND_FUNCTION_SECRET が未設定です。本番環境では必ず設定してください。');
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-background-secret': secret ?? '',
      },
      body: JSON.stringify({ meeting_id: meetingId }),
    });

    // Background Functionは202を返すはず。それ以外はエラー
    if (!res.ok && res.status !== 202) {
      const body = await res.text().catch(() => '');
      console.error(`Background Function エラー (status: ${res.status}):`, body);
      throw new Error(`Background Function 呼び出し失敗 (status: ${res.status}): ${body}`);
    }

    console.log(`Background Function 呼び出し成功 (meeting_id: ${meetingId}, status: ${res.status})`);
  } catch (err: unknown) {
    console.error(
      `Background Function 呼び出し失敗 (meeting_id: ${meetingId}):`,
      err instanceof Error ? err.message : err
    );
    throw err; // 呼び出し元にエラーを伝播
  }
}
