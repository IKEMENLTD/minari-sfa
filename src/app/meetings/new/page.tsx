'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { ContactRow, DealWithContact, MeetingTool } from '@/types';

interface SelectOption {
  value: string;
  label: string;
}

const toolOptions: SelectOption[] = [
  { value: 'teams', label: 'Teams' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'meet', label: 'Google Meet' },
  { value: 'in_person', label: '対面' },
  { value: 'phone', label: '電話' },
];

export default function NewMeetingPage() {
  const router = useRouter();

  const [meetingDate, setMeetingDate] = useState('');
  const [tool, setTool] = useState<MeetingTool | ''>('');
  const [contactId, setContactId] = useState('');
  const [dealId, setDealId] = useState('');
  const [participants, setParticipants] = useState('');
  const [transcript, setTranscript] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [contacts, setContacts] = useState<SelectOption[]>([]);
  const [deals, setDeals] = useState<SelectOption[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const submitAbortRef = useRef<AbortController | null>(null);

  const fetchOptions = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const [cRes, dRes] = await Promise.all([
        fetch('/api/contacts?limit=500', { signal: controller.signal }),
        fetch('/api/deals?limit=500', { signal: controller.signal }),
      ]);
      if (cRes.ok) {
        const cJson: { data: ContactRow[] } = await cRes.json();
        setContacts(cJson.data.map((c) => ({
          value: c.id,
          label: `${c.full_name}${c.company_name ? ` (${c.company_name})` : ''}`,
        })));
      }
      if (dRes.ok) {
        const dJson: { data: DealWithContact[] } = await dRes.json();
        setDeals(dJson.data.map((d) => ({
          value: d.id,
          label: d.title,
        })));
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      console.error('選択肢の取得に失敗しました:', e);
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  useEffect(() => {
    fetchOptions();
    return () => { abortRef.current?.abort(); };
  }, [fetchOptions]);

  const handleSubmit = async () => {
    if (!meetingDate) {
      setError('日時は必須です');
      return;
    }
    if (submitAbortRef.current) submitAbortRef.current.abort();
    const controller = new AbortController();
    submitAbortRef.current = controller;

    const timeoutId = setTimeout(() => controller.abort(), 30000);

    setSubmitting(true);
    setError(null);
    try {
      const participantsList = participants
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);

      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_date: meetingDate,
          tool: tool || null,
          contact_id: contactId || null,
          deal_id: dealId || null,
          participants: participantsList,
          source: 'manual' as const,
          transcript_text: transcript || undefined,
        }),
        signal: controller.signal,
      });
      const json: { data?: { id: string }; error?: string | null } = await res.json();
      if (!res.ok || json.error) {
        setError(json.error ?? '登録に失敗しました');
      } else {
        router.push('/meetings');
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setError('タイムアウトしました。再試行してください。');
      } else {
        console.error('会議の登録に失敗しました:', e);
        setError('登録に失敗しました');
      }
    } finally {
      clearTimeout(timeoutId);
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* パンくず */}
      <nav className="flex items-center gap-1 text-sm text-text-secondary">
        <Link href="/meetings" className="hover:text-accent">
          会議記録
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-text">新規登録</span>
      </nav>

      <h1 className="text-xl font-semibold text-text">会議を登録</h1>

      <div className="max-w-xl">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text">会議情報</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Input
              label="日時 *"
              type="datetime-local"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
            />

            <Select
              label="ツール種別"
              options={toolOptions}
              value={tool}
              onChange={(e) => setTool(e.target.value as MeetingTool | '')}
              placeholder="選択してください"
            />

            <Select
              label="コンタクト"
              options={contacts}
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              placeholder="コンタクトを選択..."
            />

            <Input
              label="参加者（カンマ区切り）"
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              placeholder="田中太郎, 佐藤花子"
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text">メモ/議事録</label>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={6}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent resize-y"
                placeholder="会議の内容を入力..."
              />
            </div>

            <Select
              label="案件への紐付け（任意）"
              options={deals}
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
              placeholder="案件を選択..."
            />

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSubmit} loading={submitting} disabled={submitting}>
                登録
              </Button>
              <Link href="/meetings" className="text-sm text-text-secondary hover:text-text">
                キャンセル
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
