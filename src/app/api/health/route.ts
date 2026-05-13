import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, isAuthError, requireRole } from '@/lib/auth';
import type { ApiResult } from '@/types';

interface HealthCheck {
  /** 全体が運用可能か */
  ok: boolean;
  version: string;
  checks: {
    /** Supabase 接続 */
    supabase: boolean;
    /** 認証/署名鍵が設定されている */
    auth_secret: boolean;
    /** Background Function 認証鍵 (env or DB) */
    background_secret: 'env' | 'db_encrypted' | 'db_plaintext' | 'missing';
    /** Settings 暗号化 master key */
    settings_encryption: boolean;
    /** Claude API key (env or DB暗号化) */
    claude_api_key: 'env' | 'db_encrypted' | 'db_plaintext' | 'missing';
    /** Claude key の DB保存(env と DB 両方あり判定用) */
    claude_api_key_has_db?: boolean;
    /** TLDV API key */
    tldv_api_key: 'env' | 'db_encrypted' | 'db_plaintext' | 'missing';
    /** TLDV key の DB保存 */
    tldv_api_key_has_db?: boolean;
    /** seed users 3名 */
    users_seeded: boolean;
    /** Background Function 実機接続テスト(?ping=bg 時のみ) */
    bg_function_reachable?: 'ok' | 'auth_fail' | 'network_fail' | 'not_tested';
    bg_function_message?: string;
    /** Claude API キー実機検証(?ping=claude 時のみ) */
    claude_api_reachable?: 'ok' | 'auth_fail' | 'network_fail' | 'not_tested';
    claude_api_message?: string;
  };
  /** 詳細ガイダンス(admin 向け) */
  issues: string[];
}

/**
 * GET /api/health
 *
 * 認証無し: `{ ok, version }` のみ最小情報
 * 認証あり admin: env/DB の状態を詳細チェックして「何が足りないか」をUIに返す
 */
