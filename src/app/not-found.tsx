import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <p className="text-4xl font-bold text-text-secondary">404</p>
      <h2 className="text-lg font-semibold text-text">ページが見つかりません</h2>
      <Link href="/" className="text-sm text-accent hover:underline">
        ホームに戻る
      </Link>
    </div>
  );
}
