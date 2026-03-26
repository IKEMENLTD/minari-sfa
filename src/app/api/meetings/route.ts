import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth } from '@/lib/auth';
import type { MeetingRow, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

const VALID_APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;

const createMeetingSchema = z.object({
  company_id: z.string().uuid().nullable().optional(),
  meeting_date: z.string().date(),
  participants: z.array(z.string().max(200)).max(50),
  source: z.enum(['jamroll', 'proud']),
  source_id: z.string().max(500).nullable().optional(),
  is_internal: z.boolean(),
  ai_estimated_company: z.string().max(500).nullable().optional(),
  transcript_text: z.string().max(500_000).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/meetings - 商談一覧
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResult<MeetingRow[]>>> {
  const authError = validateAuth(request);
  if (authError) return authError as NextResponse<ApiResult<MeetingRow[]>>;

  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);

    const approvalStatus = searchParams.get('approval_status');
    const isInternal = searchParams.get('is_internal');

    // クエリパラメータのバリデーション
    if (approvalStatus && !(VALID_APPROVAL_STATUSES as readonly string[]).includes(approvalStatus)) {
      return NextResponse.json(
        { data: null, error: `無効な approval_status です。有効な値: ${VALID_APPROVAL_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

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
      console.error('商談一覧の取得に失敗しました:', error.message);
      return NextResponse.json(
        { data: null, error: '商談一覧の取得に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data as MeetingRow[], error: null });
  } catch (err) {
    console.error('商談一覧の取得中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '商談一覧の取得中にエラーが発生しました' },
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
  const authErrorPost = validateAuth(request);
  if (authErrorPost) return authErrorPost as NextResponse<ApiResult<MeetingRow>>;

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
      console.error('商談の作成に失敗しました:', meetingError?.message);
      return NextResponse.json(
        { data: null, error: '商談の作成に失敗しました' },
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
    console.error('商談の作成中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '商談の作成中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
