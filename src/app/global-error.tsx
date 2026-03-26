'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body>
        <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
          <h2>エラーが発生しました</h2>
          <p>予期しないエラーが発生しました。</p>
          <button onClick={() => reset()}>再試行</button>
        </div>
      </body>
    </html>
  );
}
