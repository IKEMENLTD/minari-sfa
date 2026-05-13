import { describe, it, expect } from 'vitest';
import { escapeIlike, normalizeCompanyName, looksLikeNoise, isInternalMember } from '../auto-link-contacts';

describe('escapeIlike', () => {
  it('escapes percent', () => {
    expect(escapeIlike('100%off')).toBe('100\\%off');
  });
  it('escapes underscore', () => {
    expect(escapeIlike('a_b_c')).toBe('a\\_b\\_c');
  });
  it('escapes backslash', () => {
    expect(escapeIlike('a\\b')).toBe('a\\\\b');
  });
  it('leaves normal text unchanged', () => {
    expect(escapeIlike('内藤健司')).toBe('内藤健司');
  });
  it('handles empty string', () => {
    expect(escapeIlike('')).toBe('');
  });
});

describe('normalizeCompanyName', () => {
  it('removes 株式会社 prefix', () => {
    expect(normalizeCompanyName('株式会社イケメン')).toBe('イケメン'.toLowerCase());
  });
  it('removes 株 in full-width parens', () => {
    expect(normalizeCompanyName('（株）イケメン')).toBe('イケメン'.toLowerCase());
  });
  it('removes (株) in half-width parens', () => {
    expect(normalizeCompanyName('(株)イケメン')).toBe('イケメン'.toLowerCase());
  });
  it('removes ㈱ symbol', () => {
    expect(normalizeCompanyName('㈱イケメン')).toBe('イケメン'.toLowerCase());
  });
  it('removes 有限会社 / ㈲', () => {
    expect(normalizeCompanyName('有限会社山田')).toBe('山田'.toLowerCase());
    expect(normalizeCompanyName('㈲山田')).toBe('山田'.toLowerCase());
  });
  it('removes English suffixes', () => {
    expect(normalizeCompanyName('Acme Inc.')).toBe('acme');
    expect(normalizeCompanyName('Acme Ltd.')).toBe('acme');
    expect(normalizeCompanyName('Acme LLC')).toBe('acme');
    expect(normalizeCompanyName('Acme Corp.')).toBe('acme');
    expect(normalizeCompanyName('Acme Co.,Ltd.')).toBe('acme');
  });
  it('removes full-width and half-width spaces', () => {
    expect(normalizeCompanyName('株式会社 イケメン')).toBe('イケメン'.toLowerCase());
    expect(normalizeCompanyName('株式会社　イケメン')).toBe('イケメン'.toLowerCase());
  });
  it('lowercases ASCII characters', () => {
    expect(normalizeCompanyName('ABC Corp')).toBe('abc');
  });
  it('returns empty string when normalized form is empty', () => {
    expect(normalizeCompanyName('株式会社')).toBe('');
    expect(normalizeCompanyName('   ')).toBe('');
  });
  it('treats variations as same company', () => {
    const variants = [
      '株式会社イケメン',
      '（株）イケメン',
      '(株)イケメン',
      '㈱イケメン',
      'イケメン株式会社',
    ];
    const normalized = variants.map(normalizeCompanyName);
    // 全て 'イケメン' に正規化される
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe('イケメン'.toLowerCase());
  });
  it('does NOT match different companies with similar names (e.g., partial overlap)', () => {
    // 同名混同を防ぐ: "イケメン" と "イケメンUSA" は別物
    expect(normalizeCompanyName('株式会社イケメン')).not.toBe(normalizeCompanyName('株式会社イケメンUSA'));
  });
});

describe('looksLikeNoise', () => {
  it('flags SPEAKER_xx', () => {
    expect(looksLikeNoise('SPEAKER_01')).toBe(true);
    expect(looksLikeNoise('SPEAKER01')).toBe(true);
    expect(looksLikeNoise('speaker_5')).toBe(true);
  });
  it('flags Unknown/Guest/User_xx', () => {
    expect(looksLikeNoise('Unknown')).toBe(true);
    expect(looksLikeNoise('guest_1')).toBe(true);
    expect(looksLikeNoise('user2')).toBe(true);
    expect(looksLikeNoise('anonymous')).toBe(true);
  });
  it('flags very short or symbol-only', () => {
    expect(looksLikeNoise('a')).toBe(true);
    expect(looksLikeNoise('?')).toBe(true);
    expect(looksLikeNoise('---')).toBe(true);
    expect(looksLikeNoise('123')).toBe(true);
  });
  it('does NOT flag real names', () => {
    expect(looksLikeNoise('内藤 健司')).toBe(false);
    expect(looksLikeNoise('Macoto Tanaka')).toBe(false);
    expect(looksLikeNoise('山田')).toBe(false);
    expect(looksLikeNoise('ueno toshiyuki')).toBe(false);
  });
});

describe('isInternalMember', () => {
  const internal = new Set(['内藤健司', 'メンバーa', 'メンバーb']);
  it('matches exact internal member', () => {
    expect(isInternalMember('内藤 健司', internal)).toBe(true); // 空白除去で一致
    expect(isInternalMember('メンバーA', internal)).toBe(true); // 大文字小文字無視
  });
  it('does not match external participant', () => {
    expect(isInternalMember('田中太郎', internal)).toBe(false);
    expect(isInternalMember('Seri Naito', internal)).toBe(false); // 別人
  });
  it('handles full-width spaces', () => {
    expect(isInternalMember('内藤　健司', internal)).toBe(true);
  });
});
