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
      }
    } catch (err) {
      const msg = err instanceof Error && err.name === 'AbortError'
        ? 'タイムアウトしました。サーバーが起動中です。15秒後に再試行してください。'
        : 'サーバーに接続できません。しばらく待ってから再試行してください。';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm px-4">
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
              autoComplete="current-password"
              className="border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </div>
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="bg-accent px-4 py-2.5 text-sm font-medium text-white min-h-[44px] hover:bg-accent-hover disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {loading && (
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  );
}
