'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Users, Briefcase, Calendar } from 'lucide-react';
import { PHASE_LABEL } from '@/lib/constants';
import type { DealPhase } from '@/types';

// ---------------------------------------------------------------------------
// 検索結果の型定義（APIレスポンスに対応）
// ---------------------------------------------------------------------------

interface SearchContactItem {
  id: string;
  full_name: string;
  company_name: string | null;
  tier: 1 | 2 | 3 | 4;
}

interface SearchDealItem {
  id: string;
  title: string;
  phase: string;
  contact_name: string | null;
}

interface SearchMeetingItem {
  id: string;
  meeting_date: string;
  source: string;
  contact_name: string | null;
}

interface SearchResult {
  contacts: SearchContactItem[];
  deals: SearchDealItem[];
  meetings: SearchMeetingItem[];
}

interface SearchApiResponse {
  data: SearchResult | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// デバウンス定数
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// ソースラベル
// ---------------------------------------------------------------------------

const SOURCE_LABEL: Record<string, string> = {
  tldv: 'tldv',
  teams_copilot: 'Teams Copilot',
  manual: '手動',
};

// ---------------------------------------------------------------------------
// SearchModal コンポーネント
// ---------------------------------------------------------------------------

function SearchModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Cmd+K / Ctrl+K でモーダル開閉
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }

    // カスタムイベント（ヘッダーボタンからのトリガー）
    function handleOpenSearch() {
      setIsOpen(true);
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('open-search-modal', handleOpenSearch);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('open-search-modal', handleOpenSearch);
    };
  }, []);

  // モーダルが開いたらinputにフォーカス
  useEffect(() => {
    if (isOpen) {
      // 次のフレームでフォーカス（DOMの反映を待つ）
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } else {
      // 閉じたらクエリと結果をリセット
      setQuery('');
      setResults(null);
      setErrorMessage(null);
    }
  }, [isOpen]);

  // 検索API呼び出し（デバウンス）
  const executeSearch = useCallback((searchQuery: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (searchQuery.trim().length === 0) {
      setResults(null);
      setIsLoading(false);
      setErrorMessage(null);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    debounceRef.current = setTimeout(async () => {
      try {
        const encoded = encodeURIComponent(searchQuery.trim());
        const res = await fetch(`/api/search?q=${encoded}`);
        const json: SearchApiResponse = await res.json();

        if (json.error) {
          setErrorMessage(json.error);
          setResults(null);
        } else {
          setResults(json.data);
          setErrorMessage(null);
        }
      } catch {
        setErrorMessage('検索中にエラーが発生しました');
        setResults(null);
      } finally {
        setIsLoading(false);
      }
    }, DEBOUNCE_MS);
  }, []);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // 入力変更ハンドラ
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setQuery(value);
    executeSearch(value);
  }

  // 結果クリックで遷移
  function handleNavigate(path: string) {
    setIsOpen(false);
    router.push(path);
  }

  // オーバーレイクリックで閉じる
  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      setIsOpen(false);
    }
  }

  // 結果が全て空か判定
  const hasResults = results !== null && (
    results.contacts.length > 0 ||
    results.deals.length > 0 ||
    results.meetings.length > 0
  );

  const noResults = results !== null && !hasResults && query.trim().length > 0;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="グローバル検索"
    >
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg border border-border bg-surface shadow-lg">
        {/* 検索入力 */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-text-secondary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            placeholder="コンタクト、案件、会議を検索..."
            className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-secondary"
            autoComplete="off"
            spellCheck={false}
          />
          {isLoading && (
            <div className="h-4 w-4 shrink-0 animate-spin border-2 border-border border-t-accent rounded-full" />
          )}
        </div>

        {/* 結果 */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {/* エラー */}
          {errorMessage && (
            <p className="px-3 py-4 text-sm text-red-500">{errorMessage}</p>
          )}

          {/* 結果なし */}
          {noResults && !isLoading && (
            <p className="px-3 py-4 text-sm text-text-secondary text-center">
              見つかりませんでした
            </p>
          )}

          {/* コンタクト */}
          {results && results.contacts.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide">
                <Users className="h-3 w-3" />
                <span>コンタクト</span>
              </div>
              {results.contacts.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => handleNavigate(`/contacts/${contact.id}`)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-text truncate">{contact.full_name}</div>
                    {contact.company_name && (
                      <div className="text-xs text-text-secondary truncate">{contact.company_name}</div>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-text-secondary">
                    Tier {contact.tier}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* 案件 */}
          {results && results.deals.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide">
                <Briefcase className="h-3 w-3" />
                <span>案件</span>
              </div>
              {results.deals.map((deal) => (
                <button
                  key={deal.id}
                  type="button"
                  onClick={() => handleNavigate(`/deals/${deal.id}`)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-text truncate">{deal.title}</div>
                    {deal.contact_name && (
                      <div className="text-xs text-text-secondary truncate">{deal.contact_name}</div>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-text-secondary">
                    {PHASE_LABEL[deal.phase as DealPhase] ?? deal.phase}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* 会議 */}
          {results && results.meetings.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide">
                <Calendar className="h-3 w-3" />
                <span>会議</span>
              </div>
              {results.meetings.map((meeting) => (
                <button
                  key={meeting.id}
                  type="button"
                  onClick={() => handleNavigate(`/meetings/${meeting.id}`)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-text truncate">
                      {new Date(meeting.meeting_date).toLocaleDateString('ja-JP')}
                    </div>
                    {meeting.contact_name && (
                      <div className="text-xs text-text-secondary truncate">{meeting.contact_name}</div>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-text-secondary">
                    {SOURCE_LABEL[meeting.source] ?? meeting.source}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="border-t border-border px-4 py-2 text-xs text-text-secondary flex items-center justify-between">
          <span>Esc で閉じる</span>
          <span className="hidden sm:inline">Cmd+K で検索</span>
        </div>
      </div>
    </div>
  );
}

export { SearchModal };
