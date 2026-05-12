import { describe, it, expect, beforeAll } from 'vitest';
import { encryptSetting, decryptSetting, isEncryptedValue, maskSecret, isEncryptableKey } from '../crypto/settings-cipher';
import { randomBytes } from 'crypto';

beforeAll(() => {
  // テスト用の master key を設定
  process.env.SETTINGS_ENCRYPTION_KEY = randomBytes(32).toString('hex');
});

describe('encryptSetting / decryptSetting (round-trip)', () => {
  it('round-trips a simple ASCII string', () => {
    const plain = 'sk-ant-12345';
    const enc = encryptSetting(plain);
    expect(decryptSetting(enc)).toBe(plain);
  });

  it('round-trips Japanese / multibyte string', () => {
    const plain = 'みなりパートナーズ株式会社';
    expect(decryptSetting(encryptSetting(plain))).toBe(plain);
  });

  it('round-trips empty string', () => {
    expect(decryptSetting(encryptSetting(''))).toBe('');
  });

  it('produces different ciphertext for same plaintext (random IV)', () => {
    const a = encryptSetting('hello');
    const b = encryptSetting('hello');
    expect(a).not.toBe(b);
    expect(decryptSetting(a)).toBe('hello');
    expect(decryptSetting(b)).toBe('hello');
  });

  it('throws on tampered ciphertext (auth tag mismatch)', () => {
    const enc = encryptSetting('secret');
    // 末尾を1文字変える
    const tampered = enc.slice(0, -1) + (enc.slice(-1) === 'a' ? 'b' : 'a');
    expect(() => decryptSetting(tampered)).toThrow();
  });

  it('throws on truncated ciphertext', () => {
    const enc = encryptSetting('secret');
    expect(() => decryptSetting(enc.slice(0, 20))).toThrow();
  });

  it('throws on missing version prefix', () => {
    expect(() => decryptSetting('not-encrypted-string')).toThrow();
  });
});

describe('isEncryptedValue', () => {
  it('returns true for v1: prefixed', () => {
    expect(isEncryptedValue(encryptSetting('x'))).toBe(true);
  });
  it('returns false for plaintext', () => {
    expect(isEncryptedValue('sk-ant-foo')).toBe(false);
  });
});

describe('maskSecret', () => {
  it('shows only last 4 chars', () => {
    expect(maskSecret('sk-ant-12345abcd')).toBe('****abcd');
  });
  it('returns all stars for short strings', () => {
    expect(maskSecret('abc')).toBe('****');
  });
});

describe('isEncryptableKey', () => {
  it('true for claude_api_key', () => {
    expect(isEncryptableKey('claude_api_key')).toBe(true);
  });
  it('true case-insensitive', () => {
    expect(isEncryptableKey('CLAUDE_API_KEY')).toBe(true);
  });
  it('false for unrelated keys', () => {
    expect(isEncryptableKey('default_assignee_id')).toBe(false);
  });
});
