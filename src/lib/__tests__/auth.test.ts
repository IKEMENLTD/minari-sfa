import { describe, it, expect } from 'vitest';
import { extractUserIdUnsafe } from '../auth';

describe('extractUserIdUnsafe', () => {
  const validUuid = '550e8400-e29b-41d4-a716-446655440000';
  const validSessionId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
  const validHmac = 'a'.repeat(64);

  it('extracts userId from valid 3-part cookie', () => {
    const cookie = `${validUuid}.${validSessionId}.${validHmac}`;
    expect(extractUserIdUnsafe(cookie)).toBe(validUuid);
  });

  it('returns null for undefined cookie', () => {
    expect(extractUserIdUnsafe(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractUserIdUnsafe('')).toBeNull();
  });

  it('returns null for 2-part cookie (old format)', () => {
    expect(extractUserIdUnsafe(`${validSessionId}.${validHmac}`)).toBeNull();
  });

  it('returns null for 4-part cookie', () => {
    expect(extractUserIdUnsafe(`a.b.c.d`)).toBeNull();
  });

  it('returns null when userId is not a valid UUID', () => {
    expect(extractUserIdUnsafe(`not-a-uuid.${validSessionId}.${validHmac}`)).toBeNull();
  });

  it('returns null when userId is missing chars', () => {
    expect(extractUserIdUnsafe(`123.${validSessionId}.${validHmac}`)).toBeNull();
  });

  it('extracts userId regardless of HMAC validity (unsafe extraction)', () => {
    // 意図: signature検証は別。logout用なので signature が壊れていても userId は取れる
    const cookie = `${validUuid}.${validSessionId}.invalidhmac`;
    expect(extractUserIdUnsafe(cookie)).toBe(validUuid);
  });
});
