import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, isAuthError } from '@/lib/auth';
import type { ApiResult, ContactRow } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// レスポンス型
// ---------------------------------------------------------------------------

interface ContactMatch {
  id: string;
  full_name: string;
  company_name: string | null;
}

interface ParticipantSuggestion {
  participant_name: string;
  matches: ContactMatch[];
}

interface SuggestResponse {
  suggestions: ParticipantSuggestion[];
}

// ---------------------------------------------------------------------------
// GET /api/meetings/[id]/suggest - コンタクト自動マッチング候補
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<SuggestResponse>>> {
  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<SuggestResponse>>;

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json(
        { data: null, error: '無効なIDフォーマットです' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // 会議のparticipants配列を取得
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('participants')
      .eq('id', id)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json(
        { data: null, error: '指定された会議が見つかりません' },
        { status: 404 }
      );
    }

    const participants = (meeting.participants as string[]) ?? [];
    if (participants.length === 0) {
      return NextResponse.json({
        data: { suggestions: [] },
        error: null,
      });
    }

    // 各参加者名でcontactsをilike検索
    const suggestions: ParticipantSuggestion[] = [];

    for (const participantName of participants) {
      // 参加者名から「名前（所属）」形式の名前部分を抽出
      const nameOnly = participantName.includes('（')
        ? participantName.split('（')[0].trim()
        : participantName.includes('(')
          ? participantName.split('(')[0].trim()
          : participantName.trim();

      if (!nameOnly) continue;

      const { data: matchedContacts } = await supabase
        .from('contacts')
        .select('id, full_name, company_name')
        .ilike('full_name', `%${nameOnly}%`)
        .limit(5);

      if (matchedContacts && matchedContacts.length > 0) {
        const matches: ContactMatch[] = matchedContacts.map((c: Pick<ContactRow, 'id' | 'full_name' | 'company_name'>) => ({
          id: c.id,
          full_name: c.full_name,
          company_name: c.company_name,
        }));

        suggestions.push({
          participant_name: participantName,
          matches,
        });
      }
    }

    return NextResponse.json({
      data: { suggestions },
      error: null,
    });
  } catch (err) {
    console.error('コンタクト候補の取得中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: 'コンタクト候補の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
