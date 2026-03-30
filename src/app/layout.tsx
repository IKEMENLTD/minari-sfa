import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { GuideProvider } from '@/components/guide/guide-provider';
import { HelpButton } from '@/components/guide/help-button';
import { GuideOverlay } from '@/components/guide/guide-overlay';

export const metadata: Metadata = {
  title: 'SALES DECK',
  description: '営業インテリジェンス プラットフォーム',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="flex min-h-screen overflow-x-hidden">
        <GuideProvider>
          <Sidebar />
          <div className="flex flex-1 flex-col min-w-0">
            <Header />
            <main className="flex-1 p-4 sm:p-6 overflow-x-hidden">{children}</main>
          </div>
          <HelpButton />
          <GuideOverlay />
        </GuideProvider>
      </body>
    </html>
  );
}
