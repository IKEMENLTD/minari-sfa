'use client';

import { useCallback } from 'react';
import { User, LogOut } from 'lucide-react';

function Header() {
  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ログアウトAPIが失敗してもログイン画面に遷移
    }
    window.location.href = '/login';
  }, []);

  return (
    <header className="flex items-center justify-end border-b border-border bg-surface px-4 sm:px-6 py-3">
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <User className="h-4 w-4" />
        <span>内藤</span>
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
