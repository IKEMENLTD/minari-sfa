import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, isAuthError } from '@/lib/auth';
import { parseParticipantName, namesMatch } from '@/lib/participant-parser';
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
  /** 完全一致かどうか（スペース無視） */
  exact: boolean;
}

interface ParticipantSuggestion {
  participant_name: string;
  matches: ContactMatch[];
}

/** マッチなしの参加者（新規コンタクト候補） */
interface UnmatchedParticipant {
  /** tldv参加者名（生データ） */
  participant_name: string;
  /** パース済み氏名 */
  parsed_name: string;
  /** パース済み会社名 */
  parsed_company: string | null;
}

interface SuggestResponse {
  suggestions: ParticipantSuggestion[];
  /** 既存コンタクトにマッチしなかった参加者（新規コンタクト候補） */
  unmatched: UnmatchedParticipant[];
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
        data: { suggestions: [], unmatched: [] },
        error: null,
      });
    }

    // 各参加者名でcontactsをilike検索
    const suggestions: ParticipantSuggestion[] = [];
    const unmatched: UnmatchedParticipant[] = [];

    for (const participantName of participants) {
      // 参加者名をパース（"名前/会社名" や "名前（会社名）" に対応）
      const parsed = parseParticipantName(participantName);

      if (!parsed.full_name) continue;

      const nameOnly = parsed.full_name;

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
          exact: namesMatch(c.full_name, nameOnly),
        }));

        suggestions.push({
          participant_name: participantName,
          matches,
        });
      } else {
        // マッチなし → 新規コンタクト候補として追加
        unmatched.push({
          participant_name: participantName,
          parsed_name: parsed.full_name,
          parsed_company: parsed.company_name,
        });
      }
    }

    return NextResponse.json({
      data: { suggestions, unmatched },
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
