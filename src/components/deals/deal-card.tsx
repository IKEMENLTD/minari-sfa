'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Pencil, Check, X } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PhaseBadge } from '@/components/deals/phase-badge';
import type { DealWithDetails, SalesPhaseRow } from '@/types';

interface DealCardProps {
  deal: DealWithDetails;
  allPhases: SalesPhaseRow[];
}

function DealCard({ deal: initialDeal, allPhases }: DealCardProps) {
  const [deal, setDeal] = useState(initialDeal);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editPhaseId, setEditPhaseId] = useState(deal.deal_status.current_phase_id ?? '');
  const [editNextAction, setEditNextAction] = useState(deal.deal_status.next_action ?? '');
  const [editStatusSummary, setEditStatusSummary] = useState(deal.deal_status.status_summary ?? '');

  const totalPhases = allPhases.length || 5;
  const currentOrder = deal.phase?.phase_order ?? 0;
  const progressPercent = Math.round((currentOrder / totalPhases) * 100);
  const companyName = deal.company?.name ?? '未登録';
  const phaseName = deal.phase?.phase_name ?? '未設定';
  const phaseOrder = deal.phase?.phase_order ?? 0;

  const handleEditStart = () => {
    setEditPhaseId(deal.deal_status.current_phase_id ?? '');
    setEditNextAction(deal.deal_status.next_action ?? '');
    setEditStatusSummary(deal.deal_status.status_summary ?? '');
    setSaveError(null);
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setSaveError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, string> = {};
      if (editPhaseId) body.current_phase_id = editPhaseId;
      if (editNextAction !== undefined) body.next_action = editNextAction;
      if (editStatusSummary !== undefined) body.status_summary = editStatusSummary;

      const res = await fetch(`/api/deals/${deal.deal_status.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errJson: { error: string } = await res.json();
        throw new Error(errJson.error || '更新に失敗しました');
      }
      const json: { data: DealWithDetails } = await res.json();
      setDeal(json.data);
      setEditing(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text">{companyName}</h3>
          <div className="flex items-center gap-2">
            <PhaseBadge
              phaseName={phaseName}
              phaseOrder={phaseOrder}
              totalPhases={totalPhases}
            />
            {!editing && (
              <button
                type="button"
                onClick={handleEditStart}
                aria-label="編集"
                className="rounded p-1 text-text-secondary hover:bg-muted hover:text-text"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* フェーズ進捗バー */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
            <span>進捗</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-accent transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {editing ? (
          <div className="space-y-3">
            {/* フェーズ選択 */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">
                フェーズ
              </label>
              <select
                value={editPhaseId}
                onChange={(e) => setEditPhaseId(e.target.value)}
                className="w-full border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
              >
                <option value="">未設定</option>
                {allPhases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.phase_name}
                  </option>
                ))}
              </select>
            </div>

            {/* ステータス要約 */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">
                ステータス要約
              </label>
              <textarea
                value={editStatusSummary}
                onChange={(e) => setEditStatusSummary(e.target.value)}
                rows={2}
                maxLength={2000}
                className="w-full resize-none border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
              />
            </div>

            {/* ネクストアクション */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">
                ネクストアクション
              </label>
              <textarea
                value={editNextAction}
                onChange={(e) => setEditNextAction(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full resize-none border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
              />
            </div>

            {saveError && (
              <p className="text-xs text-red-400">{saveError}</p>
            )}

            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={handleSave} loading={saving}>
                <Check className="h-3.5 w-3.5" />
                保存
              </Button>
              <Button size="sm" variant="secondary" onClick={handleCancel} disabled={saving}>
                <X className="h-3.5 w-3.5" />
                キャンセル
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* ステータス要約 */}
            {deal.deal_status.status_summary && (
              <p className="text-sm text-text mb-3">
                {deal.deal_status.status_summary}
              </p>
            )}

            {/* ネクストアクション */}
            {deal.deal_status.next_action && (
              <div className="mb-3">
                <p className="text-xs font-medium text-text-secondary mb-0.5">
                  ネクストアクション
                </p>
                <p className="text-sm text-text">{deal.deal_status.next_action}</p>
              </div>
            )}

            {/* 最終商談日 */}
            {deal.deal_status.last_meeting_date && (
              <div className="mb-3">
                <p className="text-xs font-medium text-text-secondary mb-0.5">
                  最終商談日
                </p>
                <p className="text-sm text-text">
                  {new Date(deal.deal_status.last_meeting_date).toLocaleDateString('ja-JP')}
                </p>
              </div>
            )}

            {/* 議事録リンク */}
            {deal.company && (
              <Link
                href={`/meetings?company_id=${deal.company.id}`}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                関連議事録を見る
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export { DealCard };
