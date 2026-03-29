'use client';

import { useState, useMemo } from 'react';
import { Building2, Check, X, AlertCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import type { MeetingRow, CompanyRow } from '@/types';
import type { SelectOption } from '@/components/ui/select';

interface ApprovalCardProps {
  meeting: MeetingRow;
  companies: CompanyRow[];
  onApprove: (meetingId: string, isCorrect: boolean, correctedCompany?: string, correctionNote?: string) => Promise<void>;
  onReject: (meetingId: string) => Promise<void>;
}

type CompanyInputMode = 'select' | 'new';

const SOURCE_LABELS: Record<MeetingRow['source'], string> = {
  jamroll: 'Jamroll',
  proud: 'PROUD',
};

// 企業名を正規化して比較用文字列を生成
function normalizeCompanyName(name: string): string {
  return name
    .replace(/[\s\u3000]+/g, '') // 空白除去
    .replace(/[（(][^）)]*[）)]/g, '') // 括弧内除去
    .replace(/株式会社|合同会社|有限会社|一般社団法人|合資会社/g, '') // 法人格除去
    .toLowerCase();
}

// 類似企業を検索
function findSimilarCompanies(targetName: string, companies: CompanyRow[]): CompanyRow[] {
  if (!targetName) return [];
  const normalized = normalizeCompanyName(targetName);
  if (normalized.length < 2) return [];

  return companies.filter((c) => {
    if (c.name === targetName) return false; // 完全一致は除外（同じ名前なら問題ない）
    const compNorm = normalizeCompanyName(c.name);
    // 部分一致（どちらかが含まれる）
    return compNorm.includes(normalized) || normalized.includes(compNorm);
  });
}

// 企業名が不明確かどうか判定
function isCompanyNameUnclear(name: string | null | undefined): boolean {
  if (!name) return true;
  const n = name.trim();
  return n === '' || n === '(不明)' || n === '（不明）' || n === '不明' || n === '-';
}

