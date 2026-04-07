// =============================================================================
// 全型定義 - 内藤さんシステム（営業管理ツール）
// =============================================================================

// ---------------------------------------------------------------------------
// Supabase Row Types
// ---------------------------------------------------------------------------

/** users テーブル */
export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'member';
  created_at: string;
}

/** contacts テーブル */
export interface ContactRow {
  id: string;
  full_name: string;
  company_name: string | null;
  department: string | null;
  position: string | null;
  email: string | null;
  phone: string | null;
  tier: 1 | 2 | 3 | 4;
  assigned_to: string;
  note: string | null;
  source: 'eight' | 'manual' | 'tldv';
  created_at: string;
  updated_at: string;
}

/** deals テーブル */
export interface DealRow {
  id: string;
  contact_id: string;
  title: string;
  phase: DealPhase;
  probability: DealProbability | null;
  next_action: string | null;
  next_action_date: string | null;
  assigned_to: string;
  note: string | null;
  /** 制作物 / 制作物想定 */
  deliverable: string | null;
  /** 職種・内容 */
  industry: string | null;
  /** 納期 */
  deadline: string | null;
  /** 報酬（円） */
  revenue: number | null;
  /** 対象国 */
  target_country: string | null;
  /** 税込・税抜 */
  tax_type: DealTaxType | null;
  /** 動きあり / 動きそう */
  has_movement: boolean;
  /** 詳細ステータス（自由記述） */
  status_detail: string | null;
  /** 請求書受領月 / 給与反映月 */
  billing_month: string | null;
  /** クライアント窓口 */
  client_contact_name: string | null;
  /** 報酬メモ（金額不明の場合） */
  revenue_note: string | null;
  created_at: string;
  updated_at: string;
}

export type DealPhase = 'proposal_planned' | 'proposal_active' | 'waiting' | 'follow_up' | 'active';
export type DealProbability = 'high' | 'medium' | 'low' | 'very_low' | 'unknown';
export type DealTaxType = 'included' | 'excluded';

/** meetings テーブル */
export interface MeetingRow {
  id: string;
  contact_id: string | null;
  deal_id: string | null;
  meeting_date: string;
  source: 'tldv' | 'teams_copilot' | 'manual';
  source_id: string | null;
  participants: string[];
  tool: MeetingTool | null;
  created_at: string;
  updated_at: string;
}

export type MeetingTool = 'teams' | 'zoom' | 'meet' | 'in_person' | 'phone';

/** transcripts テーブル */
export interface TranscriptRow {
  id: string;
  meeting_id: string;
  full_text: string;
  source: 'tldv' | 'manual';
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

/** inquiries テーブル */
export interface InquiryRow {
  id: string;
  source: 'website' | 'phone' | 'other';
  contact_name: string;
  company_name: string | null;
  contact_id: string | null;
  content: string;
  status: InquiryStatus;
  assigned_to: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type InquiryStatus = 'new' | 'in_progress' | 'completed';

// ---------------------------------------------------------------------------
// API Request Types
// ---------------------------------------------------------------------------

/** POST /api/contacts */
export interface CreateContactRequest {
  full_name: string;
  company_name?: string | null;
  department?: string | null;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
  tier?: 1 | 2 | 3 | 4;
  assigned_to?: string;
  note?: string | null;
  source?: 'eight' | 'manual' | 'tldv';
}

/** PATCH /api/contacts/[id] */
export interface UpdateContactRequest {
  full_name?: string;
  company_name?: string | null;
  department?: string | null;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
  tier?: 1 | 2 | 3 | 4;
  assigned_to?: string;
  note?: string | null;
}

/** POST /api/deals (旧: POST /api/meetings) */
export interface CreateDealRequest {
  contact_id: string;
  title: string;
  phase: DealPhase;
  probability?: DealProbability | null;
  next_action?: string | null;
  next_action_date?: string | null;
  assigned_to?: string;
  note?: string | null;
  deliverable?: string | null;
  industry?: string | null;
  deadline?: string | null;
  revenue?: number | null;
  target_country?: string | null;
  tax_type?: DealTaxType | null;
  has_movement?: boolean;
  status_detail?: string | null;
  billing_month?: string | null;
  client_contact_name?: string | null;
  revenue_note?: string | null;
}

/** PATCH /api/deals/[id] */
export interface UpdateDealRequest {
  contact_id?: string;
  title?: string;
  phase?: DealPhase;
  probability?: DealProbability | null;
  next_action?: string | null;
  next_action_date?: string | null;
  assigned_to?: string;
  note?: string | null;
  deliverable?: string | null;
  industry?: string | null;
  deadline?: string | null;
  revenue?: number | null;
  target_country?: string | null;
  tax_type?: DealTaxType | null;
  has_movement?: boolean;
  status_detail?: string | null;
  billing_month?: string | null;
  client_contact_name?: string | null;
  revenue_note?: string | null;
}

/** POST /api/meetings */
export interface CreateMeetingRequest {
  contact_id?: string | null;
  deal_id?: string | null;
  meeting_date: string;
  source: 'tldv' | 'teams_copilot' | 'manual';
  source_id?: string | null;
  participants?: string[];
  tool?: MeetingTool | null;
  transcript_text?: string;
}

/** PATCH /api/meetings/[id] */
export interface UpdateMeetingRequest {
  contact_id?: string | null;
  deal_id?: string | null;
  meeting_date?: string;
  participants?: string[];
  tool?: MeetingTool | null;
}

/** POST /api/inquiries */
export interface CreateInquiryRequest {
  source: 'website' | 'phone' | 'other';
  contact_name: string;
  company_name?: string | null;
  contact_id?: string | null;
  content: string;
  assigned_to?: string | null;
  note?: string | null;
}

/** PATCH /api/inquiries/[id] */
export interface UpdateInquiryRequest {
  status?: InquiryStatus;
  contact_id?: string | null;
  assigned_to?: string | null;
  note?: string | null;
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

/** 会議詳細（transcript + summary + contact 含む） */
export interface MeetingDetail extends MeetingRow {
  transcript: TranscriptRow | null;
  summary: SummaryRow | null;
  contact: ContactRow | null;
}

/** 案件 + コンタクト情報 */
export interface DealWithContact extends DealRow {
  contact: ContactRow | null;
}

// ---------------------------------------------------------------------------
// 外部API連携型
// ---------------------------------------------------------------------------

/** TLDV API 会議データ */
export interface TldvMeeting {
  id: string;
  title: string;
  date: string;
  duration: number | null;
  participants: string[];
}

/** TLDV API 文字起こしデータ */
export interface TldvTranscript {
  meeting_id: string;
  text: string;
}

/** Claude API 要約結果 */
export interface MeetingSummaryResult {
  summary: string;
  estimatedContact: string;
  participants: string[];
}

// ---------------------------------------------------------------------------
// ダッシュボード用型
// ---------------------------------------------------------------------------

/** フェーズ別件数 */
export interface PhaseSummary {
  phase: DealPhase;
  count: number;
}

/** 問い合わせ月別集計 */
export interface InquiryMonthlySummary {
  month: string;
  website: number;
  phone: number;
  other: number;
  total: number;
}
