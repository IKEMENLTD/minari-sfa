import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, isAuthError, requireRole } from '@/lib/auth';
import { summarizeMeeting } from '@/lib/external/claude';
import type { ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// POST /api/meetings/[id]/summarize - 要約生成（直接実行）
// Background Functionを経由せず、直接Claude APIを呼び出す
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<{ queued: boolean; summary_text?: string }>>> {
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
      .select('id, deal_id')
      .eq('id', id)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json(
        { data: null, error: '指定された会議が見つかりません' },
        { status: 404 }
      );
    }

    // transcript の存在確認と取得
    const { data: transcript } = await supabase
      .from('transcripts')
      .select('full_text')
      .eq('meeting_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!transcript?.full_text) {
      return NextResponse.json(
        { data: null, error: '文字起こしデータが存在しません。先にTLDV同期を実行してください。' },
        { status: 400 }
      );
    }

    // 再生成の場合: 既存の要約を削除
    const searchParams = new URL(request.url).searchParams;
    const forceRegenerate = searchParams.get('force') === 'true';

    if (forceRegenerate) {
      await supabase.from('summaries').delete().eq('meeting_id', id);
    } else {
      // 既存要約がある場合はスキップ
      const { data: existingSummary } = await supabase
        .from('summaries')
        .select('id')
        .eq('meeting_id', id)
        .limit(1);

      if (existingSummary && existingSummary.length > 0) {
        return NextResponse.json(
          { data: null, error: '既に要約が存在します。再生成する場合は再生成ボタンを使用してください。' },
          { status: 400 }
        );
      }
    }

    // Claude APIで直接要約生成
    const result = await summarizeMeeting(transcript.full_text);

    // summariesテーブルに保存
    const { error: insertError } = await supabase.from('summaries').insert({
      meeting_id: id,
      summary_text: result.summary,
      model_used: 'claude-sonnet-4-20250514',
      suggested_next_action: result.suggestedNextAction ?? null,
      suggested_next_action_date: result.suggestedNextActionDate ?? null,
    });

    if (insertError) {
      console.error(`会議 ${id} の要約保存に失敗しました:`, insertError.message);
      return NextResponse.json(
        { data: null, error: '要約の保存に失敗しました' },
        { status: 500 }
      );
    }

    // participants が取得できた場合、meetings テーブルを更新（空の場合のみ）
    if (result.participants.length > 0) {
      const { data: meetingData } = await supabase
        .from('meetings')
        .select('participants')
        .eq('id', id)
        .single();

      const currentParticipants = meetingData?.participants as string[] | null;
      if (!currentParticipants || currentParticipants.length === 0) {
        await supabase
          .from('meetings')
          .update({ participants: result.participants })
          .eq('id', id);
      }
    }

    // deal_id が紐付いている場合、次アクションを自動設定（既存値がnullの場合のみ）
    if (result.suggestedNextAction && meeting.deal_id) {
      const { data: dealData } = await supabase
        .from('deals')
        .select('next_action')
        .eq('id', meeting.deal_id)
        .single();

      if (dealData && !dealData.next_action) {
        const updatePayload: Record<string, string> = {
          next_action: result.suggestedNextAction,
        };
        if (result.suggestedNextActionDate) {
          updatePayload.next_action_date = result.suggestedNextActionDate;
        }
        await supabase.from('deals').update(updatePayload).eq('id', meeting.deal_id);
      }
    }

    console.log(`会議 ${id} の要約を正常に生成・保存しました`);

    return NextResponse.json({
      data: { queued: true, summary_text: result.summary },
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '要約生成中にエラーが発生しました';
    console.error('要約生成エラー:', message);

    // Claude APIキー関連のエラーは具体的にユーザーに伝える
    if (message.includes('API キー') || message.includes('API key')) {
      return NextResponse.json(
        { data: null, error: 'Claude APIキーが設定されていないか、無効です。設定画面でAPIキーを確認してください。' },
        { status: 500 }
      );
    }
    if (message.includes('Claude API エラー (401)')) {
      return NextResponse.json(
        { data: null, error: 'Claude APIキーが無効です。設定画面で正しいキーを設定してください。' },
        { status: 500 }
      );
    }
    if (message.includes('Claude API エラー (429)')) {
      return NextResponse.json(
        { data: null, error: 'Claude APIのレート制限に達しました。しばらく待ってから再試行してください。' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { data: null, error: message },
      { status: 500 }
    );
  }
}
