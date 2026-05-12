// =============================================================================
// app_settings の機密値を AES-256-GCM で暗号化/復号する。
//
// Master key は env `SETTINGS_ENCRYPTION_KEY` (32バイト hex = 64文字) に格納。
// 生成例: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//
// 暗号化形式: `v1:<iv_b64>|<authTag_b64>|<ciphertext_b64>`
//   - v1 はバージョンタグ(将来 AES-256-GCM 以外に切り替える場合の識別子)
//   - iv は 12バイト random(GCM 推奨)
//   - authTag は GCM の完全性検証タグ
//
// セキュリティモデル:
//   - master key を DB に置かない。env 漏洩 + service_role 漏洩の **両方** が
//     起きないと平文は得られない(2段階防御)
//   - master key 自体は1度設定したら触らない運用前提。Claude API key 等の
//     高頻度ローテーション対象は DB側で UI から差し替え可能
// =============================================================================

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const VERSION = 'v1';
const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM 推奨
const KEY_HEX_LENGTH = 64; // 32 bytes = 64 hex chars

function getMasterKey(): Buffer {
  const hex = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('環境変数 SETTINGS_ENCRYPTION_KEY が設定されていません(暗号化機能を使うには必須)');
  }
  if (hex.length !== KEY_HEX_LENGTH || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error(`SETTINGS_ENCRYPTION_KEY は ${KEY_HEX_LENGTH} 文字の16進数(32バイト)である必要があります`);
  }
  return Buffer.from(hex, 'hex');
}

/**
 * 平文文字列を AES-256-GCM で暗号化し、`v1:iv|tag|ciphertext` の base64 文字列を返す。
 * 同じ平文でも IV がランダムなので毎回異なる結果になる。
 */
export function encryptSetting(plain: string): string {
  const key = getMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64')}|${authTag.toString('base64')}|${ciphertext.toString('base64')}`;
}

/**
 * `v1:iv|tag|ciphertext` 形式を復号して平文を返す。
 * 改ざんされていれば authTag 検証で throw。
 */
export function decryptSetting(encoded: string): string {
  if (!encoded.startsWith(`${VERSION}:`)) {
    throw new Error(`暗号化フォーマットが不正です(期待: ${VERSION}:...)`);
  }
  const body = encoded.slice(VERSION.length + 1);
  const parts = body.split('|');
  if (parts.length !== 3) {
    throw new Error('暗号化フォーマットが不正です(parts mismatch)');
  }
  const [iv64, tag64, ct64] = parts;
  const iv = Buffer.from(iv64, 'base64');
  const authTag = Buffer.from(tag64, 'base64');
  const ciphertext = Buffer.from(ct64, 'base64');
  if (iv.length !== IV_LENGTH) {
    throw new Error(`IV 長が ${IV_LENGTH} バイトではありません`);
  }
  const decipher = createDecipheriv(ALGO, getMasterKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * 暗号化形式の値かどうか判定する。
 * - true: v1:... フォーマット → 復号必要
 * - false: 平文 or 別バージョン
 */
export function isEncryptedValue(value: string): boolean {
  return value.startsWith(`${VERSION}:`);
}

/**
 * UI 表示用にマスクする(末尾4文字のみ可視)。
 */
export function maskSecret(plain: string): string {
  if (plain.length <= 4) return '****';
  return '****' + plain.slice(-4);
}

// -----------------------------------------------------------------------------
// 暗号化対象キー(UI から平文で入力可能、DB へは暗号化して保存)
// -----------------------------------------------------------------------------
export const ENCRYPTABLE_KEYS: readonly string[] = [
  'claude_api_key',
  'tldv_api_key',
  'tldv_webhook_secret',
] as const;

export function isEncryptableKey(key: string): boolean {
  return ENCRYPTABLE_KEYS.includes(key.toLowerCase());
}
