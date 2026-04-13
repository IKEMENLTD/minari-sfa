// =============================================================================
// 参加者名パーサー - tldvの参加者名から氏名・会社名を抽出する
// =============================================================================

/**
 * パース結果
 */
export interface ParsedParticipant {
  /** 氏名（スペース正規化済み） */
  full_name: string;
  /** 会社名（"/" や "（）" で区切られた場合） */
  company_name: string | null;
  /** パース前の元の文字列 */
  raw: string;
}

/**
 * tldv参加者名をパースする。
 *
 * 対応フォーマット:
 * - "内藤 健司/みなりパートナーズ㈱" → { full_name: "内藤 健司", company_name: "みなりパートナーズ㈱" }
 * - "内藤 健司（みなりパートナーズ）"  → { full_name: "内藤 健司", company_name: "みなりパートナーズ" }
 * - "内藤 健司(みなりパートナーズ)"    → { full_name: "内藤 健司", company_name: "みなりパートナーズ" }
 * - "桐山健太"                          → { full_name: "桐山健太", company_name: null }
 */
export function parseParticipantName(raw: string): ParsedParticipant {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { full_name: '', company_name: null, raw };
  }

  let name = trimmed;
  let company: string | null = null;

  // パターン1: "名前/会社名" 形式
  if (name.includes('/')) {
    const slashIndex = name.indexOf('/');
    const before = name.slice(0, slashIndex).trim();
    const after = name.slice(slashIndex + 1).trim();
    if (before && after) {
      name = before;
      company = after;
    }
  }
  // パターン2: "名前（会社名）" 全角括弧
  else if (name.includes('（') && name.includes('）')) {
    const start = name.indexOf('（');
    const end = name.indexOf('）');
    if (start < end) {
      company = name.slice(start + 1, end).trim() || null;
      name = name.slice(0, start).trim();
    }
  }
  // パターン3: "名前(会社名)" 半角括弧
  else if (name.includes('(') && name.includes(')')) {
    const start = name.indexOf('(');
    const end = name.indexOf(')');
    if (start < end) {
      company = name.slice(start + 1, end).trim() || null;
      name = name.slice(0, start).trim();
    }
  }

  // 株式会社の略称を正式名称に展開（㈱ → 株式会社）
  if (company) {
    company = company.replace(/㈱/g, '株式会社').replace(/㈲/g, '有限会社');
  }

  return {
    full_name: name,
    company_name: company,
    raw,
  };
}

/**
 * 名前の正規化（比較用）
 * - 全角/半角スペースを統一して除去
 * - 大文字/小文字統一
 */
export function normalizeName(name: string): string {
  return name
    .replace(/[\s\u3000]+/g, '') // 全角・半角スペースを除去
    .toLowerCase()
    .trim();
}

/**
 * 2つの名前が一致するか判定する（スペースの有無を無視）
 */
export function namesMatch(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}