export async function GET(request: NextRequest): Promise<NextResponse<ApiResult<HealthCheck> | { ok: boolean; version: string }>> {
  const version = '2026-05-13-phaseK';

  // 認証 admin チェック(失敗時は最小レスポンス、unauthenticated でも 200で返す)
  const auth = await validateAuth(request);
  if (isAuthError(auth)) {
    return NextResponse.json({ ok: true, version });
  }
  const roleError = requireRole(auth, ['admin']);
  if (roleError) {
    return NextResponse.json({ ok: true, version });
  }

  const checks: HealthCheck['checks'] = {
    supabase: false,
    auth_secret: !!(process.env.AUTH_HMAC_SECRET || process.env.SITE_PASSWORD),
    background_secret: 'missing',
    settings_encryption: !!process.env.SETTINGS_ENCRYPTION_KEY && process.env.SETTINGS_ENCRYPTION_KEY.length === 64,
    claude_api_key: 'missing',
    tldv_api_key: 'missing',
    users_seeded: false,
    bg_function_reachable: 'not_tested',
    claude_api_reachable: 'not_tested',
  };
  if (process.env.BACKGROUND_FUNCTION_SECRET) checks.background_secret = 'env';
  const issues: string[] = [];

  try {
    const supabase = createServerSupabaseClient();

    // users seeded?
    const { count: userCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
    checks.users_seeded = (userCount ?? 0) >= 1;
    checks.supabase = true;
    if ((userCount ?? 0) < 1) issues.push('users テーブルが空です。migration 005 を適用してください。');

    // app_settings から各種 secret の状態判定
    const { data: settings } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['claude_api_key', 'tldv_api_key', 'background_function_secret']);

    const cfg = (key: string) => (settings ?? []).find((s) => s.key === key);
    const stateFromValue = (v: string | null | undefined): 'db_encrypted' | 'db_plaintext' | 'missing' => {
      if (!v) return 'missing';
      return v.startsWith('v1:') ? 'db_encrypted' : 'db_plaintext';
    };

    const claudeRow = cfg('claude_api_key');
    checks.claude_api_key_has_db = !!claudeRow?.value;
    if (process.env.CLAUDE_API_KEY) checks.claude_api_key = 'env';
    else checks.claude_api_key = stateFromValue(claudeRow?.value as string | undefined);

    const tldvRow = cfg('tldv_api_key');
    checks.tldv_api_key_has_db = !!tldvRow?.value;
    if (process.env.TLDV_API_KEY) checks.tldv_api_key = 'env';
    else checks.tldv_api_key = stateFromValue(tldvRow?.value as string | undefined);

    if (checks.background_secret === 'missing') {
      const bgRow = cfg('background_function_secret');
      checks.background_secret = stateFromValue(bgRow?.value as string | undefined);
    }
  } catch (err) {
    checks.supabase = false;
    issues.push(`Supabase 接続失敗: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  // 各種ガイダンス
  if (!checks.auth_secret) issues.push('AUTH_HMAC_SECRET (or SITE_PASSWORD) が未設定 — Netlify env で設定してください。');
  if (checks.background_secret === 'missing') issues.push('BACKGROUND_FUNCTION_SECRET が未設定 — Netlify env または /settings から設定すると AI要約が動きます。');
  else if (checks.background_secret === 'db_plaintext') issues.push('BACKGROUND_FUNCTION_SECRET が平文DB保存 — /settings から再保存すると暗号化されます(SETTINGS_ENCRYPTION_KEY が必要)。');
  if (checks.claude_api_key === 'missing') issues.push('Claude API key が未設定 — /settings から登録してください。');
  if (checks.claude_api_key === 'db_plaintext') issues.push('Claude API key が平文DB保存 — /settings から再保存すると暗号化されます(SETTINGS_ENCRYPTION_KEY が必要)。');
  if (checks.tldv_api_key === 'missing') issues.push('TLDV API key が未設定 — /settings から登録してください。');
  if (checks.tldv_api_key === 'db_plaintext') issues.push('TLDV API key が平文DB保存 — /settings から再保存すると暗号化されます(SETTINGS_ENCRYPTION_KEY が必要)。');

  // env + DB の衝突: env が優先されるため DB保存値は **使われない**
  if (checks.claude_api_key === 'env' && checks.claude_api_key_has_db) {
    issues.push('⚠️ Claude API key: env と DB 両方に保存されています。env が優先されるため /settings で保存した値は使われません。env を更新する(or env を削除して UI 運用)のどちらかで対応してください。');
  }
  if (checks.tldv_api_key === 'env' && checks.tldv_api_key_has_db) {
    issues.push('⚠️ TLDV API key: env と DB 両方に保存されています。env が優先されるため /settings で保存した値は使われません。');
  }

  // SETTINGS_ENCRYPTION_KEY は env 運用の場合は不要。
  // 全 operational secret が env から読まれている時のみ「情報」レベルで案内。
  const hasAnyDbPlaintext =
    checks.claude_api_key === 'db_plaintext' ||
    checks.tldv_api_key === 'db_plaintext' ||
    checks.background_secret === 'db_plaintext';
  const allFromEnv =
    checks.claude_api_key === 'env' &&
    (checks.tldv_api_key === 'env' || checks.tldv_api_key === 'missing') &&
    (checks.background_secret === 'env' || checks.background_secret === 'missing');

  if (!checks.settings_encryption) {
    if (hasAnyDbPlaintext) {
      issues.push('⚠️ SETTINGS_ENCRYPTION_KEY が未設定 — 一部キーが平文DB保存です。Netlify env に64文字hex の master key を設定して、/settings で再保存すると暗号化されます。');
    } else if (!allFromEnv) {
      issues.push('SETTINGS_ENCRYPTION_KEY が未設定 — UI から API キーを保存する場合に暗号化されません(現状は env で動作中なので任意)。');
    }
    // env で全部足りている場合は何も追加しない(不要)
  }

  // Background Function 実機接続テスト(オプション、?ping=bg時のみ)
  if (new URL(request.url).searchParams.get('ping') === 'bg') {
    try {
      const siteUrl = process.env.URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? '';
      if (!siteUrl) {
        checks.bg_function_reachable = 'network_fail';
        checks.bg_function_message = 'siteUrl 取得失敗(URL/NEXT_PUBLIC_BASE_URL env 未設定)';
      } else {
        const bgUrl = `${siteUrl}/.netlify/functions/summarize-meeting-background`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        try {
          const res = await fetch(bgUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-background-secret': process.env.BACKGROUND_FUNCTION_SECRET ?? 'invalid-test',
            },
            body: JSON.stringify({ meeting_id: '00000000-0000-0000-0000-000000000000' }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          // 202 = BG受理、404 = transcript無し(正常)、401 = secret不一致、500 = BG関数エラー
          if (res.status === 202 || res.status === 404) {
            checks.bg_function_reachable = 'ok';
            checks.bg_function_message = `status=${res.status} (BG function 到達OK)`;
          } else if (res.status === 401) {
            checks.bg_function_reachable = 'auth_fail';
            checks.bg_function_message = 'BG function 認証失敗(BACKGROUND_FUNCTION_SECRET 不一致)';
          } else {
            checks.bg_function_reachable = 'network_fail';
            const body = await res.text().catch(() => '');
            checks.bg_function_message = `status=${res.status} body=${body.substring(0, 200)}`;
          }
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          checks.bg_function_reachable = 'network_fail';
          checks.bg_function_message = fetchErr instanceof Error ? fetchErr.message : 'fetch失敗';
        }
      }
    } catch (e) {
      checks.bg_function_reachable = 'network_fail';
      checks.bg_function_message = e instanceof Error ? e.message : 'unknown';
    }
  }

  // Claude API キー実機検証(?ping=claude 時のみ)
  if (new URL(request.url).searchParams.get('ping') === 'claude') {
    try {
      // env or DB から API キーを取得
      let apiKey = process.env.CLAUDE_API_KEY;
      if (!apiKey) {
        try {
          const supabase = createServerSupabaseClient();
          const { data } = await supabase.from('app_settings').select('value').eq('key', 'claude_api_key').single();
          if (data?.value) {
            const { decryptSetting, isEncryptedValue } = await import('@/lib/crypto/settings-cipher');
            const raw = data.value as string;
            apiKey = isEncryptedValue(raw) ? decryptSetting(raw) : raw;
          }
        } catch {
          // ignore
        }
      }
      if (!apiKey) {
        checks.claude_api_reachable = 'auth_fail';
        checks.claude_api_message = 'API key 未設定';
      } else {
        // Anthropic API に最小 ping: max_tokens=1
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        try {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001', // 最小コストモデル
              max_tokens: 1,
              messages: [{ role: 'user', content: 'hi' }],
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (res.ok) {
            checks.claude_api_reachable = 'ok';
            checks.claude_api_message = '✅ Anthropic API 認証成功';
          } else if (res.status === 401) {
            checks.claude_api_reachable = 'auth_fail';
            const body = await res.text().catch(() => '');
            checks.claude_api_message = `❌ 401 — API keyが無効/revoke/期限切れ。${body.substring(0, 100)}`;
          } else {
            const body = await res.text().catch(() => '');
            checks.claude_api_reachable = 'network_fail';
            checks.claude_api_message = `status=${res.status} ${body.substring(0, 100)}`;
          }
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          checks.claude_api_reachable = 'network_fail';
          checks.claude_api_message = fetchErr instanceof Error ? fetchErr.message : 'fetch失敗';
        }
      }
    } catch (e) {
      checks.claude_api_reachable = 'network_fail';
      checks.claude_api_message = e instanceof Error ? e.message : 'unknown';
    }
  }

  // ok判定: SETTINGS_ENCRYPTION_KEY は ok 判定から除外(env運用で動作可能なため)
  const ok =
    checks.supabase &&
    checks.auth_secret &&
    checks.claude_api_key !== 'missing' &&
    checks.background_secret !== 'missing';

  return NextResponse.json({
    data: { ok, version, checks, issues },
    error: null,
  });
}
