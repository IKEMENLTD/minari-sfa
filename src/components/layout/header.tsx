'use client';

import { useCallback } from 'react';
import { User, LogOut } from 'lucide-react';
import { Logo } from './logo';

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
    <header className="flex items-center justify-between border-b border-border bg-surface px-4 sm:px-6 py-3">
      <div className="pl-10 md:hidden">
        <Logo size={24} />
      </div>
      <div className="ml-auto flex items-center gap-2 text-sm text-text-secondary">
        <User className="h-4 w-4" />
        <span>森井</span>
        <button
          type="button"
          onClick={handleLogout}
          data-guide="logout-button"
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
