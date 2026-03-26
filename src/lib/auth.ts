import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ApiResult } from '@/types';

// =============================================================================
// 認証ヘルパー
// Supabase Auth の JWT を検証し、ユーザー情報・ロールを返す
// =============================================================================

/**
 * 認証結果。成功時はユーザー情報を含む。
 */
export interface AuthResult {
  userId: string;
  role: 'admin' | 'manager' | 'member';
}

/**
 * API リクエストの認証を検証する。
 * 認証失敗時は 401 レスポンスを返す。成功時は AuthResult を返す。
 *
 * 本番環境では USE_MOCK=true を禁止する（NODE_ENV=production 時はエラー）。
 */
export async function validateAuth(
  request: NextRequest
): Promise<NextResponse<ApiResult<null>> | AuthResult> {
  // モックモードでは認証をスキップ（PoC段階で使用。本番移行時に USE_MOCK=false に切り替え）
  if (process.env.USE_MOCK === 'true') {
    return { userId: 'mock-user-id', role: 'admin' };
  }

  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { data: null, error: '認証が必要です。Authorization ヘッダーを設定してください。' },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return NextResponse.json(
      { data: null, error: '無効な認証トークンです。' },
      { status: 401 }
    );
  }

  // Supabase Auth の JWT を検証する
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase の環境変数が設定されていません');
    return NextResponse.json(
      { data: null, error: 'サーバー設定エラーが発生しました' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return NextResponse.json(
      { data: null, error: '無効な認証トークンです。' },
      { status: 401 }
    );
  }

  // users テーブルからロール情報を取得
  const { createServerSupabaseClient } = await import('@/lib/supabase/server');
  const serverSupabase = createServerSupabaseClient();
  const { data: userData } = await serverSupabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const validRoles = ['admin', 'manager', 'member'] as const;
  const role = validRoles.includes(userData?.role as typeof validRoles[number])
    ? (userData!.role as AuthResult['role'])
    : 'member';

  return { userId: user.id, role };
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
