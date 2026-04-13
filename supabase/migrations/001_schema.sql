-- =============================================================================
-- 内藤さんシステム 統合スキーマ
-- 全テーブル・RLS・トリガー・インデックスを一括作成
-- =============================================================================

-- ============================================
-- 1. users
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 2. contacts（コンタクト管理）
-- ============================================
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  company_name TEXT,
  department TEXT,
  position TEXT,
  email TEXT,
  phone TEXT,
  tier INT NOT NULL DEFAULT 3 CHECK (tier BETWEEN 1 AND 4),
  assigned_to UUID NOT NULL REFERENCES users(id),
  note TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('eight', 'manual', 'tldv')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_email_unique
  ON contacts(email) WHERE email IS NOT NULL;

-- ============================================
-- 3. deals（案件管理）
-- ============================================
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('proposal_planned', 'proposal_active', 'waiting', 'follow_up', 'active')),
  probability TEXT CHECK (probability IN ('high', 'medium', 'low', 'very_low', 'unknown')),
  next_action TEXT,
  next_action_date DATE,
  assigned_to UUID NOT NULL REFERENCES users(id),
  note TEXT,
  deliverable TEXT,
  industry TEXT,
  deadline DATE,
  revenue INTEGER,
  target_country TEXT DEFAULT '日本',
  tax_type TEXT CHECK (tax_type IN ('included', 'excluded')),
  has_movement BOOLEAN NOT NULL DEFAULT false,
  status_detail TEXT,
  billing_month TEXT,
  client_contact_name TEXT,
  revenue_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 4. meetings（会議記録）
-- ============================================
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  meeting_date TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('tldv', 'teams_copilot', 'manual')),
  source_id TEXT,
  participants TEXT[] NOT NULL DEFAULT '{}',
  tool TEXT CHECK (tool IN ('teams', 'zoom', 'meet', 'in_person', 'phone')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_source_source_id
  ON meetings(source, source_id) WHERE source_id IS NOT NULL;

-- ============================================
-- 5. transcripts（文字起こし）
-- ============================================
CREATE TABLE IF NOT EXISTS transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  full_text TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('tldv', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 6. summaries（AI要約）
-- ============================================
CREATE TABLE IF NOT EXISTS summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL,
  model_used TEXT NOT NULL,
  suggested_next_action TEXT,
  suggested_next_action_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 7. inquiries（問い合わせ管理）
-- ============================================
CREATE TABLE IF NOT EXISTS inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('website', 'phone', 'other')),
  contact_name TEXT NOT NULL,
  company_name TEXT,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'completed')),
  assigned_to UUID REFERENCES users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 8. RLS ポリシー
-- ============================================
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;

-- contacts
DROP POLICY IF EXISTS contacts_select ON contacts;
CREATE POLICY contacts_select ON contacts FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
    OR assigned_to = auth.uid()
  );
DROP POLICY IF EXISTS contacts_insert ON contacts;
CREATE POLICY contacts_insert ON contacts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
    OR assigned_to = auth.uid()
  );
DROP POLICY IF EXISTS contacts_update ON contacts;
CREATE POLICY contacts_update ON contacts FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
    OR assigned_to = auth.uid()
  );
DROP POLICY IF EXISTS contacts_delete ON contacts;
CREATE POLICY contacts_delete ON contacts FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- deals
DROP POLICY IF EXISTS deals_select ON deals;
CREATE POLICY deals_select ON deals FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
    OR assigned_to = auth.uid()
  );
DROP POLICY IF EXISTS deals_insert ON deals;
CREATE POLICY deals_insert ON deals FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
    OR assigned_to = auth.uid()
  );
DROP POLICY IF EXISTS deals_update ON deals;
CREATE POLICY deals_update ON deals FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
    OR assigned_to = auth.uid()
  );
DROP POLICY IF EXISTS deals_delete ON deals;
CREATE POLICY deals_delete ON deals FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- inquiries
DROP POLICY IF EXISTS inquiries_select ON inquiries;
CREATE POLICY inquiries_select ON inquiries FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
    OR assigned_to = auth.uid()
  );
DROP POLICY IF EXISTS inquiries_insert ON inquiries;
CREATE POLICY inquiries_insert ON inquiries FOR INSERT TO authenticated
  WITH CHECK (true);
DROP POLICY IF EXISTS inquiries_update ON inquiries;
CREATE POLICY inquiries_update ON inquiries FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
    OR assigned_to = auth.uid()
  );
DROP POLICY IF EXISTS inquiries_delete ON inquiries;
CREATE POLICY inquiries_delete ON inquiries FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- ============================================
-- 9. updated_at 自動更新トリガー
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_contacts_updated_at ON contacts;
CREATE TRIGGER trigger_contacts_updated_at
  BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_deals_updated_at ON deals;
CREATE TRIGGER trigger_deals_updated_at
  BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_inquiries_updated_at ON inquiries;
CREATE TRIGGER trigger_inquiries_updated_at
  BEFORE UPDATE ON inquiries FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_meetings_updated_at ON meetings;
CREATE TRIGGER trigger_meetings_updated_at
  BEFORE UPDATE ON meetings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 10. インデックス
-- ============================================
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to ON contacts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_contacts_tier ON contacts(tier);
CREATE INDEX IF NOT EXISTS idx_contacts_company_name ON contacts(company_name);
CREATE INDEX IF NOT EXISTS idx_contacts_full_name ON contacts(full_name);
CREATE INDEX IF NOT EXISTS idx_contacts_updated_at ON contacts(updated_at);

CREATE INDEX IF NOT EXISTS idx_deals_contact_id ON deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_phase ON deals(phase);
CREATE INDEX IF NOT EXISTS idx_deals_next_action_date ON deals(next_action_date);
CREATE INDEX IF NOT EXISTS idx_deals_assigned_to ON deals(assigned_to);
CREATE INDEX IF NOT EXISTS idx_deals_probability ON deals(probability);
CREATE INDEX IF NOT EXISTS idx_deals_updated_at ON deals(updated_at);

CREATE INDEX IF NOT EXISTS idx_meetings_contact_id ON meetings(contact_id);
CREATE INDEX IF NOT EXISTS idx_meetings_deal_id ON meetings(deal_id);
CREATE INDEX IF NOT EXISTS idx_meetings_meeting_date ON meetings(meeting_date);

CREATE INDEX IF NOT EXISTS idx_transcripts_meeting_id ON transcripts(meeting_id);
CREATE INDEX IF NOT EXISTS idx_summaries_meeting_id ON summaries(meeting_id);

CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_contact_id ON inquiries(contact_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_source ON inquiries(source);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON inquiries(created_at);
