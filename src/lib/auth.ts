import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import type { ApiResult } from '@/types';

// =============================================================================
// 認証ヘルパー
// Cookie（sd_auth）ベースのパスワード認証を検証する
// =============================================================================

const COOKIE_NAME = 'sd_auth';

/**
 * 認証結果。成功時はユーザー情報を含む。
 */
export interface AuthResult {
  userId: string;
  role: 'admin' | 'manager' | 'member';
}

/**
 * HMAC署名付きセッショントークンを検証する。
 * トークン形式: `{uuid}.{hmac-sha256-hex}`
 */
function verifySessionToken(cookieValue: string): boolean {
  const dotIndex = cookieValue.indexOf('.');
  if (dotIndex === -1) return false;

  const sessionId = cookieValue.slice(0, dotIndex);
  const sig = cookieValue.slice(dotIndex + 1);
  if (!sessionId || !sig) return false;

  const hmacSecret = process.env.SITE_PASSWORD ?? 'fallback-secret';
  const expected = createHmac('sha256', hmacSecret).update(sessionId).digest('hex');

  if (sig.length !== expected.length) return false;

  let result = 0;
  for (let i = 0; i < sig.length; i++) {
    result |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}

/**
 * API リクエストの認証を検証する。
 * Cookie（sd_auth）のHMAC署名を検証し、認証済みであれば AuthResult を返す。
 * ミドルウェアでも検証済みだが、APIルートでも二重チェックする。
 *
 * 現時点ではパスワード共有認証のため、全ユーザーを admin として扱う。
 * 将来 Supabase Auth に移行する際は、ここでJWT検証+ロール取得に切り替える。
 */
export async function validateAuth(
  request: NextRequest
): Promise<NextResponse<ApiResult<null>> | AuthResult> {
  const cookie = request.cookies.get(COOKIE_NAME);

  if (!cookie || !verifySessionToken(cookie.value)) {
    return NextResponse.json(
      { data: null, error: '認証が必要です。ログインしてください。' },
      { status: 401 }
    );
  }

  // パスワード共有認証のため、セッションIDからユーザーを識別
  const sessionId = cookie.value.split('.')[0];
  return { userId: sessionId, role: 'admin' };
}

/**
 * 認証結果がエラーレスポンスかどうかを判定する型ガード
 */
export function isAuthError(
  result: NextResponse<ApiResult<null>> | AuthResult
): result is NextResponse<ApiResult<null>> {
  return result instanceof NextResponse;
}

/**
 * POST/PATCH/PUT リクエストの Content-Type が application/json であることを検証する。
 * text/plain や multipart/form-data での CSRF 攻撃を防止する。
 * DELETE はリクエストボディを持たない場合があるため対象外。
 */
export function validateContentType(
  request: NextRequest
): NextResponse<ApiResult<null>> | null {
  const method = request.method.toUpperCase();
  if (['POST', 'PATCH', 'PUT'].includes(method)) {
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
 * 指定したロールのいずれかを持っているかチェックする。
 * 権限不足の場合は 403 レスポンスを返す。
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
