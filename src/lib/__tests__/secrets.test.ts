import { describe, it, expect } from 'vitest';
import { isEnvOnlyKey, ENV_ONLY_KEYS } from '../config/secrets';
import { isEncryptableKey, ENCRYPTABLE_KEYS } from '../crypto/settings-cipher';

describe('isEnvOnlyKey', () => {
  it('blocks all explicit ENV_ONLY_KEYS', () => {
    for (const k of ENV_ONLY_KEYS) {
      expect(isEnvOnlyKey(k)).toBe(true);
      expect(isEnvOnlyKey(k.toUpperCase())).toBe(true);
    }
  });

  it('blocks keys with secret-like suffix', () => {
    expect(isEnvOnlyKey('naito_api_key')).toBe(true);
    expect(isEnvOnlyKey('slack_webhook_secret')).toBe(true);
    expect(isEnvOnlyKey('user_password')).toBe(true);
    expect(isEnvOnlyKey('access_token')).toBe(true);
    expect(isEnvOnlyKey('refresh_token')).toBe(true);
    expect(isEnvOnlyKey('client_secret')).toBe(true);
    expect(isEnvOnlyKey('private_key')).toBe(true);
  });

  it('allows non-secret config keys (false positive guard)', () => {
    expect(isEnvOnlyKey('api_version')).toBe(false);
    expect(isEnvOnlyKey('default_assignee_id')).toBe(false);
    expect(isEnvOnlyKey('tldv_polling_interval')).toBe(false);
    expect(isEnvOnlyKey('some_keystone_id')).toBe(false); // 末尾 _keystone != _key
    expect(isEnvOnlyKey('auth_mode')).toBe(false);
    expect(isEnvOnlyKey('keyword_filter')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isEnvOnlyKey('NAITO_API_KEY')).toBe(true);
    expect(isEnvOnlyKey('Naito_Api_Key')).toBe(true);
  });
});

describe('encryptable vs env-only ordering (regression: claude_api_key の救済)', () => {
  it('claude_api_key は ENCRYPTABLE_KEYS にあって isEncryptableKey が true', () => {
    expect(ENCRYPTABLE_KEYS.includes('claude_api_key')).toBe(true);
    expect(isEncryptableKey('claude_api_key')).toBe(true);
  });
  it('claude_api_key は SECRET_LIKE_PATTERNS の `_api_key$` にも合致するため isEnvOnlyKey も true', () => {
    // 注意: settings/route.ts は ENCRYPTABLE を先に評価することで claude_api_key を救う設計
    expect(isEnvOnlyKey('claude_api_key')).toBe(true);
  });
  it('tldv_api_key と tldv_webhook_secret も同じ救済対象', () => {
    expect(isEncryptableKey('tldv_api_key')).toBe(true);
    expect(isEncryptableKey('tldv_webhook_secret')).toBe(true);
  });
  it('env-only かつ encryptable でないキーは isEncryptableKey が false で settings に保存できない', () => {
    expect(isEncryptableKey('site_password')).toBe(false);
    expect(isEncryptableKey('auth_hmac_secret')).toBe(false);
    expect(isEnvOnlyKey('site_password')).toBe(true); // env でしか設定不可
  });
});
