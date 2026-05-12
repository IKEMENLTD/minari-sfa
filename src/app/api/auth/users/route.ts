import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ApiResult } from '@/types';

interface LoginUserOption {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// GET /api/auth/users - ログイン画面のユーザー選択ドロップダウン用
// 認証不要(name のみ返却、email/role/created_at は返さない)。
// ---------------------------------------------------------------------------
export async function GET(): Promise<NextResponse<ApiResult<LoginUserOption[]>>> {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('id, name')
      .order('name');

    if (error) {
      console.error('ログイン用ユーザー一覧の取得に失敗しました:', error.message);
      return NextResponse.json(
        { data: null, error: 'ユーザー一覧の取得に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: (data ?? []) as LoginUserOption[], error: null });
  } catch (err) {
    console.error('ログイン用ユーザー一覧APIエラー:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: 'ユーザー一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}
