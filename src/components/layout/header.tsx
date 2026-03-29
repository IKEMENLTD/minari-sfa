'use client';

import { User, LogOut } from 'lucide-react';
import { Logo } from './logo';

async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

function Header() {
  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-4 sm:px-6 py-3">
      <div className="pl-10 md:hidden">
        <Logo size={24} />
      </div>
      <div className="ml-auto flex items-center gap-2 text-sm text-text-secondary">
        <User className="h-4 w-4" />
        <span>森井</span>
        <button
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
