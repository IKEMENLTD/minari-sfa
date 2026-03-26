import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { MeetingRow, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

const createMeetingSchema = z.object({
  company_id: z.string().uuid().nullable().optional(),
  meeting_date: z.string().date(),
  participants: z.array(z.string()),
  source: z.enum(['jamroll', 'proud']),
  source_id: z.string().nullable().optional(),
  is_internal: z.boolean(),
  ai_estimated_company: z.string().nullable().optional(),
  transcript_text: z.string().optional(),
});

// ---------------------------------------------------------------------------
// GET /api/meetings - 商談一覧
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResult<MeetingRow[]>>> {
  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);

    const approvalStatus = searchParams.get('approval_status');
    const isInternal = searchParams.get('is_internal');

    let query = supabase
      .from('meetings')
      .select('*')
      .order('meeting_date', { ascending: false });

    if (approvalStatus) {
      query = query.eq('approval_status', approvalStatus);
    }

    if (isInternal !== null && isInternal !== undefined && isInternal !== '') {
      query = query.eq('is_internal', isInternal === 'true');
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { data: null, error: `商談一覧の取得に失敗しました: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data as MeetingRow[], error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
    return NextResponse.json(
      { data: null, error: `商談一覧の取得中にエラーが発生しました: ${message}` },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/meetings - 新規商談作成
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResult<MeetingRow>>> {
  try {
    const body: unknown = await request.json();
    const parsed = createMeetingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: `入力値が不正です: ${parsed.error.issues.map((e: { message: string }) => e.message).join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const { transcript_text, ...meetingData } = parsed.data;

    // 商談を作成
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .insert(meetingData)
      .select()
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json(
        { data: null, error: `商談の作成に失敗しました: ${meetingError?.message}` },
        { status: 500 }
      );
    }

    // transcript_text が指定されていれば transcripts にも保存
    if (transcript_text) {
      const { error: transcriptError } = await supabase
        .from('transcripts')
        .insert({
          meeting_id: meeting.id,
          full_text: transcript_text,
          source: parsed.data.source,
        });

      if (transcriptError) {
        console.error('議事録の保存に失敗しました:', transcriptError.message);
      }
    }

    return NextResponse.json(
      { data: meeting as MeetingRow, error: null },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
    return NextResponse.json(
      { data: null, error: `商談の作成中にエラーが発生しました: ${message}` },
      { status: 500 }
    );
  }
}
