import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ApiResult } from '@/types';

// =============================================================================
// 認証ヘルパー
// Cookie(sd_auth)ベースの「ユーザー選択 + 共有パスワード」認証
//   トークン形式: `{userId}.{sessionId}.{hmac-sha256-hex}`
//   署名対象: `{userId}:{sessionId}`
// role は users テーブルから DB lookup する(全員admin決め打ちを廃止)。
// =============================================================================

const COOKIE_NAME = 'sd_auth';

export interface AuthResult {
  userId: string;
  role: 'admin' | 'manager' | 'member';
}

/**
 * セッショントークンを検証し、userId を返す。失敗時は null。
 *
 * ⚠️ Edge runtime版が `src/middleware.ts` に存在(Web Crypto API実装)。
 * 両者を変更する際は同期すること。詳細は middleware.ts のコメント参照。
 */
function verifyAndExtractUserId(cookieValue: string): string | null {
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return null;
  const [userId, sessionId, sig] = parts;
  if (!userId || !sessionId || !sig) return null;

  // userId は UUID 形式であること
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId) || !uuidRegex.test(sessionId)) return null;

  const hmacSecret = process.env.SITE_PASSWORD;
  if (!hmacSecret) {
    console.error('SITE_PASSWORD 環境変数が設定されていません');
    return null;
  }

  const expected = createHmac('sha256', hmacSecret)
    .update(`${userId}:${sessionId}`)
    .digest('hex');

  const sigBuf = Buffer.from(sig, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expBuf)) return null;

  return userId;
}

/**
 * 簡易メモリキャッシュで users.role を5分保持(連発lookup抑制)。
 * Edge環境ではプロセス再起動でリセットされるが許容範囲。
 */
const roleCache = new Map<string, { role: AuthResult['role']; expireAt: number }>();
const ROLE_CACHE_TTL_MS = 5 * 60_000;

async function lookupUserRole(userId: string): Promise<AuthResult['role'] | null> {
  const cached = roleCache.get(userId);
  if (cached && cached.expireAt > Date.now()) {
    return cached.role;
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (error || !data) return null;

    const role = data.role as AuthResult['role'];
    if (!['admin', 'manager', 'member'].includes(role)) return null;

    roleCache.set(userId, { role, expireAt: Date.now() + ROLE_CACHE_TTL_MS });
    return role;
  } catch (err) {
    console.error('users.role lookup 失敗:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * APIリクエストの認証を検証する。
 * Cookie(sd_auth)のHMAC署名を検証し、users.role を DB lookup して AuthResult を返す。
 */
export async function validateAuth(
  request: NextRequest
): Promise<NextResponse<ApiResult<null>> | AuthResult> {
  const cookie = request.cookies.get(COOKIE_NAME);
  if (!cookie) {
    return NextResponse.json(
      { data: null, error: '認証が必要です。ログインしてください。' },
      { status: 401 }
    );
  }

  const userId = verifyAndExtractUserId(cookie.value);
  if (!userId) {
    return NextResponse.json(
      { data: null, error: 'セッショントークンが無効です。再度ログインしてください。' },
      { status: 401 }
    );
  }

  const role = await lookupUserRole(userId);
  if (!role) {
    return NextResponse.json(
      { data: null, error: 'ユーザー情報が取得できません。管理者にお問い合わせください。' },
      { status: 401 }
    );
  }

  return { userId, role };
}

export function isAuthError(
  result: NextResponse<ApiResult<null>> | AuthResult
): result is NextResponse<ApiResult<null>> {
  return result instanceof NextResponse;
}

/**
 * POST/PATCH/PUT/DELETE の Content-Type が application/json か検証。
 */
export function validateContentType(
  request: NextRequest
): NextResponse<ApiResult<null>> | null {
  const method = request.method.toUpperCase();
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    const contentType = request.headers.get('Content-Type') ?? '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { data: null, error: 'Content-Type は application/json を指定してください。' },
        { status: 415 }
      );
    }
  }
  return null;
}

/**
 * 指定したロールのいずれかを持っているかチェック。
 */
export function requireRole(
  user: AuthResult,
  allowedRoles: AuthResult['role'][]
): NextResponse<ApiResult<null>> | null {
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { data: null, error: 'この操作を実行する権限がありません。' },
      { status: 403 }
    );
  }
  return null;
}

/**
 * テスト/管理用: ロールキャッシュをクリア。
 */
export function clearRoleCache(userId?: string): void {
  if (userId) roleCache.delete(userId);
  else roleCache.clear();
}
