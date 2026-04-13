'use client';

import { useCallback, useState, useEffect } from 'react';
import { User, LogOut, Search } from 'lucide-react';

function Header() {
  const [isMac, setIsMac] = useState(true);
  useEffect(() => {
    setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.platform));
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ログアウトAPIが失敗してもログイン画面に遷移
    }
    window.location.href = '/login';
  }, []);

  const handleOpenSearch = useCallback(() => {
    document.dispatchEvent(new CustomEvent('open-search-modal'));
  }, []);

  return (
    <header className="flex items-center justify-end border-b border-border bg-surface px-4 sm:px-6 py-3">
      <div className="flex items-center gap-3 text-sm text-text-secondary">
        <button
          type="button"
          onClick={handleOpenSearch}
          className="flex items-center gap-1.5 text-text-secondary hover:text-text transition-colors"
          aria-label="検索を開く"
        >
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">{isMac ? 'Cmd+K' : 'Ctrl+K'}</span>
        </button>
        <div className="h-4 w-px bg-border" />
        <User className="h-4 w-4" />
        <button
          type="button"
          onClick={handleLogout}
          className="ml-2 flex items-center gap-1 text-text-secondary hover:text-text transition-colors"
          aria-label="ログアウト"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

export { Header };
