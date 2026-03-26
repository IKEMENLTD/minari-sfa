'use client';

import { useState } from 'react';
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
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const navItems: NavItem[] = [
  { href: '/', label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/meetings', label: '議事録', icon: FileText },
  { href: '/approval', label: '承認', icon: CheckCircle },
  { href: '/deals', label: '案件管理', icon: Briefcase },
];

function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const navContent = (
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
                ? 'bg-accent/10 text-accent'
                : 'text-text-secondary hover:bg-gray-100 hover:text-text',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-border md:bg-surface md:min-h-screen">
        <div className="border-b border-border px-5 py-4">
          <span className="text-base font-semibold text-text tracking-tight">
            森井システム
          </span>
        </div>
        {navContent}
      </aside>

      {/* Mobile hamburger button */}
      <button
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
          <aside className="fixed inset-y-0 left-0 z-40 w-60 border-r border-border bg-surface md:hidden">
            <div className="border-b border-border px-5 py-4">
              <span className="text-base font-semibold text-text tracking-tight">
                森井システム
              </span>
            </div>
            {navContent}
          </aside>
        </>
      )}
    </>
  );
}

export { Sidebar };
