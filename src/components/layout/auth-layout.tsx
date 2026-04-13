'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Header } from './header';

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return <main className="min-h-screen w-full flex items-center justify-center bg-bg">{children}</main>;
  }

  return (
    <>
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Header />
        <main className="flex-1 p-4 sm:p-6 overflow-x-hidden pt-14 md:pt-4">{children}</main>
      </div>
    </>
  );
}
