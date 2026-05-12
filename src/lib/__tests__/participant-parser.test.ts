import { describe, it, expect } from 'vitest';
import { parseParticipantName, normalizeName, namesMatch } from '../participant-parser';

describe('parseParticipantName', () => {
  it('extracts name and company separated by "/"', () => {
    const r = parseParticipantName('内藤 健司/みなりパートナーズ㈱');
    expect(r.full_name).toBe('内藤 健司');
    expect(r.company_name).toBe('みなりパートナーズ株式会社');
  });

  it('extracts name and company in full-width parentheses', () => {
    const r = parseParticipantName('内藤 健司（みなりパートナーズ）');
    expect(r.full_name).toBe('内藤 健司');
    expect(r.company_name).toBe('みなりパートナーズ');
  });

  it('extracts name and company in half-width parentheses', () => {
    const r = parseParticipantName('内藤 健司(みなりパートナーズ)');
    expect(r.full_name).toBe('内藤 健司');
    expect(r.company_name).toBe('みなりパートナーズ');
  });

  it('returns null company when only name is given', () => {
    const r = parseParticipantName('桐山健太');
    expect(r.full_name).toBe('桐山健太');
    expect(r.company_name).toBeNull();
  });

  it('handles empty input', () => {
    const r = parseParticipantName('');
    expect(r.full_name).toBe('');
    expect(r.company_name).toBeNull();
  });

  it('handles whitespace-only input', () => {
    const r = parseParticipantName('   ');
    expect(r.full_name).toBe('');
  });

  it('expands ㈱ to 株式会社 in company name', () => {
    const r = parseParticipantName('田中 太郎/㈱イケメン');
    expect(r.company_name).toBe('株式会社イケメン');
  });

  it('expands ㈲ to 有限会社', () => {
    const r = parseParticipantName('山田/㈲山田商店');
    expect(r.company_name).toBe('有限会社山田商店');
  });

  it('preserves raw input', () => {
    const raw = '内藤 健司/会社A';
    const r = parseParticipantName(raw);
    expect(r.raw).toBe(raw);
  });
});

describe('normalizeName', () => {
  it('removes half-width spaces', () => {
    expect(normalizeName('内藤 健司')).toBe('内藤健司');
  });
  it('removes full-width spaces', () => {
    expect(normalizeName('内藤　健司')).toBe('内藤健司');
  });
  it('lowercases', () => {
    expect(normalizeName('Tanaka Taro')).toBe('tanakataro');
  });
});

describe('namesMatch', () => {
  it('matches names with different spacing', () => {
    expect(namesMatch('内藤 健司', '内藤健司')).toBe(true);
  });
  it('matches names with full-width vs half-width spaces', () => {
    expect(namesMatch('内藤　健司', '内藤 健司')).toBe(true);
  });
  it('does not match different names', () => {
    expect(namesMatch('田中', '鈴木')).toBe(false);
  });
});
