import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, isAuthError } from '@/lib/auth';
import { summarizeMeeting } from '@/lib/external/claude';
import { exportMeetingToDoc } from '@/lib/export-to-doc';
import type { ApiResult } from '@/types';

const uuidSchema = z.string().uuid();

interface ResummarizeResult {
  summary_text: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<ResummarizeResult>>> {
  const authResult = await validateAuth(request);
  if (isAuthError(authResult)) return authResult as NextResponse<ApiResult<ResummarizeResult>>;

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json(
        { data: null, error: '無効なIDフォーマットです' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // transcriptを取得
    const { data: transcript } = await supabase
      .from('transcripts')
      .select('full_text')
      .eq('meeting_id', id)
      .single();

    if (!transcript || !transcript.full_text) {
      return NextResponse.json(
        { data: null, error: '文字起こしデータが見つかりません' },
        { status: 404 }
      );
    }

    // Claude APIで再要約
    const analysis = await summarizeMeeting(transcript.full_text as string);

    // summariesテーブルを更新（既存があればupdate、なければinsert）
    const { data: existingSummary } = await supabase
      .from('summaries')
      .select('id')
      .eq('meeting_id', id)
      .single();

    if (existingSummary) {
      await supabase
        .from('summaries')
        .update({
          summary_text: analysis.summary,
          model_used: 'claude-sonnet-4-20250514',
        })
        .eq('meeting_id', id);
    } else {
      await supabase
        .from('summaries')
        .insert({
          meeting_id: id,
          summary_text: analysis.summary,
          model_used: 'claude-sonnet-4-20250514',
        });
    }

    // meetingのparticipants, ai_estimated_companyも更新
    await supabase
      .from('meetings')
      .update({
        participants: analysis.participants,
        ai_estimated_company: analysis.estimatedCompany,
      })
      .eq('id', id);

    // Google Docsに自動書き出し
    try {
      await exportMeetingToDoc(id);
    } catch (docErr) {
      console.error('Google Docs自動書き出し失敗:', docErr instanceof Error ? docErr.message : docErr);
    }

    return NextResponse.json({
      data: { summary_text: analysis.summary },
      error: null,
    });
  } catch (err) {
    console.error('要約再生成エラー:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: err instanceof Error ? err.message : '要約の再生成に失敗しました' },
      { status: 500 }
    );
  }
}
