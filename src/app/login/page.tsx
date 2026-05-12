'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/layout/logo';
import { FOCUS_RING_CLASS } from '@/lib/ui-constants';

interface LoginUser {
  id: string;
  name: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [users, setUsers] = useState<LoginUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchUsers = async () => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const res = await fetch('/api/auth/users');
      if (!res.ok) {
        throw new Error('ユーザー一覧の取得に失敗しました');
      }
      const json: { data: LoginUser[] | null; error?: string | null } = await res.json();
      if (!json.data || json.data.length === 0) {
        setUsersError('ユーザーが登録されていません。管理者に連絡してください。');
      } else {
        setUsers(json.data);
      }
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'ユーザー一覧の取得に失敗しました');
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!userId) {
      setError('ユーザーを選択してください');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, password }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? 'ログインに失敗しました');
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
              ユーザー
            </label>
            {usersLoading ? (
              <div className="h-9 border border-border bg-bg px-3 py-2 text-sm text-text-secondary animate-pulse">
                読み込み中...
              </div>
            ) : usersError ? (
              <div className="flex flex-col gap-2 py-2">
                <p className="text-xs text-red-400 border border-red-400/40 bg-red-400/10 px-3 py-2">{usersError}</p>
                <button
                  type="button"
                  onClick={fetchUsers}
                  className={`self-start inline-flex items-center min-h-[44px] px-3 py-2 text-sm text-accent underline hover:text-accent-hover ${FOCUS_RING_CLASS}`}
                >
                  再試行
                </button>
              </div>
            ) : (
              <select
                autoFocus
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
                className={`border border-border bg-bg px-3 py-2 text-sm text-text ${FOCUS_RING_CLASS}`}
              >
                <option value="">選択してください</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium uppercase tracking-widest text-text-secondary">
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className={`border border-border bg-bg px-3 py-2 text-sm text-text ${FOCUS_RING_CLASS}`}
            />
          </div>
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !password.trim() || !userId || usersLoading || !!usersError}
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
