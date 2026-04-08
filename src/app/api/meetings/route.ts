import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, validateContentType, isAuthError } from '@/lib/auth';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';
import { stripHtml } from '@/lib/sanitize';
import type { MeetingRow, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション（B3: HTMLタグ除去によるXSS防止）
// ---------------------------------------------------------------------------

const createMeetingSchema = z.object({
  contact_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  meeting_date: z.string().min(1, '会議日は必須です'),
  source: z.enum(['tldv', 'teams_copilot', 'manual']),
  source_id: z.string().max(500).nullable().optional(),
  participants: z.array(z.string().max(200).transform(stripHtml)).max(50).optional(),
  tool: z.enum(['teams', 'zoom', 'meet', 'in_person', 'phone']).nullable().optional(),
  transcript_text: z.string().max(500_000).transform(stripHtml).optional(),
}).strict();

// ---------------------------------------------------------------------------
// GET /api/meetings - 会議一覧
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResult<MeetingRow[]>>> {
  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<MeetingRow[]>>;

  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);

    const contactId = searchParams.get('contact_id');
    const unlinked = searchParams.get('unlinked');
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
    const offset = (page - 1) * limit;

    let query = supabase
      .from('meetings')
      .select('*')
      .order('meeting_date', { ascending: false });

    if (contactId) {
      if (!z.string().uuid().safeParse(contactId).success) {
        return NextResponse.json(
          { data: null, error: '無効な contact_id フォーマットです' },
          { status: 400 }
        );
      }
      query = query.eq('contact_id', contactId);
    }

    if (unlinked === 'true') {
      query = query.is('contact_id', null);
    }

    // NOTE: meetingsにはassigned_toカラムがないため、memberロールも全件閲覧可能とする

    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      console.error('会議一覧の取得に失敗しました:', error.message);
      return NextResponse.json(
        { data: null, error: '会議一覧の取得に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: (data ?? []) as MeetingRow[], error: null });
  } catch (err) {
    console.error('会議一覧の取得中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '会議一覧の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/meetings - 会議新規作成
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResult<MeetingRow>>> {
  const contentTypeError = validateContentType(request);
  if (contentTypeError) return contentTypeError as NextResponse<ApiResult<MeetingRow>>;

  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<MeetingRow>>;

  try {
    const body: unknown = await request.json();
    const parsed = createMeetingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: `入力値が不正です: ${parsed.error.issues.map((e) => e.message).join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const { transcript_text, ...meetingFields } = parsed.data;

    const insertData: Record<string, unknown> = {
      meeting_date: meetingFields.meeting_date,
      source: meetingFields.source,
      participants: meetingFields.participants ?? [],
    };
    if (meetingFields.contact_id !== undefined) insertData.contact_id = meetingFields.contact_id;
    if (meetingFields.deal_id !== undefined) insertData.deal_id = meetingFields.deal_id;
    if (meetingFields.source_id !== undefined) insertData.source_id = meetingFields.source_id;
    if (meetingFields.tool !== undefined) insertData.tool = meetingFields.tool;

    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .insert(insertData)
      .select('*')
      .single();

    if (meetingError || !meeting) {
      console.error('会議の作成に失敗しました:', meetingError?.message);
      return NextResponse.json(
        { data: null, error: '会議の作成に失敗しました' },
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
          source: parsed.data.source === 'tldv' ? 'tldv' : 'manual',
        });

      if (transcriptError) {
        console.warn('議事録の保存に失敗しました（会議自体は作成済み）:', transcriptError.message);
        return NextResponse.json(
          { data: meeting as MeetingRow, error: null, warning: '会議は作成されましたが、議事録の保存に失敗しました' },
          { status: 201 }
        );
      }
    }

    return NextResponse.json(
      { data: meeting as MeetingRow, error: null },
      { status: 201 }
    );
  } catch (err) {
    console.error('会議の作成中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '会議の作成中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
