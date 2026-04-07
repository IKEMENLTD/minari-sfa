import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, isAuthError, requireRole } from '@/lib/auth';
import { invokeSummarizeBackground } from '@/lib/netlify/background';
import type { ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// POST /api/meetings/[id]/summarize - 要約生成（Background Function経由）
// フォールバック: 会議詳細画面から手動で要約を生成/再生成する
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<{ queued: boolean }>>> {
  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<{ queued: boolean }>>;

  const roleError = requireRole(auth, ['admin', 'manager']);
  if (roleError) return roleError as NextResponse<ApiResult<{ queued: boolean }>>;

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json(
        { data: null, error: '無効なIDフォーマットです' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // 会議の存在確認
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('id')
      .eq('id', id)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json(
        { data: null, error: '指定された会議が見つかりません' },
        { status: 404 }
      );
    }

    // transcript の存在確認
    const { data: transcript } = await supabase
      .from('transcripts')
      .select('id')
      .eq('meeting_id', id)
      .limit(1);

    if (!transcript || transcript.length === 0) {
      return NextResponse.json(
        { data: null, error: '文字起こしデータが存在しません。先にTLDV同期を実行してください。' },
        { status: 400 }
      );
    }

    // 再生成の場合: 既存の要約を削除
    const searchParams = new URL(request.url).searchParams;
    const forceRegenerate = searchParams.get('force') === 'true';

    if (forceRegenerate) {
      await supabase
        .from('summaries')
        .delete()
        .eq('meeting_id', id);
    }

    // Background Function で要約を非同期生成（即座に202が返るためブロッキング最小）
    await invokeSummarizeBackground(id);

    return NextResponse.json({
      data: { queued: true },
      error: null,
    });
  } catch (err) {
    console.error('要約リクエスト中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '要約リクエスト中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