function ApprovalCard({ meeting, companies, onApprove, onReject }: ApprovalCardProps) {
  const unclear = isCompanyNameUnclear(meeting.ai_estimated_company);
  const [showCorrection, setShowCorrection] = useState(unclear);
  const [companyInputMode, setCompanyInputMode] = useState<CompanyInputMode>(unclear ? 'select' : 'select');
  const [correctedCompanyId, setCorrectedCompanyId] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [correctionNote, setCorrectionNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [approved, setApproved] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  // 類似企業チェック用state
  const [similarStep, setSimilarStep] = useState<{
    targetName: string;
    similars: CompanyRow[];
    selectedAction: 'existing' | 'new' | null;
    selectedCompanyId: string;
  } | null>(null);

  const companyOptions: SelectOption[] = companies.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  // AI推定企業名でも類似チェック（メモ化）
  const aiSimilars = useMemo(() => {
    if (!meeting.ai_estimated_company || unclear) return [];
    return findSimilarCompanies(meeting.ai_estimated_company, companies);
  }, [meeting.ai_estimated_company, companies, unclear]);

  const proceedApprove = async (isCorrect: boolean, companyName?: string) => {
    setLoading(true);
    setCardError(null);
    try {
      await onApprove(meeting.id, isCorrect, companyName, correctionNote || undefined);
      setApproved(true);
    } catch (e) {
      setCardError(e instanceof Error ? e.message : '承認処理に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 「はい」ボタン: 類似チェック → 確認 or 直接承認
  const handleApprove = async () => {
    const name = meeting.ai_estimated_company ?? '';

    // 類似企業チェック
    if (aiSimilars.length > 0) {
      setSimilarStep({
        targetName: name,
        similars: aiSimilars,
        selectedAction: null,
        selectedCompanyId: '',
      });
      return;
    }

    // 類似なし → そのまま承認
    await proceedApprove(true);
  };

  // 修正送信: 類似チェック → 確認 or 直接承認
  const handleSubmitCorrection = async () => {
    const correctedCompany =
      companyInputMode === 'new'
        ? newCompanyName.trim()
        : companies.find((c) => c.id === correctedCompanyId)?.name;

    if (!correctedCompany) return;

    // 既存企業から選択した場合は類似チェック不要
    if (companyInputMode === 'select') {
      await proceedApprove(false, correctedCompany);
      return;
    }

    // 新規入力の場合: 類似チェック
    const similars = findSimilarCompanies(correctedCompany, companies);
    if (similars.length > 0) {
      setSimilarStep({
        targetName: correctedCompany,
        similars,
        selectedAction: null,
        selectedCompanyId: '',
      });
      return;
    }

    await proceedApprove(false, correctedCompany);
  };

  // 類似確認で決定
  const handleSimilarConfirm = async () => {
    if (!similarStep) return;
    if (similarStep.selectedAction === 'existing' && similarStep.selectedCompanyId) {
      const company = companies.find((c) => c.id === similarStep.selectedCompanyId);
      await proceedApprove(false, company?.name);
    } else {
      // 新規として作成
      await proceedApprove(
        showCorrection ? false : true,
        showCorrection ? similarStep.targetName : undefined,
      );
    }
  };

  const handleRejectClick = async () => {
    setLoading(true);
    setCardError(null);
    try {
      await onReject(meeting.id);
    } catch (e) {
      setCardError(e instanceof Error ? e.message : '却下処理に失敗しました');
      setLoading(false);
    }
  };

  const isSubmitDisabled =
    companyInputMode === 'select'
      ? !correctedCompanyId
      : !newCompanyName.trim();

  if (approved) {
    return (
      <Card className="opacity-60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-text">承認済み</span>
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            {meeting.ai_estimated_company || '不明'}
          </p>
        </CardHeader>
      </Card>
    );
  }

  // 類似企業確認ステップ
  if (similarStep) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <span className="text-sm font-medium text-text">類似企業が見つかりました</span>
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            「{similarStep.targetName}」と似た企業が登録されています
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {similarStep.similars.map((c) => (
              <label key={c.id} className="flex items-center gap-2 cursor-pointer p-2 border border-border hover:bg-muted">
                <input
                  type="radio"
                  name={`similar-${meeting.id}`}
                  checked={similarStep.selectedAction === 'existing' && similarStep.selectedCompanyId === c.id}
                  onChange={() => setSimilarStep({ ...similarStep, selectedAction: 'existing', selectedCompanyId: c.id })}
                />
                <span className="text-sm text-text">既存の「{c.name}」と統合する</span>
              </label>
            ))}
            <label className="flex items-center gap-2 cursor-pointer p-2 border border-border hover:bg-muted">
              <input
                type="radio"
                name={`similar-${meeting.id}`}
                checked={similarStep.selectedAction === 'new'}
                onChange={() => setSimilarStep({ ...similarStep, selectedAction: 'new', selectedCompanyId: '' })}
              />
              <span className="text-sm text-text">「{similarStep.targetName}」を新規企業として登録する</span>
            </label>
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="ghost" size="sm" onClick={() => setSimilarStep(null)} disabled={loading}>
            戻る
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={loading}
            disabled={!similarStep.selectedAction}
            onClick={handleSimilarConfirm}
          >
            確定
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-text-secondary" />
            <span className="text-sm font-medium text-text">
              推定企業: {meeting.ai_estimated_company || '不明'}
            </span>
          </div>
          <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs text-text-secondary">
            {SOURCE_LABELS[meeting.source]}
          </span>
        </div>
        <p className="mt-1 text-xs text-text-secondary">
          {new Date(meeting.meeting_date).toLocaleDateString('ja-JP')} / {meeting.participants.join(', ')}
        </p>
      </CardHeader>

      {/* 企業名不明の場合の警告 */}
      {unclear && (
        <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-xs text-yellow-600 bg-yellow-50/50">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          企業名を特定できませんでした。正しい企業名を選択または入力してください。
        </div>
      )}

      {showCorrection ? (
        <>
          <CardContent>
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name={`company-mode-${meeting.id}`}
                    value="select"
                    checked={companyInputMode === 'select'}
                    onChange={() => setCompanyInputMode('select')}
                  />
                  <span className="text-text">既存企業から選ぶ</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name={`company-mode-${meeting.id}`}
                    value="new"
                    checked={companyInputMode === 'new'}
                    onChange={() => setCompanyInputMode('new')}
                  />
                  <span className="text-text">新規企業名を入力</span>
                </label>
              </div>

              {companyInputMode === 'select' ? (
                <Select
                  label="正しい企業名"
                  options={companyOptions}
                  placeholder="企業を選択してください"
                  value={correctedCompanyId}
                  onChange={(e) => setCorrectedCompanyId(e.target.value)}
                />
              ) : (
                <Input
                  label="新規企業名"
                  placeholder="企業名を入力してください"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                />
              )}

              <Input
                label="修正メモ（任意）"
                placeholder="修正理由など"
                value={correctionNote}
                onChange={(e) => setCorrectionNote(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter>
            {!unclear && (
              <Button
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={() => setShowCorrection(false)}
              >
                キャンセル
              </Button>
            )}
            <Button
              variant="danger"
              size="sm"
              loading={loading}
              onClick={handleRejectClick}
            >
              <X className="h-3.5 w-3.5" />
              却下
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={loading}
              disabled={isSubmitDisabled}
              onClick={handleSubmitCorrection}
            >
              送信
            </Button>
          </CardFooter>
        </>
      ) : (
        <CardFooter>
          <Button
            variant="danger"
            size="sm"
            disabled={loading}
            onClick={() => { setShowCorrection(true); setCardError(null); }}
          >
            <X className="h-3.5 w-3.5" />
            いいえ
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={loading}
            onClick={handleApprove}
          >
            <Check className="h-3.5 w-3.5" />
            はい
          </Button>
        </CardFooter>
      )}

      {cardError && (
        <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {cardError}
        </div>
      )}
    </Card>
  );
}

export { ApprovalCard };
