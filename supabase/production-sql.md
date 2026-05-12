# 本番DB SQL 集 — minari-sfa (Supabase project: `slflcicorxngzlnasbur`)

Supabase Studio → SQL Editor で実行。順番に上から。

---

## 1. 実メール置換(seed の `@example.com` を本番値に)

⚠️ 実メールを埋めてから実行。冪等(再実行可)。

```sql
-- 内藤さん
UPDATE users
SET email = 'naito@実ドメイン.co.jp',
    name  = '内藤健司'
WHERE email = 'naito@example.com';

-- メンバーA
UPDATE users
SET email = 'memberA@実ドメイン.co.jp',
    name  = '実名 A'
WHERE email = 'member_a@example.com';

-- メンバーB
UPDATE users
SET email = 'memberB@実ドメイン.co.jp',
    name  = '実名 B'
WHERE email = 'member_b@example.com';

-- 確認: @example.com が 0件であること
SELECT COUNT(*) AS remaining_example_emails FROM users WHERE email LIKE '%@example.com';
```

---

## 2. デプロイ後 動作確認 SQL(`HANDOVER.md §3-2` 補強)

### 2-1. ユーザー seed 確認
```sql
SELECT id, name, email, role, created_at FROM users ORDER BY created_at;
-- 期待: 3行(admin 1, member 2)
```

### 2-2. RLS DENY-ALL 適用確認
```sql
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;
-- 期待: 9テーブル × 1ポリシー(_deny_all のみ)
```

### 2-3. summaries に AI案件名カラムある確認
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'summaries' AND column_name = 'suggested_deal_title';
-- 期待: 1行(text, nullable)
```

### 2-4. 最新の job_logs 確認(Background Function が動いているか)
```sql
SELECT job_type, status, COUNT(*) AS cnt, MAX(created_at) AS last_at
FROM job_logs
WHERE created_at > now() - interval '1 day'
GROUP BY job_type, status
ORDER BY last_at DESC;
```

### 2-5. 未紐付け会議の件数(Tier3 未紐付け滞留チェック)
```sql
SELECT COUNT(*) AS unlinked_meetings FROM meetings WHERE contact_id IS NULL;
```

### 2-6. 未要約会議の件数(Background Function 失敗 or 待機)
```sql
SELECT COUNT(*) AS unsummarized_meetings
FROM meetings m
LEFT JOIN summaries s ON s.meeting_id = m.id
LEFT JOIN transcripts t ON t.meeting_id = m.id
WHERE s.id IS NULL AND t.id IS NOT NULL;
-- transcript はあるのに summary 無いやつ
```

---

## 3. 運用クエリ

### 3-1. 直近1週間のアクティビティ
```sql
SELECT
  (SELECT COUNT(*) FROM meetings WHERE created_at > now() - interval '7 days') AS new_meetings,
  (SELECT COUNT(*) FROM contacts WHERE created_at > now() - interval '7 days') AS new_contacts,
  (SELECT COUNT(*) FROM deals    WHERE created_at > now() - interval '7 days') AS new_deals,
  (SELECT COUNT(*) FROM inquiries WHERE created_at > now() - interval '7 days') AS new_inquiries;
```

### 3-2. AI 案件名提案の品質チェック(目視レビュー用)
```sql
SELECT
  m.meeting_date,
  m.title AS meeting_title,
  s.suggested_deal_title,
  d.title AS actual_deal_title,
  CASE WHEN d.id IS NULL THEN '未作成'
       WHEN d.title = s.suggested_deal_title THEN 'AI採用'
       ELSE 'ユーザー編集' END AS adoption
FROM meetings m
JOIN summaries s ON s.meeting_id = m.id
LEFT JOIN deals d ON d.id = m.deal_id
WHERE s.suggested_deal_title IS NOT NULL
ORDER BY m.meeting_date DESC
LIMIT 50;
```

### 3-3. auto-link skip 傾向(Phase 6 改善判断)
job_logs の message を集計。
```sql
SELECT
  date_trunc('day', created_at) AS day,
  COUNT(*) FILTER (WHERE message LIKE '%曖昧%') AS ambiguous,
  COUNT(*) FILTER (WHERE message LIKE '%会社名%一致無し%') AS company_mismatch,
  COUNT(*) FILTER (WHERE message LIKE '%単一一致紐付け%') AS auto_linked
