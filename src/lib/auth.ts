import { NextRequest, NextResponse } from 'next/server';
import type { ApiResult } from '@/types';

// =============================================================================
// 認証ヘルパー
// PoC フェーズでは簡易チェック（Bearer トークンの存在確認のみ）
// 本番移行時には Supabase Auth の JWT 検証に置き換えること
// =============================================================================

/**
 * API リクエストの認証を検証する。
 * 認証失敗時は 401 レスポンスを返す。成功時は null を返す。
 *
 * 【PoC】USE_MOCK=true 時は認証をスキップする
 * 【本番】Supabase Auth の JWT を検証し、ユーザー情報を返すように変更すること
 */
export function validateAuth(
  request: NextRequest
): NextResponse<ApiResult<null>> | null {
  // モックモードでは認証をスキップ
  if (process.env.USE_MOCK === 'true') {
    return null;
  }

  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { data: null, error: '認証が必要です。Authorization ヘッダーを設定してください。' },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);
  if (!token) {
    return NextResponse.json(
      { data: null, error: '無効な認証トークンです。' },
      { status: 401 }
    );
  }

  // TODO: 本番ではここで Supabase Auth の JWT を検証する
  // const { data: { user }, error } = await supabase.auth.getUser(token);

  return null; // 認証成功
}
