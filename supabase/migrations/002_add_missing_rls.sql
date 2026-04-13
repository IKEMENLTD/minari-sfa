-- ---------------------------------------------------------------------------
-- 002: meetings, transcripts, summaries, users テーブルへの RLS 追加
-- ---------------------------------------------------------------------------

-- meetings
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meetings_select ON meetings;
CREATE POLICY meetings_select ON meetings
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS meetings_insert ON meetings;
CREATE POLICY meetings_insert ON meetings
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS meetings_update ON meetings;
CREATE POLICY meetings_update ON meetings
  FOR UPDATE TO authenticated
  USING (true);

DROP POLICY IF EXISTS meetings_delete ON meetings;
CREATE POLICY meetings_delete ON meetings
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- transcripts
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transcripts_select ON transcripts;
CREATE POLICY transcripts_select ON transcripts
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS transcripts_insert ON transcripts;
CREATE POLICY transcripts_insert ON transcripts
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS transcripts_update ON transcripts;
CREATE POLICY transcripts_update ON transcripts
  FOR UPDATE TO authenticated
  USING (true);

DROP POLICY IF EXISTS transcripts_delete ON transcripts;
CREATE POLICY transcripts_delete ON transcripts
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- summaries
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS summaries_select ON summaries;
CREATE POLICY summaries_select ON summaries
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS summaries_insert ON summaries;
CREATE POLICY summaries_insert ON summaries
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS summaries_update ON summaries;
CREATE POLICY summaries_update ON summaries
  FOR UPDATE TO authenticated
  USING (true);

DROP POLICY IF EXISTS summaries_delete ON summaries;
CREATE POLICY summaries_delete ON summaries
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select ON users;
CREATE POLICY users_select ON users
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_update ON users
  FOR UPDATE TO authenticated
  USING (id = auth.uid());
