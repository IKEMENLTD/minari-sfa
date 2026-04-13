import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, isAuthError, requireRole } from '@/lib/auth';
import { invokeSummarizeBackground } from '@/lib/netlify/background';
import type { ApiResult } from '@/types';

const uuidSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// POST /api/meetings/[id]/summarize - AI要約生成
// Background Function経由で非同期実行（最大15分）
// 直接実行はNetlifyのタイムアウト制限で504になるため使用しない
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
      return NextResponse.json({ data: null, error: '無効なIDフォーマットです' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // 会議と議事録の存在確認
    const { data: meeting } = await supabase.from('meetings').select('id').eq('id', id).single();
    if (!meeting) {
      return NextResponse.json({ data: null, error: '指定された会議が見つかりません' }, { status: 404 });
    }

    const { data: transcript } = await supabase.from('transcripts').select('id').eq('meeting_id', id).limit(1);
    if (!transcript || transcript.length === 0) {
      return NextResponse.json(
        { data: null, error: '文字起こしデータが存在しません。先にTLDV同期を実行してください。' },
        { status: 400 }
      );
    }

    // 再生成の場合は既存要約を削除
    const force = new URL(request.url).searchParams.get('force') === 'true';
    if (force) {
      await supabase.from('summaries').delete().eq('meeting_id', id);
    } else {
      const { data: existing } = await supabase.from('summaries').select('id').eq('meeting_id', id).limit(1);
      if (existing && existing.length > 0) {
        return NextResponse.json(
          { data: null, error: '既に要約が存在します。再生成ボタンを使用してください。' },
          { status: 400 }
        );
      }
    }

    // Background Functionで非同期実行
    await invokeSummarizeBackground(id);

    return NextResponse.json({ data: { queued: true }, error: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '要約リクエスト中にエラーが発生しました';
    console.error('[summarize] エラー:', msg);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
