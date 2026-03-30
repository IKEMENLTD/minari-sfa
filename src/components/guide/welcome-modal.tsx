'use client';

import { useState, useEffect, useCallback } from 'react';
import { isWelcomeDismissed, dismissWelcome } from '@/lib/guide-storage';
import { useGuide } from '@/components/guide/guide-provider';

const SESSION_KEY = 'sd_welcome_closed_session';

export default function WelcomeModal() {
  const [visible, setVisible] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const { startTour } = useGuide();

  useEffect(() => {
    // Don't show if dismissed for 7 days or already closed this session
    if (isWelcomeDismissed()) return;
    if (sessionStorage.getItem(SESSION_KEY) === 'true') return;
    setVisible(true);
  }, []);

  const handleClose = useCallback(() => {
    if (dontShowAgain) {
      dismissWelcome(7);
    }
    sessionStorage.setItem(SESSION_KEY, 'true');
    setVisible(false);
  }, [dontShowAgain]);

  const handleStartTour = useCallback(() => {
    if (dontShowAgain) {
      dismissWelcome(7);
    }
    sessionStorage.setItem(SESSION_KEY, 'true');
    setVisible(false);
    startTour();
  }, [dontShowAgain, startTour]);

  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
        role="presentation"
      />

      <div className="relative bg-[var(--color-surface)] rounded-lg max-w-md w-[calc(100%-2rem)] p-6 mx-auto">
        <h2 className="font-bold text-xl text-[var(--color-text)] mb-3">
          SALES DECK へようこそ
        </h2>

        <p className="text-sm text-[var(--color-text-secondary)] mb-3 leading-relaxed">
          営業インテリジェンスプラットフォームへようこそ。議事録の自動取り込みからAI分析、案件管理までをワンストップで行えます。
        </p>

        <p className="text-sm text-[var(--color-text-secondary)] mb-5 leading-relaxed">
          使い方を知りたい方は、ガイドツアーで操作方法をステップバイステップで確認できます。
        </p>

        <label className="flex items-center gap-2 mb-5 cursor-pointer text-sm text-[var(--color-text-secondary)]">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="rounded border-[var(--color-border)]"
          />
          7日間表示しない
        </label>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm rounded-md border border-[var(--color-border)] bg-transparent text-[var(--color-text)] hover:bg-[var(--color-muted)] transition-colors"
          >
            閉じる
          </button>
          <button
            type="button"
            onClick={handleStartTour}
            className="px-4 py-2 text-sm rounded-md bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            ガイドツアーを開始
          </button>
        </div>
      </div>
    </div>
  );
}
