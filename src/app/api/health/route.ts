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
    /** Background Function 認証鍵 */
    background_secret: boolean;
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
  const version = '2026-05-13-phaseG';

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
    background_secret: !!process.env.BACKGROUND_FUNCTION_SECRET,
    settings_encryption: !!process.env.SETTINGS_ENCRYPTION_KEY && process.env.SETTINGS_ENCRYPTION_KEY.length === 64,
    claude_api_key: 'missing',
    tldv_api_key: 'missing',
    users_seeded: false,
  };
  const issues: string[] = [];

  try {
    const supabase = createServerSupabaseClient();

    // users seeded?
    const { count: userCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
    checks.users_seeded = (userCount ?? 0) >= 1;
    checks.supabase = true;
    if ((userCount ?? 0) < 1) issues.push('users テーブルが空です。migration 005 を適用してください。');

    // app_settings から claude_api_key / tldv_api_key の状態判定
    const { data: settings } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['claude_api_key', 'tldv_api_key']);

    const cfg = (key: string) => (settings ?? []).find((s) => s.key === key);
    const claudeRow = cfg('claude_api_key');
    if (process.env.CLAUDE_API_KEY) {
      checks.claude_api_key = 'env';
    } else if (claudeRow?.value) {
      checks.claude_api_key = (claudeRow.value as string).startsWith('v1:') ? 'db_encrypted' : 'db_plaintext';
    }
    const tldvRow = cfg('tldv_api_key');
    if (process.env.TLDV_API_KEY) {
      checks.tldv_api_key = 'env';
    } else if (tldvRow?.value) {
      checks.tldv_api_key = (tldvRow.value as string).startsWith('v1:') ? 'db_encrypted' : 'db_plaintext';
    }
  } catch (err) {
    checks.supabase = false;
    issues.push(`Supabase 接続失敗: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  // 各種ガイダンス
  if (!checks.auth_secret) issues.push('AUTH_HMAC_SECRET (or SITE_PASSWORD) が未設定 — Netlify env で設定してください。');
  if (!checks.background_secret) issues.push('BACKGROUND_FUNCTION_SECRET が未設定 — Netlify env で設定すると AI要約が動きます。');
  if (!checks.settings_encryption) issues.push('SETTINGS_ENCRYPTION_KEY が未設定または64文字hexでない — Netlify env で設定してください(UI設定の暗号化に必須)。');
  if (checks.claude_api_key === 'missing') issues.push('Claude API key が未設定 — /settings から登録してください(SETTINGS_ENCRYPTION_KEY が必要)。');
  if (checks.claude_api_key === 'db_plaintext') issues.push('Claude API key が平文DB保存 — /settings から再保存すると暗号化されます。');
  if (checks.tldv_api_key === 'missing') issues.push('TLDV API key が未設定 — /settings から登録してください。');

  const ok = checks.supabase && checks.auth_secret && checks.settings_encryption && checks.claude_api_key !== 'missing';

  return NextResponse.json({
    data: { ok, version, checks, issues },
    error: null,
  });
}
