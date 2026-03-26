-- =============================================================================
-- 002_security_hardening.sql
-- セキュリティ強化: 重複承認防止 + RLS有効化
-- =============================================================================

-- 承認テーブルに meeting_id のユニーク制約を追加（重複承認防止）
ALTER TABLE approvals ADD CONSTRAINT unique_approval_per_meeting UNIQUE (meeting_id);

-- =============================================================================
-- Row Level Security (RLS) を有効化
-- 本番環境ではサービスロールキーではなくユーザー認証トークンを使用し、
-- RLS でアクセス制御を行うことを推奨
-- =============================================================================

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_company ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_phases ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーに対する読み取りポリシー（全テーブル共通）
CREATE POLICY "authenticated_read" ON meetings FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON transcripts FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON summaries FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON approvals FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON deal_statuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON google_docs FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON person_company FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON sales_phases FOR SELECT TO authenticated USING (true);

-- 認証済みユーザーに対する書き込みポリシー（必要なテーブルのみ）
CREATE POLICY "authenticated_insert" ON meetings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update" ON meetings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "authenticated_insert" ON transcripts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_insert" ON summaries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_insert" ON approvals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update" ON deal_statuses FOR UPDATE TO authenticated USING (true);
