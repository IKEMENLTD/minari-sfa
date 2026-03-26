import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, validateContentType } from '@/lib/auth';
import type { MeetingDetail, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

const updateMeetingSchema = z.object({
  company_id: z.string().uuid().nullable().optional(),
  meeting_date: z.string().date().optional(),
  participants: z.array(z.string().max(200)).max(50).optional(),
  is_internal: z.boolean().optional(),
  approval_status: z.enum(['pending', 'approved', 'rejected']).optional(),
}).strict();

// ---------------------------------------------------------------------------
// GET /api/meetings/[id] - 商談詳細
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<MeetingDetail>>> {
  const authResult = await validateAuth(request);
  if (authResult instanceof NextResponse) return authResult as NextResponse<ApiResult<MeetingDetail>>;

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json(
        { data: null, error: '無効なIDフォーマットです' },
        { status: 400 }
      );
    }
    const supabase = createServerSupabaseClient();

    // 商談本体を取得
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('id, company_id, meeting_date, participants, source, source_id, is_internal, ai_estimated_company, approval_status, approved_at, created_at')
      .eq('id', id)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json(
        { data: null, error: '指定された商談が見つかりません' },
        { status: 404 }
      );
    }

    // transcript を取得
    const includeFullText = new URL(request.url).searchParams.get('include_transcript') === 'true';
    const { data: transcripts } = await supabase
      .from('transcripts')
      .select('id, meeting_id, full_text, source, created_at')
      .eq('meeting_id', id)
      .order('created_at', { ascending: false })
      .limit(1);

    // full_textが不要な場合は除去
    const transcript = transcripts?.[0]
      ? includeFullText
        ? transcripts[0]
        : { ...transcripts[0], full_text: '' }
      : null;

    // summary を取得
    const { data: summaries } = await supabase
      .from('summaries')
      .select('id, meeting_id, summary_text, model_used, created_at')
      .eq('meeting_id', id)
      .order('created_at', { ascending: false })
      .limit(1);

    // company を取得
    let company = null;
    if (meeting.company_id) {
      const { data: companyData } = await supabase
        .from('companies')
        .select('id, name, tier, expected_revenue, sku_count, assigned_to, created_at, updated_at')
        .eq('id', meeting.company_id)
        .single();
      company = companyData;
    }

    const detail: MeetingDetail = {
      ...meeting,
      transcript,
      summary: summaries?.[0] ?? null,
      company,
    };

    return NextResponse.json({ data: detail, error: null });
  } catch (err) {
    console.error('商談詳細の取得中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '商談詳細の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/meetings/[id] - 商談更新
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<MeetingDetail>>> {
  const contentTypeError = validateContentType(request);
  if (contentTypeError) return contentTypeError as NextResponse<ApiResult<MeetingDetail>>;

  const authResultPatch = await validateAuth(request);
  if (authResultPatch instanceof NextResponse) return authResultPatch as NextResponse<ApiResult<MeetingDetail>>;

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json(
        { data: null, error: '無効なIDフォーマットです' },
        { status: 400 }
      );
    }
    const body: unknown = await request.json();
    const parsed = updateMeetingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: `入力値が不正です: ${parsed.error.issues.map((e: { message: string }) => e.message).join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // approval_status が 'approved' に変更される場合は approved_at も設定
    // Prototype Pollution 防止: zodでバリデーション済みのプロパティのみ明示的に展開
    const { company_id, meeting_date, participants, is_internal, approval_status } = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (company_id !== undefined) updateData.company_id = company_id;
    if (meeting_date !== undefined) updateData.meeting_date = meeting_date;
    if (participants !== undefined) updateData.participants = participants;
    if (is_internal !== undefined) updateData.is_internal = is_internal;
    if (approval_status !== undefined) updateData.approval_status = approval_status;
    if (approval_status === 'approved') {
      updateData.approved_at = new Date().toISOString();
    }

    const { data: updated, error } = await supabase
      .from('meetings')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error || !updated) {
      console.error('商談の更新に失敗しました:', error?.message);
      return NextResponse.json(
        { data: null, error: '商談の更新に失敗しました' },
        { status: 500 }
      );
    }

    // 詳細を返す
    const detail: MeetingDetail = {
      ...updated,
      transcript: null,
      summary: null,
      company: null,
    };

    return NextResponse.json({ data: detail, error: null });
  } catch (err) {
    console.error('商談の更新中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '商談の更新中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
