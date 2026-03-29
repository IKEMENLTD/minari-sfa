'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/layout/logo';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        setError('パスワードが正しくありません');
        setLoading(false);
      }
    } catch (err) {
      const msg = err instanceof Error && err.name === 'AbortError'
        ? 'タイムアウトしました。サーバーが起動中です。15秒後に再試行してください。'
        : 'サーバーに接続できません。しばらく待ってから再試行してください。';
      setError(msg);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="w-full max-w-sm border border-border bg-surface p-5 sm:p-8">
        <div className="mb-8 flex justify-center">
          <Logo size={32} />
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium uppercase tracking-widest text-text-secondary">
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
              className="border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </div>
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? '認証中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  );
}
