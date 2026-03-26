'use client';

import { useState } from 'react';
import { Building2, Check, X } from 'lucide-react';
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
}

function ApprovalCard({ meeting, companies, onApprove }: ApprovalCardProps) {
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctedCompanyId, setCorrectedCompanyId] = useState('');
  const [correctionNote, setCorrectionNote] = useState('');
  const [loading, setLoading] = useState(false);

  const companyOptions: SelectOption[] = companies.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  const handleApprove = async () => {
    setLoading(true);
    try {
      await onApprove(meeting.id, true);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = () => {
    setShowCorrection(true);
  };

  const handleSubmitCorrection = async () => {
    if (!correctedCompanyId) return;
    setLoading(true);
    try {
      const company = companies.find((c) => c.id === correctedCompanyId);
      await onApprove(
        meeting.id,
        false,
        company?.name,
        correctionNote || undefined,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-text-secondary" />
          <span className="text-sm font-medium text-text">
            推定企業: {meeting.ai_estimated_company || '不明'}
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
              <Select
                label="正しい企業名"
                options={companyOptions}
                placeholder="企業を選択してください"
                value={correctedCompanyId}
                onChange={(e) => setCorrectedCompanyId(e.target.value)}
              />
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
              onClick={() => setShowCorrection(false)}
            >
              キャンセル
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={loading}
              disabled={!correctedCompanyId}
              onClick={handleSubmitCorrection}
            >
              送信
            </Button>
          </CardFooter>
        </>
      ) : (
        <CardFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReject}
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
    </Card>
  );
}

export { ApprovalCard };
