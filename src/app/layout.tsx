import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "森井システム",
  description: "営業業務効率化ツール",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
