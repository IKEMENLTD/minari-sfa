import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthLayout } from '@/components/layout/auth-layout';
import { SearchModal } from '@/components/search/search-modal';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: {
    default: 'DEAL BOARD',
    template: '%s | DEAL BOARD',
  },
  description: '営業案件管理ツール',
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
        <AuthLayout>{children}</AuthLayout>
        <SearchModal />
      </body>
    </html>
  );
}
