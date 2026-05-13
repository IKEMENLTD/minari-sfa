import { describe, it, expect } from 'vitest';
import { appendAiObservation, shouldFlipHasMovement, TEMPERATURE_LABEL, extractAiObservations, removeAiObservation } from '../ai-observation';

describe('appendAiObservation', () => {
  it('appends to empty', () => {
    const r = appendAiObservation(null, '2026-05-13', '温度感', '前向き');
    expect(r).toBe('[AI観察 2026-05-13] 温度感=前向き');
  });

  it('appends to existing with newline', () => {
    const r = appendAiObservation('既存ノート', '2026-05-13', '温度感', '前向き');
    expect(r).toBe('既存ノート\n[AI観察 2026-05-13] 温度感=前向き');
  });

  it('handles undefined existing', () => {
    const r = appendAiObservation(undefined, '2026-05-13', '温度感', '前向き');
    expect(r).toBe('[AI観察 2026-05-13] 温度感=前向き');
  });

  it('skips duplicate (same date + label)', () => {
    const before = '[AI観察 2026-05-13] 温度感=前向き';
    const r = appendAiObservation(before, '2026-05-13', '温度感', '後ろ向き');
    expect(r).toBe(before); // 同日同種は重複append しない(冪等)
  });

  it('appends different label on same date', () => {
    const before = '[AI観察 2026-05-13] 温度感=前向き';
    const r = appendAiObservation(before, '2026-05-13', '議事録言及金額', '300万〜500万円');
    expect(r).toBe(`${before}\n[AI観察 2026-05-13] 議事録言及金額=300万〜500万円`);
  });

  it('appends same label different date', () => {
    const before = '[AI観察 2026-05-13] 温度感=前向き';
    const r = appendAiObservation(before, '2026-05-14', '温度感', '中立');
    expect(r).toBe(`${before}\n[AI観察 2026-05-14] 温度感=中立`);
  });
});

describe('shouldFlipHasMovement', () => {
  it('flips false → true on positive', () => {
    expect(shouldFlipHasMovement(false, 'positive')).toBe(true);
  });

  it('does NOT flip true → anything (one-way)', () => {
    expect(shouldFlipHasMovement(true, 'positive')).toBeNull();
    expect(shouldFlipHasMovement(true, 'negative')).toBeNull();
    expect(shouldFlipHasMovement(true, 'neutral')).toBeNull();
    expect(shouldFlipHasMovement(true, null)).toBeNull();
  });

  it('does NOT flip false → true on neutral/negative', () => {
    expect(shouldFlipHasMovement(false, 'neutral')).toBeNull();
    expect(shouldFlipHasMovement(false, 'negative')).toBeNull();
    expect(shouldFlipHasMovement(false, null)).toBeNull();
  });
});

describe('TEMPERATURE_LABEL', () => {
  it('has Japanese labels', () => {
    expect(TEMPERATURE_LABEL.positive).toBe('前向き');
    expect(TEMPERATURE_LABEL.neutral).toBe('中立');
    expect(TEMPERATURE_LABEL.negative).toBe('後ろ向き');
  });
});

describe('extractAiObservations', () => {
  it('returns empty for null/empty', () => {
    expect(extractAiObservations(null)).toEqual([]);
    expect(extractAiObservations('')).toEqual([]);
  });
  it('parses single line', () => {
    const r = extractAiObservations('[AI観察 2026-05-13] 温度感=前向き');
    expect(r).toEqual([{ raw: '[AI観察 2026-05-13] 温度感=前向き', date: '2026-05-13', label: '温度感', value: '前向き' }]);
  });
  it('parses multiple lines with non-AI text mixed', () => {
    const text = '人手メモ\n[AI観察 2026-05-13] 温度感=前向き\n別行\n[AI観察 2026-05-14] 議事録言及金額=300万';
    const r = extractAiObservations(text);
    expect(r).toHaveLength(2);
    expect(r[0].date).toBe('2026-05-13');
    expect(r[1].value).toBe('300万');
  });
  it('ignores non-matching lines', () => {
    expect(extractAiObservations('普通のメモ\n別の行')).toEqual([]);
    expect(extractAiObservations('[AI観察 一部破損] X=Y')).toEqual([]);
  });
});

describe('removeAiObservation', () => {
  it('returns empty for null', () => {
    expect(removeAiObservation(null, 'x')).toBe('');
  });
  it('removes exact line', () => {
    const text = 'メモ\n[AI観察 2026-05-13] 温度感=前向き\nメモ2';
    const r = removeAiObservation(text, '[AI観察 2026-05-13] 温度感=前向き');
    expect(r).toBe('メモ\nメモ2');
  });
  it('preserves other AI observation lines', () => {
    const text = '[AI観察 2026-05-13] 温度感=前向き\n[AI観察 2026-05-14] 温度感=中立';
    const r = removeAiObservation(text, '[AI観察 2026-05-13] 温度感=前向き');
    expect(r).toBe('[AI観察 2026-05-14] 温度感=中立');
  });
  it('no-op when target line not present', () => {
    expect(removeAiObservation('メモ', '[AI観察 2099-01-01] 温度感=前向き')).toBe('メモ');
  });
});
