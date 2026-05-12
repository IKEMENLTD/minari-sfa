// =============================================================================
// シークレット運用ポリシー (Single Source of Truth)
// 環境変数のみで管理し、DB(app_settings)への保存を禁止するキー一覧。
// =============================================================================

/**
 * Netlify の Environment Variables でのみ設定可能なキー(小文字)。
 * app_settings テーブルに保存しようとすると 400 で拒否される。
 *
 * 理由:
 * - service_role 経由で全認証ユーザーが読み取り可能なため平文保存はリスク
 * - 漏洩時の影響範囲が外部API(Anthropic, TLDV)に及ぶ
 */
// =============================================================================
// env-only キー: DB 保存(暗号化含む)も禁止する最高機密。
//   - これらは Netlify 環境変数でのみ管理
//   - 漏洩時の影響範囲が広大で、ローテーション頻度が低い
//
// 注意: claude_api_key / tldv_api_key / tldv_webhook_secret は
//       PhaseB で「暗号化 DB 保存」に移行したため env-only リストから外した。
//       UI から設定可能。詳細は `src/lib/crypto/settings-cipher.ts` の ENCRYPTABLE_KEYS。
// =============================================================================
export const ENV_ONLY_KEYS: readonly string[] = [
  'supabase_service_role_key',
  'site_password',
  'auth_hmac_secret',
  'background_function_secret',
  'settings_encryption_key', // master key 自体は env のみ(自己参照防止)
] as const;

/**
 * 機密判定パターン(接尾辞のみ + 明確な機密語彙のみ)。
 * 一般語(api_version, auth_mode 等)が false positive にならないよう厳しめに絞る。
 *
 *   例:
 *     `naito_api_key`     → `_api_key$` 接尾辞 → block
 *     `claude_api_key_v2` → 末尾_keyに `_v2` 付き → 後述の正規表現で末尾だけ判定不可になるが、
 *                          ENV_ONLY_KEYSにあるclaude_api_keyからの派生は明示登録を促す
 *     `slack_webhook_url` → `_webhook_url$` or `_webhook_secret$` → block
 *     `api_version`       → 末尾_keyではない → 通過 (機密でない)
 */
const SECRET_LIKE_PATTERNS: readonly RegExp[] = [
  // 文字列全体 or `_` 接頭辞 で機密接尾辞ワードに一致
  //   "_api_key" にも "access_token" 単独にも対応
  /(?:^|_)(api_key|secret_key|access_key|signing_key|webhook_key|api_secret|webhook_secret|oauth_secret|client_secret|access_token|refresh_token|bearer_token|api_token|webhook_token|password|passphrase|private_key|credential|credentials)$/i,
];

/**
 * 指定キーが env-only ポリシーの対象かどうか(大文字小文字無視)。
 * 1) ENV_ONLY_KEYS 固定リスト一致 → block
 * 2) SECRET_LIKE_PATTERNS いずれかにマッチ → block
 *
 * これにより、攻撃者が任意キー名("naito_api_key" 等)で機密を平文保存する経路を塞ぐ。
 */
export function isEnvOnlyKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (ENV_ONLY_KEYS.includes(lower)) return true;
  return SECRET_LIKE_PATTERNS.some((re) => re.test(lower));
}

/**
 * 必須環境変数を取得する。未設定時は明示的エラー。
 * `throw` するのでサーバー処理の早期段階で呼ぶこと。
 */
export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません。Netlify Environment Variables を確認してください。`);
  }
  return value;
}

/**
 * セッショントークンの HMAC 署名鍵を取得する。
 * - AUTH_HMAC_SECRET が設定されていれば優先(独立鍵管理を推奨)
 * - 後方互換: 未設定なら SITE_PASSWORD を fallback
 *
 * これにより SITE_PASSWORD を変更しても、AUTH_HMAC_SECRET を変えない限り
 * 既存セッションは無効化されない(DoS回避)。
 */
export function getAuthHmacSecret(): string | null {
  return process.env.AUTH_HMAC_SECRET ?? process.env.SITE_PASSWORD ?? null;
}
