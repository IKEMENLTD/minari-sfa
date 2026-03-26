-- =============================================================================
-- 002_enable_rls.sql
-- 全テーブルに RLS を有効化し、認証済みユーザーのみアクセス可能にする
-- anon key が漏洩しても、未認証ユーザーはデータにアクセスできない
-- =============================================================================

-- -------------------------------------------------------
-- RLS を有効化
-- -------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_company ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- ポリシー: 認証済みユーザーは全データを読み取り可能
-- （社内ツールのため、認証済み = アクセス許可）
-- -------------------------------------------------------

-- users: 自分のレコードのみ読み取り可能、admin は全件
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "users_insert_admin" ON users
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "users_update_admin" ON users
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- companies: 認証済みユーザーは読み取り可、admin/manager は更新可
CREATE POLICY "companies_select_authenticated" ON companies
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "companies_insert_admin_manager" ON companies
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'manager'))
  );

CREATE POLICY "companies_update_admin_manager" ON companies
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'manager'))
  );

-- sales_phases: 認証済みユーザーは読み取り可、admin のみ変更可
CREATE POLICY "sales_phases_select_authenticated" ON sales_phases
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "sales_phases_modify_admin" ON sales_phases
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- meetings: 認証済みユーザーは全操作可
CREATE POLICY "meetings_all_authenticated" ON meetings
  FOR ALL USING (auth.role() = 'authenticated');

-- transcripts: 認証済みユーザーは全操作可
CREATE POLICY "transcripts_all_authenticated" ON transcripts
  FOR ALL USING (auth.role() = 'authenticated');

-- summaries: 認証済みユーザーは全操作可
CREATE POLICY "summaries_all_authenticated" ON summaries
  FOR ALL USING (auth.role() = 'authenticated');

-- approvals: 認証済みユーザーは読み取り可、admin/manager は作成可
CREATE POLICY "approvals_select_authenticated" ON approvals
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "approvals_insert_admin_manager" ON approvals
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'manager'))
  );

-- google_docs: 認証済みユーザーは全操作可
CREATE POLICY "google_docs_all_authenticated" ON google_docs
  FOR ALL USING (auth.role() = 'authenticated');

-- deal_statuses: 認証済みユーザーは全操作可
CREATE POLICY "deal_statuses_all_authenticated" ON deal_statuses
  FOR ALL USING (auth.role() = 'authenticated');

-- person_company: 認証済みユーザーは全操作可
CREATE POLICY "person_company_all_authenticated" ON person_company
  FOR ALL USING (auth.role() = 'authenticated');

-- -------------------------------------------------------
-- service_role はRLSをバイパスする（デフォルト動作）
-- サーバーサイドAPI（server.ts）は service_role を使用するため影響なし
-- -------------------------------------------------------
