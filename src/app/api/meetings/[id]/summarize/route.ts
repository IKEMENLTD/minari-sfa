import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, isAuthError, requireRole } from '@/lib/auth';
import { summarizeMeeting } from '@/lib/external/claude';
import type { ApiResult } from '@/types';

const uuidSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// POST /api/meetings/[id]/summarize - AI要約生成（同期実行）
// Netlify Functionsのタイムアウトを120秒に設定済み (netlify.toml)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<{ summary_text: string }>>> {
  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<{ summary_text: string }>>;

  const roleError = requireRole(auth, ['admin', 'manager']);
  if (roleError) return roleError as NextResponse<ApiResult<{ summary_text: string }>>;

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json({ data: null, error: '無効なIDフォーマットです' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // 会議の存在確認
    const { data: meeting } = await supabase.from('meetings').select('id, deal_id').eq('id', id).single();
    if (!meeting) {
      return NextResponse.json({ data: null, error: '指定された会議が見つかりません' }, { status: 404 });
    }

    // 議事録の取得
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

    console.log(`[summarize] 会議 ${id} の要約生成を開始...`);

    // Claude APIで直接要約生成
    const result = await summarizeMeeting(transcript.full_text);

    console.log(`[summarize] Claude API 完了。保存中...`);

    // summariesテーブルに保存
    const { error: insertError } = await supabase.from('summaries').insert({
      meeting_id: id,
      summary_text: result.summary,
      model_used: 'claude-sonnet-4-20250514',
      suggested_next_action: result.suggestedNextAction ?? null,
      suggested_next_action_date: result.suggestedNextActionDate ?? null,
    });

    if (insertError) {
      console.error(`[summarize] 要約保存失敗:`, insertError.message);
      return NextResponse.json({ data: null, error: '要約の保存に失敗しました' }, { status: 500 });
    }

    // 参加者更新（空の場合のみ）
    if (result.participants.length > 0) {
      const { data: meetingData } = await supabase.from('meetings').select('participants').eq('id', id).single();
      if (!meetingData?.participants || (meetingData.participants as string[]).length === 0) {
        await supabase.from('meetings').update({ participants: result.participants }).eq('id', id);
      }
    }

    // 案件の次アクション自動設定
    if (result.suggestedNextAction && meeting.deal_id) {
      const { data: deal } = await supabase.from('deals').select('next_action').eq('id', meeting.deal_id).single();
      if (deal && !deal.next_action) {
        const payload: Record<string, string> = { next_action: result.suggestedNextAction };
        if (result.suggestedNextActionDate) payload.next_action_date = result.suggestedNextActionDate;
        await supabase.from('deals').update(payload).eq('id', meeting.deal_id);
      }
    }

    console.log(`[summarize] 会議 ${id} の要約を正常に生成・保存しました`);

    return NextResponse.json({
      data: { summary_text: result.summary },
      error: null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '要約生成中にエラーが発生しました';
    console.error('[summarize] エラー:', msg);

    if (msg.includes('API キー') || msg.includes('API key')) {
      return NextResponse.json(
        { data: null, error: 'Claude APIキーが設定されていないか無効です。設定画面で確認してください。' },
        { status: 500 }
      );
    }
    if (msg.includes('(401)')) {
      return NextResponse.json({ data: null, error: 'Claude APIキーが無効です。' }, { status: 500 });
    }
    if (msg.includes('(429)')) {
      return NextResponse.json({ data: null, error: 'APIレート制限に達しました。しばらく待ってください。' }, { status: 429 });
    }

    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
