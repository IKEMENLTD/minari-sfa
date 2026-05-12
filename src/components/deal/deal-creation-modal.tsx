'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface DealCreationModalProps {
  /** モーダル表示制御 */
  open: boolean;
  /** 閉じる時のコールバック */
  onClose: () => void;
  /** タイトル(ヘッダ) */
  title: string;
  /** 案件名の初期値(AI提案や meeting.title 等) */
  initialTitle?: string;
  /** AI提案案件名(ワンクリック採用ボタン用) */
  aiSuggestion?: string | null;
  /** 送信処理。成功時は親が遷移などを担当 */
  onSubmit: (dealTitle: string) => Promise<{ ok: boolean; error?: string }>;
  /** 送信ボタンラベル(デフォルト「作成」) */
  submitLabel?: string;
}

/**
 * 新規案件作成モーダル(共通)。
 * - meeting/[id] と contact/[id] の両画面で使用
 * - Esc + 背景クリックで閉じる(送信中は不可)
 * - autoFocus, aria-modal, role=dialog
 * - AI提案あれば「採用」ボタンでワンクリック反映
 */
export function DealCreationModal({
  open,
  onClose,
  title,
  initialTitle = '',
  aiSuggestion,
  onSubmit,
  submitLabel = '作成',
}: DealCreationModalProps) {
  const [dealTitle, setDealTitle] = useState(initialTitle);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [aiAdopted, setAiAdopted] = useState(false);
  const MAX_LEN = 500;
  const remaining = MAX_LEN - dealTitle.length;

  // open になったら初期化
  useEffect(() => {
    if (open) {
      setDealTitle(initialTitle);
      setError(null);
    }
  }, [open, initialTitle]);

  // Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return; // 二重送信防止
    const t = dealTitle.trim();
    if (!t) {
      setError('案件名を入力してください');
      return;
    }
    if (t.length > MAX_LEN) {
      setError(`案件名は ${MAX_LEN} 文字以内で入力してください`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await onSubmit(t);
      if (!res.ok) {
        setError(res.error ?? '案件作成に失敗しました');
        setSubmitting(false); // エラー時のみ再有効化
        return;
      }
      // 成功時: 親が router.push で遷移する前提。submitting=true を維持して
      // 二重送信&視覚的「処理中」を遷移までキープ。
    } catch (err) {
      console.error('Deal creation error:', err);
      setError(err instanceof Error ? err.message : '案件作成に失敗しました');
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={() => !submitting && onClose()}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-md bg-surface border border-border rounded-md max-h-[90vh] overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deal-creation-modal-title"
          aria-busy={submitting}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 id="deal-creation-modal-title" className="text-base font-semibold text-text">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="text-text-secondary hover:text-text disabled:opacity-50"
              aria-label="閉じる"
            >
              ×
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="px-5 py-4 space-y-4">
              {aiSuggestion && (
                <div className="flex items-start gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2">
                  <Sparkles className="h-3.5 w-3.5 text-accent mt-0.5 shrink-0" />
                  <div className="text-xs text-text-secondary">
                    AI提案: <span className="text-text">{aiSuggestion}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setDealTitle(aiSuggestion);
                        setAiAdopted(true);
                        setTimeout(() => setAiAdopted(false), 1500);
                      }}
                      className="ml-2 text-accent underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-accent/30"
                      aria-label="AI提案を採用"
                    >
                      {aiAdopted ? '✓ 採用しました' : '採用'}
                    </button>
                  </div>
                </div>
              )}
              <div>
                <Input
                  label="案件名 *"
                  value={dealTitle}
                  onChange={(e) => setDealTitle(e.target.value)}
                  placeholder="例: ○○社 Webサイト改修提案"
                  autoFocus
                  maxLength={MAX_LEN}
                />
                <p className={`text-xs mt-1 ${remaining < 50 ? 'text-yellow-500' : 'text-text-secondary'}`}>
                  残り {remaining} / {MAX_LEN} 文字
                </p>
              </div>
              {error && (
                <p role="alert" className="text-xs text-red-400">{error}</p>
              )}
            </div>
            <div className="border-t border-border px-5 py-3 flex items-center justify-end gap-2">
              <Button variant="secondary" size="sm" type="button" onClick={onClose} disabled={submitting}>
                キャンセル
              </Button>
              <Button size="sm" type="submit" loading={submitting} disabled={submitting || !dealTitle.trim()}>
                {submitting ? '作成中…' : submitLabel}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
