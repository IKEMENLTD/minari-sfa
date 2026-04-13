import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, isAuthError } from '@/lib/auth';
import type { ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// 検索結果の型定義
// ---------------------------------------------------------------------------

interface SearchContactItem {
  id: string;
  full_name: string;
  company_name: string | null;
  tier: 1 | 2 | 3 | 4;
}

interface SearchDealItem {
  id: string;
  title: string;
  phase: string;
  contact_name: string | null;
}

interface SearchMeetingItem {
  id: string;
  meeting_date: string;
  source: string;
  contact_name: string | null;
}

interface SearchInquiryItem {
  id: string;
  contact_name: string;
  content: string;
  source: string;
  status: string;
}

interface SearchResult {
  contacts: SearchContactItem[];
  deals: SearchDealItem[];
  meetings: SearchMeetingItem[];
  inquiries: SearchInquiryItem[];
}

// ---------------------------------------------------------------------------
// ilike 特殊文字エスケープ（フィルタインジェクション対策）
// ---------------------------------------------------------------------------

function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&').replace(/[,.()]/g, '');
}

// ---------------------------------------------------------------------------
// GET /api/search?q=田中 - グローバル検索
// ---------------------------------------------------------------------------

const SEARCH_LIMIT = 5;

export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResult<SearchResult>>> {
  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<SearchResult>>;

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim() ?? '';

    // 空文字の場合は空結果を返す
    if (q.length === 0) {
      return NextResponse.json({
        data: { contacts: [], deals: [], meetings: [], inquiries: [] },
        error: null,
      });
    }

    // 検索文字列のサニタイズ
    const sanitized = escapeIlike(q);
    const supabase = createServerSupabaseClient();

    // --- コンタクト検索 ---
    let contactQuery = supabase
      .from('contacts')
      .select('id, full_name, company_name, tier')
      .or(`full_name.ilike.%${sanitized}%,company_name.ilike.%${sanitized}%`)
      .order('updated_at', { ascending: false })
      .limit(SEARCH_LIMIT);

    // memberロールは自分の担当のみ閲覧可能
    if (auth.role === 'member') {
      contactQuery = contactQuery.eq('assigned_to', auth.userId);
    }

    // --- 案件検索 ---
    let dealQuery = supabase
      .from('deals')
      .select('id, title, phase, client_contact_name')
      .or(`title.ilike.%${sanitized}%,deliverable.ilike.%${sanitized}%,client_contact_name.ilike.%${sanitized}%`)
      .order('updated_at', { ascending: false })
      .limit(SEARCH_LIMIT);

    if (auth.role === 'member') {
      dealQuery = dealQuery.eq('assigned_to', auth.userId);
    }

    // --- 会議検索（contact名で検索） ---
    // NOTE: meetingsにはassigned_toがないため、memberロールも全件閲覧可能（既存API踏襲）
    // participants配列の部分一致検索はPostgreSQLのcontainsでは困難なため、
    // contact名での検索に切り替え、participants::textでのテキスト検索も併用
    const meetingQuery = supabase
      .from('meetings')
      .select('id, meeting_date, source, contact_id')
      .or(`participants::text.ilike.%${sanitized}%,source.ilike.%${sanitized}%`)
      .order('meeting_date', { ascending: false })
      .limit(SEARCH_LIMIT);

    // --- 問い合わせ検索 ---
    let inquiryQuery = supabase
      .from('inquiries')
      .select('id, contact_name, content, source, status')
      .or(`content.ilike.%${sanitized}%,contact_name.ilike.%${sanitized}%`)
      .order('created_at', { ascending: false })
      .limit(SEARCH_LIMIT);

    if (auth.role === 'member') {
      inquiryQuery = inquiryQuery.eq('assigned_to', auth.userId);
    }

    // 並行実行
    const [contactResult, dealResult, meetingResult, inquiryResult] = await Promise.all([
      contactQuery,
      dealQuery,
      meetingQuery,
      inquiryQuery,
    ]);

    if (contactResult.error) {
      console.error('コンタクト検索に失敗しました:', contactResult.error.message);
    }
    if (dealResult.error) {
      console.error('案件検索に失敗しました:', dealResult.error.message);
    }
    if (meetingResult.error) {
      console.error('会議検索に失敗しました:', meetingResult.error.message);
    }
    if (inquiryResult.error) {
      console.error('問い合わせ検索に失敗しました:', inquiryResult.error.message);
    }

    // コンタクト結果のマッピング
    const contacts: SearchContactItem[] = (contactResult.data ?? []).map((row) => ({
      id: row.id as string,
      full_name: row.full_name as string,
      company_name: (row.company_name as string | null) ?? null,
      tier: row.tier as 1 | 2 | 3 | 4,
    }));

    // 案件結果のマッピング
    const deals: SearchDealItem[] = (dealResult.data ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      phase: row.phase as string,
      contact_name: (row.client_contact_name as string | null) ?? null,
    }));

    // 会議結果のマッピング（contact_idからcontact名を取得）
    const meetingRows = meetingResult.data ?? [];
    const contactIds = meetingRows
      .map((row) => row.contact_id as string | null)
      .filter((id): id is string => id !== null);

    let contactNameMap: Record<string, string> = {};
    if (contactIds.length > 0) {
      const { data: contactNames } = await supabase
        .from('contacts')
        .select('id, full_name')
        .in('id', contactIds);
      if (contactNames) {
        contactNameMap = Object.fromEntries(
          contactNames.map((c) => [c.id as string, c.full_name as string])
        );
      }
    }

    const meetings: SearchMeetingItem[] = meetingRows.map((row) => ({
      id: row.id as string,
      meeting_date: row.meeting_date as string,
      source: row.source as string,
      contact_name: (row.contact_id && contactNameMap[row.contact_id as string]) ?? null,
    }));

    // 問い合わせ結果のマッピング
    const inquiries: SearchInquiryItem[] = (inquiryResult.data ?? []).map((row) => ({
      id: row.id as string,
      contact_name: row.contact_name as string,
      content: row.content as string,
      source: row.source as string,
      status: row.status as string,
    }));

    return NextResponse.json({
      data: { contacts, deals, meetings, inquiries },
      error: null,
    });
  } catch (err) {
    console.error('検索中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '検索中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
