// ---------------------------------------------------------------------------
// Netlify Background Function 呼び出しヘルパー
// V1形式のBackground Function（-backgroundサフィックス）を呼び出す
// Netlifyが自動的に202を返し、バックグラウンドで最大15分実行
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { decryptSetting, isEncryptedValue } from '@/lib/crypto/settings-cipher';

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

// secret キャッシュ(関数インスタンス内で1回だけ取得)
let _cachedBgSecret: string | null = null;

/**
 * Background Function secret を取得する:
 *   1. env BACKGROUND_FUNCTION_SECRET 優先
 *   2. 無ければ app_settings (PhaseJ で UI設定可)
 */
async function getBackgroundSecret(): Promise<string | null> {
  if (_cachedBgSecret) return _cachedBgSecret;
  const envSecret = process.env.BACKGROUND_FUNCTION_SECRET;
  if (envSecret) {
    _cachedBgSecret = envSecret;
    return envSecret;
  }
  try {
    const supabase = createServerSupabaseClient();
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'background_function_secret').single();
    if (data?.value) {
      const raw = data.value as string;
      const plain = isEncryptedValue(raw) ? decryptSetting(raw) : raw;
      _cachedBgSecret = plain;
      return plain;
    }
  } catch (err) {
    console.warn('[bg-invoke] background_function_secret DB取得失敗:', err instanceof Error ? err.message : err);
  }
  return null;
}

/**
 * Netlify Background Function で会議要約を非同期実行する。
 * V1形式のBackground Functionは即座に202を返し、最大15分バックグラウンドで実行可能。
 */
export async function invokeSummarizeBackground(meetingId: string): Promise<void> {
  const siteUrl = getSiteUrl();
  const url = `${siteUrl}/.netlify/functions/summarize-meeting-background`;
  const secret = await getBackgroundSecret();

  if (!secret) {
    console.warn('[security] BACKGROUND_FUNCTION_SECRET が env にも app_settings にも未設定です。BG function 側で 401 になります。');
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
