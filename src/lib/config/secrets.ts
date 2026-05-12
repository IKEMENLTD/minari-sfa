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
export const ENV_ONLY_KEYS: readonly string[] = [
  'claude_api_key',
  'tldv_api_key',
  'tldv_webhook_secret',
  'supabase_service_role_key',
  'site_password',
  'background_function_secret',
] as const;

/**
 * 指定キーが env-only ポリシーの対象かどうか(大文字小文字無視)。
 */
export function isEnvOnlyKey(key: string): boolean {
  return ENV_ONLY_KEYS.includes(key.toLowerCase());
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
