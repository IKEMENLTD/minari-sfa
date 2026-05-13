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
    /** TLDV API key */
    tldv_api_key: 'env' | 'db_encrypted' | 'db_plaintext' | 'missing';
    /** seed users 3名 */
    users_seeded: boolean;
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
    if (process.env.CLAUDE_API_KEY) checks.claude_api_key = 'env';
    else checks.claude_api_key = stateFromValue(claudeRow?.value as string | undefined);

    const tldvRow = cfg('tldv_api_key');
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