FROM job_logs
WHERE job_type = 'summarize' AND created_at > now() - interval '14 days'
GROUP BY day ORDER BY day DESC;
```

### 3-4. 放置案件(14日以上更新無し)
```sql
SELECT d.id, d.title, d.phase, c.full_name, d.updated_at,
       EXTRACT(day FROM now() - d.updated_at) AS days_stale
FROM deals d
JOIN contacts c ON c.id = d.contact_id
WHERE d.updated_at < now() - interval '14 days'
  AND d.phase IN ('proposal_planned', 'proposal_active', 'waiting', 'follow_up')
ORDER BY d.updated_at ASC
LIMIT 50;
```

---

## 4. メンテナンス SQL

### 4-1. role 変更(admin が member に降格、または昇格)
```sql
-- 例: メンバーA を manager に昇格
UPDATE users SET role = 'manager' WHERE email = 'memberA@実ドメイン.co.jp';

-- ⚠️ 変更後、対象ユーザーの roleCache は最大5分残る
-- POST /api/auth/refresh-role { "user_id": "<UUID>" } で即時無効化推奨
```

### 4-2. 退職者対応(users 行削除)
```sql
-- 1) その人が assigned_to になっている行を別ユーザーへ移管
UPDATE contacts SET assigned_to = '<内藤さんのUUID>'
WHERE assigned_to = (SELECT id FROM users WHERE email = '退職者@...');

UPDATE deals SET assigned_to = '<内藤さんのUUID>'
WHERE assigned_to = (SELECT id FROM users WHERE email = '退職者@...');

UPDATE inquiries SET assigned_to = '<内藤さんのUUID>'
WHERE assigned_to = (SELECT id FROM users WHERE email = '退職者@...');

-- 2) users 削除
DELETE FROM users WHERE email = '退職者@...';

-- 3) SITE_PASSWORD ローテーション(全員強制ログアウト)
--    AUTH_HMAC_SECRET も一緒に変えると過去のcookieを完全無効化
```

### 4-3. AI要約の再生成(特定会議)
```sql
-- summary を削除 → UI から「再生成」ボタン or 自動再呼び出し
DELETE FROM summaries WHERE meeting_id = '<UUID>';
```

### 4-4. 全 contact 重複検出(import 後のクリーンアップ)
```sql
SELECT full_name, company_name, COUNT(*) AS dup_count
FROM contacts
GROUP BY full_name, company_name
HAVING COUNT(*) > 1
ORDER BY dup_count DESC;
```

---

## 5. 緊急時ロールバック

### 5-1. migration 005 を完全に戻す(緊急時のみ)
```sql
-- seed 削除
DELETE FROM users WHERE email IN (
  'naito@example.com', 'member_a@example.com', 'member_b@example.com'
);
-- 既に実メールに UPDATE 済の場合は、UPDATE後のメールで指定

-- RLS DENY-ALL 削除
DROP POLICY IF EXISTS meetings_deny_all     ON meetings;
DROP POLICY IF EXISTS transcripts_deny_all  ON transcripts;
DROP POLICY IF EXISTS summaries_deny_all    ON summaries;
DROP POLICY IF EXISTS users_deny_all        ON users;
DROP POLICY IF EXISTS contacts_deny_all     ON contacts;
DROP POLICY IF EXISTS deals_deny_all        ON deals;
DROP POLICY IF EXISTS inquiries_deny_all    ON inquiries;
DROP POLICY IF EXISTS app_settings_deny_all ON app_settings;
DROP POLICY IF EXISTS job_logs_deny_all     ON job_logs;
```

### 5-2. migration 006 を戻す
```sql
ALTER TABLE summaries DROP COLUMN IF EXISTS suggested_deal_title;
```

⚠️ ロールバックは **service_role 経由 API の動作には影響しない**(RLS bypass)。
ユーザー機能(AI案件名提案)を消す or anon key 経由を再度許可する目的でのみ実施。
