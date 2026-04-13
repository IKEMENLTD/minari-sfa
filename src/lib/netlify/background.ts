// ---------------------------------------------------------------------------
// Netlify Background Function 呼び出しヘルパー
// ---------------------------------------------------------------------------

/**
 * サイトのベースURLを取得する。
 * Netlify では process.env.URL が自動的に設定される。
 */
function getSiteUrl(): string {
  // Netlify が自動設定する環境変数
  const netlifyUrl = process.env.URL;
  if (netlifyUrl) return netlifyUrl;

  // フォールバック: 明示的に設定されたベースURL
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (baseUrl) return baseUrl;

  // ローカル開発用
  return 'http://localhost:3000';
}

/**
 * Netlify Background Function で会議要約を非同期実行する。
 * Background Function は即座に 202 を返すためブロッキング時間は最小限。
 *
 * Background Function は最大15分実行可能なため、
 * Claude API の長時間処理（30〜120秒）でも安全に完了する。
 */
export async function invokeSummarizeBackground(meetingId: string): Promise<void> {
  const siteUrl = getSiteUrl();
  const url = `${siteUrl}/.netlify/functions/summarize-meeting-background`;
  const secret = process.env.BACKGROUND_FUNCTION_SECRET;
  if (!secret) {
    console.warn('[security] BACKGROUND_FUNCTION_SECRET が未設定です。本番環境では必ず設定してください。');
  }

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-background-secret': secret ?? '',
      },
      body: JSON.stringify({ meeting_id: meetingId }),
    });
  } catch (err: unknown) {
    console.error(
      `Background Function 呼び出し失敗 (meeting_id: ${meetingId}):`,
      err instanceof Error ? err.message : err
    );
  }
}
