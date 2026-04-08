import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, validateContentType, isAuthError, requireRole } from '@/lib/auth';
import { stripHtml } from '@/lib/sanitize';
import type { ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const MAX_ROWS = 1000;

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface ImportRowError {
  row: number;
  error: string;
}

interface ImportResultData {
  imported: number;
  errors: ImportRowError[];
}

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

const importRequestSchema = z.object({
  type: z.enum(['contacts', 'deals'], { message: 'typeはcontactsまたはdealsを指定してください' }),
  rows: z.array(z.record(z.string(), z.string())).min(1, 'データが空です').max(MAX_ROWS, `最大${MAX_ROWS}行までインポートできます`),
});

// ---------------------------------------------------------------------------
// ヘルパー: 文字列をサニタイズして空文字はnullにする
// ---------------------------------------------------------------------------

function sanitizeField(value: string | undefined): string | null {
  if (value === undefined || value.trim() === '') return null;
  return stripHtml(value.trim());
}

function requireField(value: string | undefined, fieldName: string): string {
  const sanitized = sanitizeField(value);
  if (!sanitized) throw new Error(`${fieldName}は必須です`);
  return sanitized;
}

// ---------------------------------------------------------------------------
// コンタクトインポート
// ---------------------------------------------------------------------------

async function importContacts(
  rows: Record<string, string>[],
  userId: string,
): Promise<ImportResultData> {
  const supabase = createServerSupabaseClient();
  let imported = 0;
  const errors: ImportRowError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // ヘッダー行 + 0-indexed -> 1-indexed

    try {
      const fullName = requireField(row.full_name, '氏名');

      const tierRaw = sanitizeField(row.tier);
      let tier: 1 | 2 | 3 | 4 = 4;
      if (tierRaw) {
        const parsed = parseInt(tierRaw, 10);
        if (parsed >= 1 && parsed <= 4) {
          tier = parsed as 1 | 2 | 3 | 4;
        }
      }

      const insertData: Record<string, unknown> = {
        full_name: fullName,
        assigned_to: userId,
        source: 'manual' as const,
        tier,
      };

      const companyName = sanitizeField(row.company_name);
      if (companyName) insertData.company_name = companyName;

      const department = sanitizeField(row.department);
      if (department) insertData.department = department;

      const position = sanitizeField(row.position);
      if (position) insertData.position = position;

      const email = sanitizeField(row.email);
      if (email) insertData.email = email;

      const phone = sanitizeField(row.phone);
      if (phone) insertData.phone = phone;

      const { error } = await supabase
        .from('contacts')
        .insert(insertData)
        .select('id')
        .single();

      if (error) {
        errors.push({ row: rowNum, error: `DB登録エラー: ${error.message}` });
      } else {
        imported++;
      }
    } catch (e) {
      errors.push({ row: rowNum, error: e instanceof Error ? e.message : '不明なエラー' });
    }
  }

  return { imported, errors };
}

// ---------------------------------------------------------------------------
// 案件インポート
// ---------------------------------------------------------------------------

const VALID_PHASES = ['proposal_planned', 'proposal_active', 'waiting', 'follow_up', 'active'] as const;
const VALID_PROBABILITIES = ['high', 'medium', 'low', 'very_low', 'unknown'] as const;

