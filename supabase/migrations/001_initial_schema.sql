-- =============================================================================
-- 001_initial_schema.sql
-- 森井さんシステム 初期スキーマ
-- RLS は PoC フェーズでは無効（本番移行時に有効化すること）
-- =============================================================================

-- users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- companies
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tier TEXT,
  expected_revenue INTEGER,
  sku_count INTEGER,
  assigned_to TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- sales_phases
CREATE TABLE IF NOT EXISTS sales_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_name TEXT NOT NULL,
  phase_order INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- meetings
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  meeting_date DATE NOT NULL,
  participants TEXT[] NOT NULL DEFAULT '{}',
  source TEXT NOT NULL CHECK (source IN ('jamroll', 'proud')),
  source_id TEXT,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  ai_estimated_company TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- transcripts
CREATE TABLE IF NOT EXISTS transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  full_text TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('jamroll', 'proud')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- summaries
CREATE TABLE IF NOT EXISTS summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL,
  model_used TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- approvals
CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  ai_estimated_company TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  corrected_company TEXT,
  correction_note TEXT,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- google_docs
CREATE TABLE IF NOT EXISTS google_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  doc_url TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  folder TEXT NOT NULL,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- deal_statuses
CREATE TABLE IF NOT EXISTS deal_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  current_phase_id UUID NOT NULL REFERENCES sales_phases(id) ON DELETE RESTRICT,
  next_action TEXT,
  status_summary TEXT,
  last_meeting_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- person_company
CREATE TABLE IF NOT EXISTS person_company (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_name TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  confidence DOUBLE PRECISION,
  source TEXT CHECK (source IS NULL OR source IN ('manual', 'auto')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_meetings_company_id ON meetings(company_id);
CREATE INDEX IF NOT EXISTS idx_meetings_approval_status ON meetings(approval_status);
CREATE INDEX IF NOT EXISTS idx_meetings_meeting_date ON meetings(meeting_date);
CREATE INDEX IF NOT EXISTS idx_transcripts_meeting_id ON transcripts(meeting_id);
CREATE INDEX IF NOT EXISTS idx_summaries_meeting_id ON summaries(meeting_id);
CREATE INDEX IF NOT EXISTS idx_approvals_meeting_id ON approvals(meeting_id);
CREATE INDEX IF NOT EXISTS idx_deal_statuses_company_id ON deal_statuses(company_id);
CREATE INDEX IF NOT EXISTS idx_person_company_company_id ON person_company(company_id);
CREATE INDEX IF NOT EXISTS idx_person_company_person_name ON person_company(person_name);

-- =============================================================================
-- RLS (Row Level Security) ポリシー
-- 本番移行時に ALTER TABLE ... ENABLE ROW LEVEL SECURITY; を実行すること
-- =============================================================================

-- transcripts テーブル: 機密性の高い議事録全文を保護
-- 認証済みユーザーのみ読み取り可能
-- ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "authenticated_read_transcripts" ON transcripts FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "service_role_all_transcripts" ON transcripts FOR ALL TO service_role USING (true);

-- meetings テーブル
-- ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "authenticated_read_meetings" ON meetings FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "service_role_all_meetings" ON meetings FOR ALL TO service_role USING (true);

-- companies テーブル
-- ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "authenticated_read_companies" ON companies FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "service_role_all_companies" ON companies FOR ALL TO service_role USING (true);
