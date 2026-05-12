-- ---------------------------------------------------------------------------
-- 005: ユーザーseed + RLS厳格化(defense-in-depth)
--
-- 目的:
--   1) 内藤さん+メンバー2名のusers行を冪等にseed
--      → ID選択ログイン(token形式 {userId}.{sessionId}.{hmac})の前提
--   2) 旧migration 002の USING(true) を撤廃し DENY-ALL に置換
--      → service_role経由のAPI動作には影響なし(bypass)。
--        anon key が万一漏洩しても外部から読み書き不可とする保険。
--
-- 再実行性:
--   - INSERT は WHERE NOT EXISTS (email一致)で冪等。
--   - 既にseedされたusersをDELETE後にこのmigrationを再適用すると、再度INSERTされる。
--     これは「migration再実行=同じ状態への収束」という挙動として意図的。
--   - 本番では migration tracker(`supabase_migrations` 等)で重複適用を抑止すること。
--   - DROP POLICY IF EXISTS + CREATE POLICY は実質 idempotent (PG14+互換)。
-- ---------------------------------------------------------------------------

-- ============================================================================
-- 1. ユーザーseed (冪等)
-- ============================================================================
-- ⚠️⚠️⚠️ 本番デプロイ前チェックリスト ⚠️⚠️⚠️
--   1) このmigration適用後、必ず実際のメール/氏名にUPDATEで更新すること:
--        UPDATE users SET email='naito@ikemen.co.jp', name='内藤健司' WHERE email='naito@example.com';
--      (上書きにより冪等性は維持される — 再度このmigrationを流しても重複しない)
--   2) 本番では @example.com ドメインのusers行が残っていないことを以下で確認:
--        SELECT COUNT(*) FROM users WHERE email LIKE '%@example.com';  -- 0 であること
INSERT INTO users (name, email, role)
SELECT '内藤健司', 'naito@example.com', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'naito@example.com');

INSERT INTO users (name, email, role)
SELECT 'メンバーA', 'member_a@example.com', 'member'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'member_a@example.com');

INSERT INTO users (name, email, role)
SELECT 'メンバーB', 'member_b@example.com', 'member'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'member_b@example.com');

-- ============================================================================
-- 2. RLS 厳格化 (USING(true) → USING(false))
--    service_role はRLSをbypassするため API動作には影響なし。
--    anon key 経由のアクセスを完全遮断する defense-in-depth。
-- ============================================================================

-- meetings
DROP POLICY IF EXISTS meetings_select ON meetings;
DROP POLICY IF EXISTS meetings_insert ON meetings;
DROP POLICY IF EXISTS meetings_update ON meetings;
DROP POLICY IF EXISTS meetings_delete ON meetings;
CREATE POLICY meetings_deny_all ON meetings FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- transcripts
DROP POLICY IF EXISTS transcripts_select ON transcripts;
DROP POLICY IF EXISTS transcripts_insert ON transcripts;
DROP POLICY IF EXISTS transcripts_update ON transcripts;
DROP POLICY IF EXISTS transcripts_delete ON transcripts;
CREATE POLICY transcripts_deny_all ON transcripts FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- summaries
DROP POLICY IF EXISTS summaries_select ON summaries;
DROP POLICY IF EXISTS summaries_insert ON summaries;
DROP POLICY IF EXISTS summaries_update ON summaries;
DROP POLICY IF EXISTS summaries_delete ON summaries;
CREATE POLICY summaries_deny_all ON summaries FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- users: ログイン用 /api/auth/users は service_role 経由なので
--        anon側はDENY-ALLで問題ない。
DROP POLICY IF EXISTS users_select ON users;
DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_deny_all ON users FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- contacts: 既存001のSELECT/INSERT/UPDATEポリシーをDENY-ALLで上書き
DROP POLICY IF EXISTS contacts_select ON contacts;
DROP POLICY IF EXISTS contacts_insert ON contacts;
DROP POLICY IF EXISTS contacts_update ON contacts;
CREATE POLICY contacts_deny_all ON contacts FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- deals
DROP POLICY IF EXISTS deals_select ON deals;
DROP POLICY IF EXISTS deals_insert ON deals;
DROP POLICY IF EXISTS deals_update ON deals;
CREATE POLICY deals_deny_all ON deals FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- inquiries
DROP POLICY IF EXISTS inquiries_select ON inquiries;
DROP POLICY IF EXISTS inquiries_insert ON inquiries;
DROP POLICY IF EXISTS inquiries_update ON inquiries;
CREATE POLICY inquiries_deny_all ON inquiries FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- app_settings: 既に admin/manager のみ許可されている想定だが念のため遮断
ALTER TABLE IF EXISTS app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_settings_select ON app_settings;
DROP POLICY IF EXISTS app_settings_insert ON app_settings;
DROP POLICY IF EXISTS app_settings_update ON app_settings;
DROP POLICY IF EXISTS app_settings_delete ON app_settings;
CREATE POLICY app_settings_deny_all ON app_settings FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- job_logs: 同上
ALTER TABLE IF EXISTS job_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS job_logs_select ON job_logs;
DROP POLICY IF EXISTS job_logs_insert ON job_logs;
CREATE POLICY job_logs_deny_all ON job_logs FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- ============================================================================
-- ロールバック手順 (このmigrationを取り消す場合)
-- ============================================================================
-- このmigrationは下記2点を変更している:
--   A) usersテーブルに seed 行を3件INSERT
--   B) 全テーブルのRLSポリシーを DENY-ALL に置換
--
-- 完全ロールバック手順:
--   1) seed行削除:
--      DELETE FROM users WHERE email IN ('naito@example.com','member_a@example.com','member_b@example.com');
--      (関連 contacts/deals/inquiries.assigned_to が FK で繋がっている場合は先にそれらを処理)
--   2) DENY-ALL ポリシー削除:
--      DROP POLICY IF EXISTS meetings_deny_all   ON meetings;
--      DROP POLICY IF EXISTS transcripts_deny_all ON transcripts;
--      DROP POLICY IF EXISTS summaries_deny_all   ON summaries;
--      DROP POLICY IF EXISTS users_deny_all       ON users;
--      DROP POLICY IF EXISTS contacts_deny_all    ON contacts;
--      DROP POLICY IF EXISTS deals_deny_all       ON deals;
--      DROP POLICY IF EXISTS inquiries_deny_all   ON inquiries;
--      DROP POLICY IF EXISTS app_settings_deny_all ON app_settings;
--      DROP POLICY IF EXISTS job_logs_deny_all     ON job_logs;
--   3) 必要なら 001_schema.sql / 002_add_missing_rls.sql のポリシーを再適用
-- 注意: service_role はRLSをbypassするため、APIの動作はDENY-ALLでも変わらない。
-- ロールバックは「anon key 経由のアクセス制御」をどう戻したいかが主目的。
