import { describe, it, expect } from 'vitest';
import { isEnvOnlyKey, ENV_ONLY_KEYS } from '../config/secrets';

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
