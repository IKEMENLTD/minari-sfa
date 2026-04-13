import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, validateContentType, isAuthError } from '@/lib/auth';
import { parseParticipantName, namesMatch } from '@/lib/participant-parser';
import { stripHtml } from '@/lib/sanitize';
import type { ApiResult, ContactRow } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

const createContactsSchema = z.object({
  /** 参加者名の配列（tldv形式の生データ） */
  participant_names: z
    .array(z.string().min(1).max(200).transform(stripHtml))
    .min(1, '参加者名を1つ以上指定してください')
    .max(50),
  /** 最初に作成したコンタクトを会議に自動紐付けするか */
  auto_link_first: z.boolean().optional().default(false),
}).strict();

// ---------------------------------------------------------------------------
// レスポンス型
// ---------------------------------------------------------------------------

interface CreateContactsResult {
  /** 新規作成されたコンタクト */
  created: ContactRow[];
  /** 既に存在していたため作成をスキップしたコンタクト */
  skipped: Array<{ participant_name: string; existing_contact_id: string; existing_contact_name: string }>;
  /** 会議に自動紐付けしたcontact_id（auto_link_first=trueの場合） */
  linked_contact_id: string | null;
  /** エラーがあった参加者 */
  errors: string[];
}

// ---------------------------------------------------------------------------
// POST /api/meetings/[id]/create-contacts
// 参加者名から一括でコンタクトを作成する
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<CreateContactsResult>>> {
  const contentTypeError = validateContentType(request);
  if (contentTypeError) return contentTypeError as NextResponse<ApiResult<CreateContactsResult>>;

  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<CreateContactsResult>>;

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json(
        { data: null, error: '無効なIDフォーマットです' },
        { status: 400 }
      );
    }

    const body: unknown = await request.json();
    const parsed = createContactsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: `入力値が不正です: ${parsed.error.issues.map((e) => e.message).join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // 会議の存在確認
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('id, contact_id')
      .eq('id', id)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json(
        { data: null, error: '指定された会議が見つかりません' },
        { status: 404 }
      );
    }

    const created: ContactRow[] = [];
    const skipped: CreateContactsResult['skipped'] = [];
    const errors: string[] = [];

    for (const participantName of parsed.data.participant_names) {
      try {
        // 参加者名をパース（名前/会社名を分離）
        const parsedName = parseParticipantName(participantName);

        if (!parsedName.full_name) {
          errors.push(`"${participantName}" の名前が空です`);
          continue;
        }

        // 既存コンタクトとの重複チェック
        const { data: existingContacts } = await supabase
          .from('contacts')
          .select('id, full_name, company_name')
          .ilike('full_name', `%${parsedName.full_name}%`)
          .limit(10);

        // 完全一致（スペース無視）でチェック
        const duplicate = existingContacts?.find((c) =>
          namesMatch(c.full_name, parsedName.full_name)
        );

        if (duplicate) {
          skipped.push({
            participant_name: participantName,
            existing_contact_id: duplicate.id,
            existing_contact_name: duplicate.full_name,
          });
          continue;
        }

        // 新規コンタクトを作成
        const insertData: Record<string, unknown> = {
          full_name: parsedName.full_name,
          source: 'tldv' as const,
          tier: 4, // 新規作成はTier 4（不明）から開始
        };

        if (parsedName.company_name) {
          insertData.company_name = parsedName.company_name;
        }

        const { data: newContact, error: insertError } = await supabase
          .from('contacts')
          .insert(insertData)
          .select('*')
          .single();

        if (insertError || !newContact) {
          errors.push(`"${participantName}" のコンタクト作成に失敗: ${insertError?.message ?? '不明なエラー'}`);
          continue;
        }

        created.push(newContact as ContactRow);
      } catch (err) {
        errors.push(
          `"${participantName}" の処理中にエラー: ${err instanceof Error ? err.message : '不明なエラー'}`
        );
      }
    }

    // auto_link_first: 最初に作成された（またはスキップされた）コンタクトを会議に紐付け
    let linkedContactId: string | null = null;
    if (parsed.data.auto_link_first && !meeting.contact_id) {
      const firstContactId = created[0]?.id ?? skipped[0]?.existing_contact_id ?? null;
      if (firstContactId) {
        const { error: linkError } = await supabase
          .from('meetings')
          .update({ contact_id: firstContactId })
          .eq('id', id);

        if (!linkError) {
          linkedContactId = firstContactId;
        }
      }
    }

    return NextResponse.json({
      data: {
        created,
        skipped,
        linked_contact_id: linkedContactId,
        errors,
      },
      error: null,
    }, { status: 201 });
  } catch (err) {
    console.error('コンタクト一括作成中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: 'コンタクト一括作成中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
