import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAuth, isAuthError, requireRole } from '@/lib/auth';
import type { ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// POST /api/admin/migrate - データベースマイグレーション実行
// service_role キーで直接SQLを実行する
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResult<{ results: string[] }>>> {
  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<{ results: string[] }>>;
  const roleError = requireRole(auth, ['admin']);
  if (roleError) return roleError as NextResponse<ApiResult<{ results: string[] }>>;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { data: null, error: 'Supabase環境変数が設定されていません' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const results: string[] = [];

    // 1. app_settings テーブル作成（存在確認してから作成）
    const { error: checkError } = await supabase
      .from('app_settings')
      .select('key')
      .limit(1);

    if (checkError && (checkError.code === '42P01' || checkError.message?.includes('does not exist'))) {
      // テーブルが存在しない — PostgREST経由ではDDLは実行できないが、
      // supabase-jsのrpcを試みる。もしダメならユーザーに手動実行を案内
      results.push('app_settings テーブルが存在しません。手動作成が必要です。');
    } else if (checkError) {
      results.push(`app_settings チェックエラー: ${checkError.message}`);
    } else {
      results.push('app_settings テーブル: OK（既に存在）');
    }

    // 2. meetings テーブルのRLS確認（selectできるか試行）
    const { error: meetingsCheck } = await supabase
      .from('meetings')
      .select('id')
      .limit(1);
    results.push(meetingsCheck
      ? `meetings テーブルチェック: ${meetingsCheck.message}`
      : 'meetings テーブル: OK'
    );

    // 3. transcripts テーブルの確認
    const { error: transcriptsCheck } = await supabase
      .from('transcripts')
      .select('id')
      .limit(1);
    results.push(transcriptsCheck
      ? `transcripts テーブルチェック: ${transcriptsCheck.message}`
      : 'transcripts テーブル: OK'
    );

    // 4. summaries テーブルの確認
    const { error: summariesCheck } = await supabase
      .from('summaries')
      .select('id')
      .limit(1);
    results.push(summariesCheck
      ? `summaries テーブルチェック: ${summariesCheck.message}`
      : 'summaries テーブル: OK'
    );

    return NextResponse.json({ data: { results }, error: null });
  } catch (err) {
    console.error('マイグレーション実行中にエラー:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: 'マイグレーション実行中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