async function importDeals(
  rows: Record<string, string>[],
  userId: string,
): Promise<ImportResultData> {
  const supabase = createServerSupabaseClient();
  let imported = 0;
  const errors: ImportRowError[] = [];

  // コンタクト名キャッシュ（同一名を何度も検索しないため）
  const contactCache = new Map<string, string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    try {
      const title = requireField(row.title, '案件名');
      const contactName = sanitizeField(row.contact_name);

      let contactId: string | null = null;

      if (contactName) {
        // キャッシュチェック
        const cached = contactCache.get(contactName);
        if (cached) {
          contactId = cached;
        } else {
          // 既存コンタクトを検索
          const { data: existingContacts } = await supabase
            .from('contacts')
            .select('id')
            .eq('full_name', contactName)
            .limit(1);

          if (existingContacts && existingContacts.length > 0) {
            contactId = existingContacts[0].id as string;
          } else {
            // コンタクトを自動作成
            const newContactData: Record<string, unknown> = {
              full_name: contactName,
              assigned_to: userId,
              source: 'manual',
              tier: 4,
            };
            const companyName = sanitizeField(row.company_name);
            if (companyName) newContactData.company_name = companyName;

            const { data: newContact, error: createErr } = await supabase
              .from('contacts')
              .insert(newContactData)
              .select('id')
              .single();

            if (createErr || !newContact) {
              errors.push({ row: rowNum, error: `コンタクト自動作成に失敗: ${createErr?.message ?? '不明'}` });
              continue;
            }
            contactId = newContact.id as string;
          }
          contactCache.set(contactName, contactId);
        }
      }

      if (!contactId) {
        errors.push({ row: rowNum, error: 'contact_nameが指定されていないか、コンタクトが見つかりません' });
        continue;
      }

      // フェーズ
      const phaseRaw = sanitizeField(row.phase);
      const phase = VALID_PHASES.includes(phaseRaw as typeof VALID_PHASES[number])
        ? (phaseRaw as typeof VALID_PHASES[number])
        : 'proposal_planned';

      const insertData: Record<string, unknown> = {
        contact_id: contactId,
        title,
        phase,
        assigned_to: userId,
      };

      // オプションフィールド
      const deliverable = sanitizeField(row.deliverable);
      if (deliverable) insertData.deliverable = deliverable;

      const industry = sanitizeField(row.industry);
      if (industry) insertData.industry = industry;

      const statusDetail = sanitizeField(row.status_detail);
      if (statusDetail) insertData.status_detail = statusDetail;

      const probabilityRaw = sanitizeField(row.probability);
      if (probabilityRaw && VALID_PROBABILITIES.includes(probabilityRaw as typeof VALID_PROBABILITIES[number])) {
        insertData.probability = probabilityRaw;
      }

      const deadline = sanitizeField(row.deadline);
      if (deadline) insertData.deadline = deadline;

      const revenueRaw = sanitizeField(row.revenue);
      if (revenueRaw) {
        const revenueNum = parseInt(revenueRaw.replace(/[,、]/g, ''), 10);
        if (!isNaN(revenueNum) && revenueNum >= 0) {
          insertData.revenue = revenueNum;
        }
      }

      const targetCountry = sanitizeField(row.target_country);
      if (targetCountry) insertData.target_country = targetCountry;

      const clientContactName = sanitizeField(row.client_contact_name);
      if (clientContactName) insertData.client_contact_name = clientContactName;

      const note = sanitizeField(row.note);
      if (note) insertData.note = note;

      const { error } = await supabase
        .from('deals')
        .insert(insertData)
        .select('id')
        .single();

      if (error) {
        errors.push({ row: rowNum, error: `DB登録エラー: ${error.message}` });
      } else {
        imported++;
      }
    } catch (e) {
      errors.push({ row: rowNum, error: e instanceof Error ? e.message : '不明なエラー' });
    }
  }

  return { imported, errors };
}

// ---------------------------------------------------------------------------
// POST /api/import
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiResult<ImportResultData>>> {
  const contentTypeError = validateContentType(request);
  if (contentTypeError) return contentTypeError as NextResponse<ApiResult<ImportResultData>>;

  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<ImportResultData>>;

  // admin/manager ロール必須
  const roleError = requireRole(auth, ['admin', 'manager']);
  if (roleError) return roleError as NextResponse<ApiResult<ImportResultData>>;

  try {
    const body: unknown = await request.json();
    const parsed = importRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: `入力値が不正です: ${parsed.error.issues.map((e) => e.message).join(', ')}` },
        { status: 400 },
      );
    }

    const { type, rows } = parsed.data;

    let result: ImportResultData;
    if (type === 'contacts') {
      result = await importContacts(rows, auth.userId);
    } else {
      result = await importDeals(rows, auth.userId);
    }

    return NextResponse.json({ data: result, error: null });
  } catch (err) {
    console.error('インポート処理中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: 'インポート処理中にエラーが発生しました' },
      { status: 500 },
    );
  }
}
