-- ---------------------------------------------------------------------------
-- 007: deals の (contact_id, normalized title) を UNIQUE INDEX 化
--
-- PhaseD で同一 contact × 同一案件名 の二重 INSERT を防ぐ race condition 対策。
-- 既存データへの影響を最小化するため部分インデックス(削除済みdealは除外)。
-- 失敗時は Postgres エラーで insert 全体が rollback され、呼び出し側で fallback。
--
-- 正規化規則: lower(trim(regexp_replace(title, '\s+', ' ', 'g')))
--   = TS auto-create-deal.ts の normalizeDealTitle と同じ動作
--
-- 既存に重複が無いことを事前に確認する SQL:
--   SELECT contact_id, lower(trim(regexp_replace(title, '\s+', ' ', 'g'))) AS norm, COUNT(*)
--   FROM deals GROUP BY 1, 2 HAVING COUNT(*) > 1;
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_contact_normalized_title
ON deals (
  contact_id,
  (lower(trim(regexp_replace(title, '\s+', ' ', 'g'))))
);

-- ロールバック手順:
-- DROP INDEX IF EXISTS idx_deals_contact_normalized_title;
