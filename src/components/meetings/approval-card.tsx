'use client';

import { useState } from 'react';
import { Building2, Check, X, AlertCircle } from 'lucide-react';
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

function ApprovalCard({ meeting, companies, onApprove, onReject }: ApprovalCardProps) {
  const [showCorrection, setShowCorrection] = useState(false);
  const [companyInputMode, setCompanyInputMode] = useState<CompanyInputMode>('select');
  const [correctedCompanyId, setCorrectedCompanyId] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [correctionNote, setCorrectionNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [approved, setApproved] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  const companyOptions: SelectOption[] = companies.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  const handleApprove = async () => {
    setLoading(true);
    setCardError(null);
    try {
      await onApprove(meeting.id, true);
      setApproved(true);
    } catch (e) {
      setCardError(e instanceof Error ? e.message : '承認処理に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleShowCorrection = () => {
    setShowCorrection(true);
    setCardError(null);
  };

  const handleSubmitCorrection = async () => {
    const correctedCompany =
      companyInputMode === 'new'
        ? newCompanyName.trim()
        : companies.find((c) => c.id === correctedCompanyId)?.name;

    if (!correctedCompany) return;
    setLoading(true);
    setCardError(null);
    try {
      await onApprove(
        meeting.id,
        false,
        correctedCompany,
        correctionNote || undefined,
      );
      setApproved(true);
    } catch (e) {
      setCardError(e instanceof Error ? e.message : '承認処理に失敗しました');
    } finally {
      setLoading(false);
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

      {showCorrection ? (
        <>
          <CardContent>
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
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
            <Button
              variant="ghost"
              size="sm"
              disabled={loading}
              onClick={() => setShowCorrection(false)}
            >
              キャンセル
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={loading}
              onClick={handleRejectClick}
            >
              <X className="h-3.5 w-3.5" />
              却下（スキップ）
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
            onClick={handleShowCorrection}
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
