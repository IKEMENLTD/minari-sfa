// ---------------------------------------------------------------------------
// サーバー起動時に定期実行タスクを登録
// PLOUD/Jamroll の新着議事録を自動検出 → 要約 → 承認待ちとしてDB保存
// ---------------------------------------------------------------------------

const INTERVAL_MS = 15 * 60 * 1000; // 15分ごと

export async function register() {
  // サーバーサイド（Node.js runtime）でのみ実行
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[auto-process] CRON_SECRET が未設定のため自動処理を無効化');
    return;
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

  console.log(`[auto-process] 自動議事録処理を開始（${INTERVAL_MS / 60000}分間隔）`);

  // 起動直後は30秒待ってから初回実行（サーバー起動完了を待つ）
  setTimeout(() => {
    triggerProcess(baseUrl, cronSecret);

    setInterval(() => {
      triggerProcess(baseUrl, cronSecret);
    }, INTERVAL_MS);
  }, 30_000);
}

async function triggerProcess(baseUrl: string, secret: string): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}/api/cron/process`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      console.error(`[auto-process] 処理失敗: HTTP ${res.status}`);
      return;
    }

    const data = (await res.json()) as { processed: number; errors: string[] };

    if (data.processed > 0) {
      console.log(`[auto-process] ${data.processed}件の新規議事録を処理しました`);
    }
    if (data.errors.length > 0) {
      console.warn(`[auto-process] エラー:`, data.errors);
    }
  } catch (err) {
    console.error(`[auto-process] 実行エラー:`, err instanceof Error ? err.message : err);
  }
}
