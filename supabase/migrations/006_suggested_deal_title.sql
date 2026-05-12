-- ---------------------------------------------------------------------------
-- 006: summaries に suggested_deal_title を追加
--
-- AI要約から推定される案件名(deals.title候補)を保存。
-- 会議詳細画面で「この会議から案件作成」ボタンの初期値として使用。
-- ---------------------------------------------------------------------------

ALTER TABLE summaries ADD COLUMN IF NOT EXISTS suggested_deal_title TEXT;
