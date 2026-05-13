import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, isAuthError, requireRole } from '@/lib/auth';
import { processMeetingSummary } from '@/lib/process-meeting-summary';
import type { ApiResult } from '@/types';

// このルートは AI要約処理を直接実行する(Netlify Functions paid 120秒以内に完了想定)
export const maxDuration = 120;

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

    // 直接実行(PhaseM: BG関数廃止)
    try {
      const result = await processMeetingSummary(id);
      if (result.status === 'error') {
        return NextResponse.json(
          { data: null, error: result.message },
          { status: 500 },
        );
      }
      return NextResponse.json({
        data: {
          queued: true,
          status: result.status,
          message: result.message,
          summaryId: result.summaryId,
          dealId: result.dealId,
          dealCreated: result.dealCreated,
          aiObservationAppended: result.aiObservationAppended,
        },
        error: null,
      });
    } catch (inlineErr) {
      const msg = inlineErr instanceof Error ? inlineErr.message : 'AI要約処理に失敗';
      console.error('[summarize] inline実行失敗:', msg);
      try {
        await supabase.from('job_logs').insert({
          job_type: 'summarize',
          meeting_id: id,
          status: 'invoke_error',
          message: msg.substring(0, 2000),
        });
      } catch (logErr) {
        console.error('[summarize] job_log書込失敗:', logErr instanceof Error ? logErr.message : logErr);
      }
      return NextResponse.json(
        { data: null, error: `AI要約処理に失敗: ${msg}` },
        { status: 500 },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '要約リクエスト中にエラーが発生しました';
    console.error('[summarize] エラー:', msg);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
