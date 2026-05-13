import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, isAuthError, requireRole } from '@/lib/auth';
import { invokeSummarizeBackground } from '@/lib/netlify/background';
import { processMeetingSummary } from '@/lib/process-meeting-summary';
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

    // PhaseS: Background Function 優先(Sonnetで15分まで可)、失敗時 inline fallback
    // 1) BG function 試行
    let backgrounded = false;
    try {
      await invokeSummarizeBackground(id);
      backgrounded = true;
    } catch (bgErr) {
      const msg = bgErr instanceof Error ? bgErr.message : 'BG関数失敗';
      console.warn('[summarize] BG関数失敗、inline fallback へ:', msg);
      await supabase.from('job_logs').insert({
        job_type: 'summarize',
        meeting_id: id,
        status: 'bg_fallback',
        message: msg.substring(0, 2000),
      }).then(() => {}, () => {});

      // 2) Inline fire-and-forget(26秒 sync timeout 対策で response は待たない)
      void processMeetingSummary(id).catch((err) => {
        const inlineMsg = err instanceof Error ? err.message : 'inline実行失敗';
        console.error('[summarize] inline実行失敗:', inlineMsg);
        void createServerSupabaseClient()
          .from('job_logs')
          .insert({
            job_type: 'summarize',
            meeting_id: id,
            status: 'async_error',
            message: inlineMsg.substring(0, 2000),
          })
          .then(() => {}, () => {});
      });
    }

    return NextResponse.json({
      data: {
        queued: true,
        backgrounded,
        message: backgrounded
          ? 'Background Function で要約処理を開始(最大15分)'
          : 'Inline fire-and-forget で要約処理を開始(26秒以内に完了想定)',
      },
      error: null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '要約リクエスト中にエラーが発生しました';
    console.error('[summarize] エラー:', msg);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
