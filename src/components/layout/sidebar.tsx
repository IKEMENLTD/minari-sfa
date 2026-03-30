'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  FileText,
  CheckCircle,
  Briefcase,
  Menu,
  X,
  ExternalLink,
} from 'lucide-react';
import { Logo } from './logo';
import { NotebookLmIcon } from '@/components/ui/notebooklm-icon';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const navItems: NavItem[] = [
  { href: '/', label: 'ホーム', icon: LayoutDashboard },
  { href: '/meetings', label: '商談記録', icon: FileText },
  { href: '/approval', label: '取り込み・承認', icon: CheckCircle },
  { href: '/deals', label: '案件ボード', icon: Briefcase },
];

function getNotebookLmUrl(): string {
  if (typeof window === 'undefined') return 'https://notebooklm.google.com';
  const ua = navigator.userAgent;
  const isAndroid = /android/i.test(ua);
  const isIOS = /iphone|ipad|ipod/i.test(ua);

  if (isAndroid) {
    return 'intent://notebooklm.google.com/#Intent;scheme=https;package=com.google.android.apps.notebooklm;S.browser_fallback_url=https%3A%2F%2Fnotebooklm.google.com;end';
  }
  if (isIOS) {
    return 'https://notebooklm.google.com';
  }
  return 'https://notebooklm.google.com';
}

function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const navContent = (
    <>
      <nav className="flex flex-col gap-1 px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={clsx(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-accent/20 text-accent'
                  : 'text-text-secondary hover:bg-muted hover:text-text',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* 外部ツール */}
      <div className="mt-auto border-t border-border px-3 py-4">
        <p className="px-3 mb-2 text-[10px] font-medium uppercase tracking-widest text-text-secondary">
          外部ツール
        </p>
        <a
          href={getNotebookLmUrl()}
          target="_blank"
          rel="noopener noreferrer"
          data-guide="notebooklm-link"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-secondary hover:bg-muted hover:text-text transition-colors"
        >
          <NotebookLmIcon className="h-4 w-4 shrink-0" />
          NotebookLM
          <ExternalLink className="h-3 w-3 ml-auto opacity-40" />
        </a>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-border md:bg-surface md:min-h-screen">
        <div className="border-b border-border px-5 py-4">
          <Logo size={28} />
        </div>
        {navContent}
      </aside>

      {/* Mobile hamburger button */}
      <button
        data-guide="mobile-menu"
        className="fixed top-3 left-3 z-50 rounded-md border border-border bg-surface p-2 shadow-sm md:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="メニュー"
      >
        {mobileOpen ? (
          <X className="h-5 w-5 text-text" />
        ) : (
          <Menu className="h-5 w-5 text-text" />
        )}
      </button>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 left-0 z-40 w-60 flex flex-col border-r border-border bg-surface md:hidden">
            <div className="border-b border-border px-5 py-4">
              <Logo size={28} />
            </div>
            {navContent}
          </aside>
        </>
      )}
    </>
  );
}

export { Sidebar };
