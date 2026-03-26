// =============================================================================
// 全型定義 - Supabase テーブル Row型 + API Request/Response型
// =============================================================================

// ---------------------------------------------------------------------------
// Supabase Row Types
// ---------------------------------------------------------------------------

/** companies テーブル */
export interface CompanyRow {
  id: string;
  name: string;
  tier: string | null;
  expected_revenue: number | null;
  sku_count: number | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

/** meetings テーブル */
export interface MeetingRow {
  id: string;
  company_id: string | null;
  meeting_date: string;
  participants: string[];
  source: 'jamroll' | 'proud';
  source_id: string | null;
  is_internal: boolean;
  ai_estimated_company: string | null;
  approval_status: 'pending' | 'approved' | 'rejected';
  approved_at: string | null;
  created_at: string;
}

/** transcripts テーブル */
export interface TranscriptRow {
  id: string;
  meeting_id: string;
  full_text: string;
  source: 'jamroll' | 'proud';
  created_at: string;
}

/** summaries テーブル */
export interface SummaryRow {
  id: string;
  meeting_id: string;
  summary_text: string;
  model_used: string;
  created_at: string;
}

/** approvals テーブル */
export interface ApprovalRow {
  id: string;
  meeting_id: string;
  ai_estimated_company: string;
  is_correct: boolean;
  corrected_company: string | null;
  correction_note: string | null;
  approved_by: string | null;
  created_at: string;
}

/** google_docs テーブル */
export interface GoogleDocRow {
  id: string;
  company_id: string;
  doc_url: string;
  doc_id: string;
  folder: string;
  last_updated_at: string;
  created_at: string;
}

/** sales_phases テーブル */
export interface SalesPhaseRow {
  id: string;
  phase_name: string;
  phase_order: number;
  description: string | null;
  created_at: string;
}

/** deal_statuses テーブル */
export interface DealStatusRow {
  id: string;
  company_id: string;
  current_phase_id: string;
  next_action: string | null;
  status_summary: string | null;
  last_meeting_date: string | null;
  updated_at: string;
  created_at: string;
}

/** users テーブル */
export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'member';
  created_at: string;
}

/** person_company テーブル */
export interface PersonCompanyRow {
  id: string;
  person_name: string;
  company_id: string;
  confidence: number | null;
  source: 'manual' | 'auto' | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// API Request Types
// ---------------------------------------------------------------------------

/** POST /api/meetings */
export interface CreateMeetingRequest {
  company_id?: string | null;
  meeting_date: string;
  participants: string[];
  source: 'jamroll' | 'proud';
  source_id?: string | null;
  is_internal: boolean;
  ai_estimated_company?: string | null;
  transcript_text?: string;
}

/** PATCH /api/meetings/[id] */
export interface UpdateMeetingRequest {
  company_id?: string | null;
  meeting_date?: string;
  participants?: string[];
  is_internal?: boolean;
  approval_status?: 'pending' | 'approved' | 'rejected';
}

/** POST /api/approval */
export interface ApprovalRequest {
  meetingId: string;
  isCorrect: boolean;
  correctedCompany?: string;
  correctionNote?: string;
}

/** PATCH /api/deals/[id] */
export interface UpdateDealStatusRequest {
  current_phase_id?: string;
  next_action?: string;
  status_summary?: string;
  last_meeting_date?: string;
}

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  data: T;
  error: null;
}

export interface ApiErrorResponse {
  data: null;
  error: string;
}

export type ApiResult<T> = ApiResponse<T> | ApiErrorResponse;

// ---------------------------------------------------------------------------
// JOIN / ビュー型
// ---------------------------------------------------------------------------

/** 商談詳細（transcript + summary 含む） */
export interface MeetingDetail extends MeetingRow {
  transcript: TranscriptRow | null;
  summary: SummaryRow | null;
  company: CompanyRow | null;
}

/** 案件一覧用（company + deal_status + phase JOIN） */
export interface DealWithDetails {
  deal_status: DealStatusRow;
  company: CompanyRow;
  phase: SalesPhaseRow;
}

// ---------------------------------------------------------------------------
// 外部API連携型
// ---------------------------------------------------------------------------

/** Jamroll から取得する議事録 */
export interface JamrollTranscript {
  id: string;
  title: string;
  date: string;
  participants: string[];
  transcript: string;
}

/** PROUD Note ファイル */
export interface ProudNoteFile {
  id: string;
  title: string;
  date: string;
  content: string;
}

/** Claude API 要約結果 */
export interface MeetingSummaryResult {
  summary: string;
  estimatedCompany: string;
  participants: string[];
  isInternal: boolean;
}

/** Claude API フェーズ判定結果 */
export interface SalesPhaseJudgment {
  phaseId: string;
  nextAction: string;
  statusSummary: string;
}
