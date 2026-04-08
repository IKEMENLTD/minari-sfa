import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, isAuthError } from '@/lib/auth';
import type {
  DealWithContact,
  MeetingRow,
  PhaseSummary,
  InquiryMonthlySummary,
  DealPhase,
  ApiResult,
} from '@/types';

// ---------------------------------------------------------------------------
// ダッシュボード応答型
// ---------------------------------------------------------------------------

interface StaleDealItem {
  id: string;
  title: string;
  phase: string;
  updated_at: string;
  contact: { full_name: string; company_name: string | null } | null;
}

interface DashboardData {
  reminders: DealWithContact[];
  phaseSummary: PhaseSummary[];
  recentMeetings: MeetingRow[];
  unhandledInquiries: number;
  inquiryMonthly: InquiryMonthlySummary[];
  staleDeals: StaleDealItem[];
}

// ---------------------------------------------------------------------------
// GET /api/dashboard - ダッシュボードデータ一括取得
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResult<DashboardData>>> {
  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<DashboardData>>;

  try {
    const supabase = createServerSupabaseClient();
    const today = new Date().toISOString().split('T')[0];

    // --- 1. リマインダー: next_action_dateが今日以前のdeals（最大20件） ---
    let reminderQuery = supabase
      .from('deals')
      .select('*, contact:contacts(*)')
      .lte('next_action_date', today)
      .not('next_action_date', 'is', null)
      .order('next_action_date', { ascending: true })
      .limit(20);

    // memberロールは自分の担当のみ
    if (auth.role === 'member') {
      reminderQuery = reminderQuery.eq('assigned_to', auth.userId);
    }

    const { data: reminderData, error: reminderError } = await reminderQuery;

    if (reminderError) {
      console.error('リマインダーの取得に失敗しました:', reminderError.message);
    }

    const reminders: DealWithContact[] = (reminderData ?? []).map((row) => {
      const contact = Array.isArray(row.contact) ? row.contact[0] : row.contact;
      return {
        id: row.id,
        contact_id: row.contact_id,
        title: row.title,
        phase: row.phase,
        probability: row.probability,
        next_action: row.next_action,
        next_action_date: row.next_action_date,
        assigned_to: row.assigned_to,
        note: row.note,
        deliverable: row.deliverable ?? null,
        industry: row.industry ?? null,
        deadline: row.deadline ?? null,
        revenue: row.revenue ?? null,
        target_country: row.target_country ?? null,
        tax_type: row.tax_type ?? null,
        has_movement: row.has_movement ?? false,
        status_detail: row.status_detail ?? null,
        billing_month: row.billing_month ?? null,
        client_contact_name: row.client_contact_name ?? null,
        revenue_note: row.revenue_note ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        contact: contact ?? null,
      };
    });

    // --- 1b. 放置案件: 14日以上updated_atが更新されていない & 稼働中でない ---
    const staleThreshold = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    let staleQuery = supabase
      .from('deals')
      .select('id, title, phase, updated_at, contact:contacts(full_name, company_name)')
      .neq('phase', 'active')
      .lt('updated_at', staleThreshold)
      .order('updated_at', { ascending: true })
      .limit(10);

    if (auth.role === 'member') {
      staleQuery = staleQuery.eq('assigned_to', auth.userId);
    }

    const { data: staleData, error: staleError } = await staleQuery;

    if (staleError) {
      console.error('放置案件の取得に失敗しました:', staleError.message);
    }

    const staleDeals: StaleDealItem[] = (staleData ?? []).map((row) => {
      const contact = Array.isArray(row.contact) ? row.contact[0] : row.contact;
      return {
        id: row.id,
        title: row.title,
        phase: row.phase,
        updated_at: row.updated_at,
        contact: contact ?? null,
      };
    });

    // --- 2. フェーズ別件数集計 ---
    const phases: DealPhase[] = ['proposal_planned', 'proposal_active', 'waiting', 'follow_up', 'active'];
    const phaseSummary: PhaseSummary[] = [];

    for (const phase of phases) {
      let phaseQuery = supabase
        .from('deals')
        .select('*', { count: 'exact', head: true })
        .eq('phase', phase);

      if (auth.role === 'member') {
        phaseQuery = phaseQuery.eq('assigned_to', auth.userId);
      }

      const { count, error: countError } = await phaseQuery;

      if (countError) {
        console.error(`フェーズ ${phase} のカウントに失敗しました:`, countError.message);
      }

      phaseSummary.push({ phase, count: count ?? 0 });
    }

    // --- 3. 直近5件の会議 ---
    const { data: meetingsData, error: meetingsError } = await supabase
      .from('meetings')
      .select('*')
      .order('meeting_date', { ascending: false })
      .limit(5);

    if (meetingsError) {
      console.error('直近会議の取得に失敗しました:', meetingsError.message);
    }

    const recentMeetings = (meetingsData ?? []) as MeetingRow[];

    // --- 4. 未対応問い合わせ件数 ---
    let inquiryCountQuery = supabase
      .from('inquiries')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'new');

    if (auth.role === 'member') {
      inquiryCountQuery = inquiryCountQuery.eq('assigned_to', auth.userId);
    }

    const { count: inquiryCount, error: inquiryCountError } = await inquiryCountQuery;

    if (inquiryCountError) {
      console.error('未対応問い合わせ件数の取得に失敗しました:', inquiryCountError.message);
    }

    // --- 5. 問い合わせ月別集計（当月・先月） ---
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

    const { data: monthlyInquiries, error: monthlyError } = await supabase
      .from('inquiries')
      .select('source, created_at')
      .gte('created_at', lastMonthStart);

    if (monthlyError) {
      console.error('月別問い合わせの取得に失敗しました:', monthlyError.message);
    }

    const thisMonthLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthLabel = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

    const monthlyCounts: Record<string, { website: number; phone: number; other: number }> = {
      [thisMonthLabel]: { website: 0, phone: 0, other: 0 },
      [lastMonthLabel]: { website: 0, phone: 0, other: 0 },
    };

    for (const inquiry of monthlyInquiries ?? []) {
      const createdAt = new Date(inquiry.created_at);
      const monthKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
      const source = inquiry.source as 'website' | 'phone' | 'other';

      if (monthlyCounts[monthKey] && (source === 'website' || source === 'phone' || source === 'other')) {
        monthlyCounts[monthKey][source] += 1;
      }
    }

    const inquiryMonthly: InquiryMonthlySummary[] = [lastMonthLabel, thisMonthLabel].map((month) => {
      const counts = monthlyCounts[month];
      return {
        month,
        website: counts.website,
        phone: counts.phone,
        other: counts.other,
        total: counts.website + counts.phone + counts.other,
      };
    });

    return NextResponse.json({
      data: {
        reminders,
        phaseSummary,
        recentMeetings,
        unhandledInquiries: inquiryCount ?? 0,
        inquiryMonthly,
        staleDeals,
      },
      error: null,
    });
  } catch (err) {
    console.error('ダッシュボードデータの取得中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: 'ダッシュボードデータの取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
