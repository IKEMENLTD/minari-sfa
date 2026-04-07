import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, validateContentType, isAuthError } from '@/lib/auth';
import type { MeetingDetail, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

const updateMeetingSchema = z.object({
  contact_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  meeting_date: z.string().optional(),
  participants: z.array(z.string().max(200)).max(50).optional(),
  tool: z.enum(['teams', 'zoom', 'meet', 'in_person', 'phone']).nullable().optional(),
}).strict();

// ---------------------------------------------------------------------------
// GET /api/meetings/[id] - 会議詳細
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<MeetingDetail>>> {
  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<MeetingDetail>>;

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json(
        { data: null, error: '無効なIDフォーマットです' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // 会議本体を取得
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', id)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json(
        { data: null, error: '指定された会議が見つかりません' },
        { status: 404 }
      );
    }

    // transcript を取得
    const { data: transcripts } = await supabase
      .from('transcripts')
      .select('id, meeting_id, full_text, source, created_at')
      .eq('meeting_id', id)
      .order('created_at', { ascending: false })
      .limit(1);

    // summary を取得
    const { data: summaries } = await supabase
      .from('summaries')
      .select('id, meeting_id, summary_text, model_used, created_at')
      .eq('meeting_id', id)
      .order('created_at', { ascending: false })
      .limit(1);

    // contact を取得
    let contact = null;
    if (meeting.contact_id) {
      const { data: contactData } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', meeting.contact_id)
        .single();
      contact = contactData;
    }

    const detail: MeetingDetail = {
      id: meeting.id,
      contact_id: meeting.contact_id,
      deal_id: meeting.deal_id,
      meeting_date: meeting.meeting_date,
      source: meeting.source,
      source_id: meeting.source_id,
      participants: meeting.participants,
      tool: meeting.tool,
      created_at: meeting.created_at,
      updated_at: meeting.updated_at ?? meeting.created_at,
      transcript: transcripts?.[0] ?? null,
      summary: summaries?.[0] ?? null,
      contact: contact ?? null,
    };

    return NextResponse.json({ data: detail, error: null });
  } catch (err) {
    console.error('会議詳細の取得中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '会議詳細の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/meetings/[id] - 会議更新
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<MeetingDetail>>> {
  const contentTypeError = validateContentType(request);
  if (contentTypeError) return contentTypeError as NextResponse<ApiResult<MeetingDetail>>;

  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<MeetingDetail>>;

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
        { data: null, error: `入力値が不正です: ${parsed.error.issues.map((e) => e.message).join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { contact_id, deal_id, meeting_date, participants, tool } = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (contact_id !== undefined) updateData.contact_id = contact_id;
    if (deal_id !== undefined) updateData.deal_id = deal_id;
    if (meeting_date !== undefined) updateData.meeting_date = meeting_date;
    if (participants !== undefined) updateData.participants = participants;
    if (tool !== undefined) updateData.tool = tool;

    const { data: updated, error } = await supabase
      .from('meetings')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !updated) {
      console.error('会議の更新に失敗しました:', error?.message);
      return NextResponse.json(
        { data: null, error: '会議の更新に失敗しました' },
        { status: 500 }
      );
    }

    // GETと同様にtranscript/summary/contactを取得して返す
    const { data: transcripts } = await supabase
      .from('transcripts')
      .select('id, meeting_id, full_text, source, created_at')
      .eq('meeting_id', id)
      .order('created_at', { ascending: false })
      .limit(1);

    const { data: summaries } = await supabase
      .from('summaries')
      .select('id, meeting_id, summary_text, model_used, created_at')
      .eq('meeting_id', id)
      .order('created_at', { ascending: false })
      .limit(1);

    let patchContact = null;
    if (updated.contact_id) {
      const { data: contactData } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', updated.contact_id)
        .single();
      patchContact = contactData;
    }

    const detail: MeetingDetail = {
      id: updated.id,
      contact_id: updated.contact_id,
      deal_id: updated.deal_id,
      meeting_date: updated.meeting_date,
      source: updated.source,
      source_id: updated.source_id,
      participants: updated.participants,
      tool: updated.tool,
      created_at: updated.created_at,
      updated_at: updated.updated_at ?? updated.created_at,
      transcript: transcripts?.[0] ?? null,
      summary: summaries?.[0] ?? null,
      contact: patchContact ?? null,
    };

    return NextResponse.json({ data: detail, error: null });
  } catch (err) {
    console.error('会議の更新中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '会議の更新中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
