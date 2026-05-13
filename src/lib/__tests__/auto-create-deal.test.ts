import { describe, it, expect } from 'vitest';
import { shouldAutoCreateDeal, normalizeDealTitle, isSameDealTitle } from '../auto-create-deal';

describe('shouldAutoCreateDeal', () => {
  it('creates when all conditions met', () => {
    const r = shouldAutoCreateDeal({
      suggestedDealTitle: 'みなりP Webサイト改修提案',
      meetingHasContact: true,
      meetingHasDeal: false,
    });
    expect(r.create).toBe(true);
    if (r.create) expect(r.cleanedTitle).toBe('みなりP Webサイト改修提案');
  });

  it('refuses when no title', () => {
    const r = shouldAutoCreateDeal({
      suggestedDealTitle: null,
      meetingHasContact: true,
      meetingHasDeal: false,
    });
    expect(r.create).toBe(false);
    if (!r.create) expect(r.reason).toBe('no_title');
  });

  it('refuses when empty title', () => {
    const r = shouldAutoCreateDeal({
      suggestedDealTitle: '   ',
      meetingHasContact: true,
      meetingHasDeal: false,
    });
    expect(r.create).toBe(false);
    if (!r.create) expect(r.reason).toBe('no_title');
  });

  it('refuses when no contact', () => {
    const r = shouldAutoCreateDeal({
      suggestedDealTitle: '○○社改修案',
      meetingHasContact: false,
      meetingHasDeal: false,
    });
    expect(r.create).toBe(false);
    if (!r.create) expect(r.reason).toBe('no_contact');
  });

  it('refuses when deal already exists', () => {
    const r = shouldAutoCreateDeal({
      suggestedDealTitle: '○○社改修案',
      meetingHasContact: true,
      meetingHasDeal: true,
    });
    expect(r.create).toBe(false);
    if (!r.create) expect(r.reason).toBe('already_has_deal');
  });

  it('refuses too short title', () => {
    const r = shouldAutoCreateDeal({
      suggestedDealTitle: 'A',
      meetingHasContact: true,
      meetingHasDeal: false,
    });
    expect(r.create).toBe(false);
    if (!r.create) expect(r.reason).toBe('title_too_short');
  });

  it('refuses generic titles', () => {
    for (const t of ['打ち合わせ', '商談', '面談', 'meeting', '会議', 'コンサル']) {
      const r = shouldAutoCreateDeal({
        suggestedDealTitle: t,
        meetingHasContact: true,
        meetingHasDeal: false,
      });
      expect(r.create, `${t} should be refused`).toBe(false);
    }
  });

  it('cleans whitespace in title', () => {
    const r = shouldAutoCreateDeal({
      suggestedDealTitle: '  みなり   Webサイト   改修  ',
      meetingHasContact: true,
      meetingHasDeal: false,
    });
    expect(r.create).toBe(true);
    if (r.create) expect(r.cleanedTitle).toBe('みなり Webサイト 改修');
  });
});

describe('normalizeDealTitle', () => {
  it('lowercases', () => {
    expect(normalizeDealTitle('Acme Web Renewal')).toBe('acme web renewal');
  });
  it('collapses whitespace', () => {
    expect(normalizeDealTitle('  a   b  c  ')).toBe('a b c');
  });
});

describe('isSameDealTitle', () => {
  it('matches across whitespace+case differences', () => {
    expect(isSameDealTitle('Acme  Web', 'acme web')).toBe(true);
  });
  it('does not match different deal names', () => {
    expect(isSameDealTitle('Acme Web', 'Acme App')).toBe(false);
  });
  it('does not match partial substrings (no includes-based false match)', () => {
    expect(isSameDealTitle('Acme', 'Acme Web')).toBe(false);
  });
});
