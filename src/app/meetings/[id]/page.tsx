'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Save,
  UserPlus,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TOOL_LABEL } from '@/lib/constants';
import { formatDateShort } from '@/lib/format';
import type {
  MeetingDetail,
  ContactRow,
  DealWithContact,
} from '@/types';

// ---------------------------------------------------------------------------
// コンタクト候補サジェスト型
// ---------------------------------------------------------------------------

interface ContactMatch {
  id: string;
  full_name: string;
  company_name: string | null;
}

interface ParticipantSuggestion {
  participant_name: string;
  matches: ContactMatch[];
}

interface SelectOption {
  value: string;
  label: string;
}

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // transcript folding
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  // linking
  const [contactId, setContactId] = useState('');
  const [dealId, setDealId] = useState('');
  const [contacts, setContacts] = useState<SelectOption[]>([]);
  const [deals, setDeals] = useState<SelectOption[]>([]);

  // コンタクト候補サジェスト
  const [suggestions, setSuggestions] = useState<ParticipantSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [linkingParticipant, setLinkingParticipant] = useState<string | null>(null);

  // AI次アクション採用
  const [adoptingAction, setAdoptingAction] = useState(false);
  const [adoptMsg, setAdoptMsg] = useState<string | null>(null);

  const fetchMeeting = useCallback(async () => {
    if (!id) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(`/api/meetings/${id}?include_transcript=true`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(res.status === 404 ? '会議記録が見つかりませんでした' : 'データの取得に失敗しました');
      }
      const json: { data: MeetingDetail } = await res.json();
      const m = json.data;
      setMeeting(m);
      setContactId(m.contact_id ?? '');
      setDealId(m.deal_id ?? '');
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setError('タイムアウトしました。再試行してください。');
      } else {
        setError(e instanceof Error ? e.message : 'エラーが発生しました');
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [id]);

  const fetchOptions = useCallback(async () => {
    try {
      const [cRes, dRes] = await Promise.all([
        fetch('/api/contacts?limit=500'),
        fetch('/api/deals?limit=500'),
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
      console.error('選択肢の取得に失敗しました:', e);
    }
  }, []);

  // コンタクト候補を自動取得（未紐付けの場合のみ）
  const fetchSuggestions = useCallback(async () => {
    if (!id) return;
    setSuggestLoading(true);
    try {
      const res = await fetch(`/api/meetings/${id}/suggest`);
      if (res.ok) {
        const json: { data: { suggestions: ParticipantSuggestion[] } } = await res.json();
        setSuggestions(json.data.suggestions);
      }
    } catch (e) {
      console.error('コンタクト候補の取得に失敗しました:', e);
    } finally {
      setSuggestLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMeeting();
    fetchOptions();
    return () => { abortRef.current?.abort(); };
  }, [fetchMeeting, fetchOptions]);

  // meeting取得完了後、未紐付けならサジェストを呼ぶ
  useEffect(() => {
    if (meeting && !meeting.contact_id) {
      fetchSuggestions();
    }
  }, [meeting, fetchSuggestions]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: contactId || null,
          deal_id: dealId || null,
        }),
      });
      const json: { error?: string | null } = await res.json();
      if (!res.ok || json.error) {
        const msg = json.error ?? '保存に失敗しました';
        setSaveMsg(msg);
        setTimeout(() => setSaveMsg(null), 3000);
      } else {
        setSaveMsg('保存しました');
        setTimeout(() => setSaveMsg(null), 3000);
        fetchMeeting();
      }
    } catch (e) {
      console.error('会議の保存に失敗しました:', e);
      setSaveMsg('保存に失敗しました');
      setTimeout(() => setSaveMsg(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  // コンタクト候補をワンクリックで紐付け
  const handleLinkContact = async (matchContactId: string, participantName: string) => {
    if (!id) return;
    setLinkingParticipant(participantName);
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: matchContactId }),
      });
      const json: { error?: string | null } = await res.json();
      if (!res.ok || json.error) {
        console.error('紐付けに失敗しました:', json.error);
      } else {
        // 再取得してUIを更新
        fetchMeeting();
        setSuggestions([]);
      }
    } catch (e) {
      console.error('紐付けに失敗しました:', e);
    } finally {
      setLinkingParticipant(null);
    }
  };

  // AI提案の次アクションを採用する
  const handleAdoptAction = async () => {
    if (!meeting?.deal_id || !meeting.summary) return;
    const suggestedAction = meeting.summary.suggested_next_action;
    const suggestedDate = meeting.summary.suggested_next_action_date;
    if (!suggestedAction) return;

    setAdoptingAction(true);
    setAdoptMsg(null);
    try {
      const body: Record<string, string> = { next_action: suggestedAction };
      if (suggestedDate) {
        body.next_action_date = suggestedDate;
      }

      const res = await fetch(`/api/deals/${meeting.deal_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json: { error?: string | null } = await res.json();
      if (!res.ok || json.error) {
        setAdoptMsg(json.error ?? '次アクションの設定に失敗しました');
      } else {
        setAdoptMsg('案件の次アクションに設定しました');
      }
      setTimeout(() => setAdoptMsg(null), 3000);
    } catch (e) {
      console.error('次アクションの設定に失敗しました:', e);
      setAdoptMsg('次アクションの設定に失敗しました');
      setTimeout(() => setAdoptMsg(null), 3000);
    } finally {
      setAdoptingAction(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
          <p className="text-sm">会議記録が見つかりませんでした</p>
          <div className="mt-3 flex gap-2">
            <Link href="/meetings" className="text-sm text-accent hover:underline">
              一覧に戻る
            </Link>
            <Button variant="secondary" size="sm" onClick={fetchMeeting}>
              再試行
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const suggestedNextAction = meeting.summary?.suggested_next_action ?? null;
  const suggestedNextActionDate = meeting.summary?.suggested_next_action_date ?? null;

  return (
    <div className="space-y-6">
      {/* パンくず */}
      <nav className="flex items-center gap-1 text-sm text-text-secondary">
        <Link href="/meetings" className="hover:text-accent">
          会議記録
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-text">
          {new Date(meeting.meeting_date).toLocaleDateString('ja-JP')}
        </span>
      </nav>

      {/* ヘッダー情報 */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-text">
          {new Date(meeting.meeting_date).toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </h1>
        {meeting.tool && <Badge variant="info">{TOOL_LABEL[meeting.tool] ?? meeting.tool}</Badge>}
        {meeting.contact && (
          <Link href={`/contacts/${meeting.contact.id}`} className="text-sm text-accent hover:underline">
            {meeting.contact.full_name}
          </Link>
        )}
        {!meeting.contact_id && <Badge variant="warning">未紐付け</Badge>}
      </div>

      {/* 参加者 */}
      {meeting.participants.length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-secondary mb-1">参加者</p>
          <p className="text-sm text-text">{meeting.participants.join(', ')}</p>
        </div>
      )}

      {/* コンタクト候補サジェスト（未紐付け時のみ表示） */}
      {!meeting.contact_id && suggestions.length > 0 && (
        <Card className="border-accent/30 bg-accent/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-semibold text-accent">コンタクト候補</h2>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {suggestLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              suggestions.map((suggestion) => (
                <div key={suggestion.participant_name} className="space-y-2">
                  <p className="text-xs font-medium text-text-secondary">
                    {suggestion.participant_name}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {suggestion.matches.map((match) => (
                      <Button
                        key={match.id}
                        variant="secondary"
                        size="sm"
                        loading={linkingParticipant === suggestion.participant_name}
                        disabled={linkingParticipant !== null}
                        onClick={() => handleLinkContact(match.id, suggestion.participant_name)}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        {match.full_name}
                        {match.company_name ? ` (${match.company_name})` : ''}
                      </Button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* AI要約 */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-text">AI要約</h2>
            </CardHeader>
            <CardContent>
              {meeting.summary ? (
                <div className="text-sm text-text whitespace-pre-wrap leading-relaxed">
                  {meeting.summary.summary_text}
                </div>
              ) : (
                <p className="text-sm text-text-secondary py-4 text-center">AI要約未生成</p>
              )}
            </CardContent>
          </Card>

          {/* AI提案: 次アクション */}
          {meeting.summary && suggestedNextAction && (
            <Card className="border-accent/30 bg-accent/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-accent" />
                  <h4 className="text-sm font-semibold text-accent">AI提案: 次アクション</h4>
                </div>
                <p className="text-sm text-text mt-1">{suggestedNextAction}</p>
                {suggestedNextActionDate && (
                  <p className="text-xs text-text-secondary mt-1">
                    推奨期限: {formatDateShort(suggestedNextActionDate)}
                  </p>
                )}
                {meeting.deal_id ? (
                  <div className="flex items-center gap-3 mt-3">
                    <Button
                      size="sm"
                      onClick={handleAdoptAction}
                      loading={adoptingAction}
                      disabled={adoptingAction}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      採用する
                    </Button>
                    {adoptMsg && (
                      <span className={`text-xs ${adoptMsg.includes('設定しました') ? 'text-green-500' : 'text-red-400'}`}>
                        {adoptMsg}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-text-secondary mt-3">
                    案件を紐付けると、この次アクションを案件に反映できます
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* 議事録（折りたたみ） */}
          <Card>
            <CardHeader>
              <button
                type="button"
                onClick={() => setTranscriptOpen(!transcriptOpen)}
                className="flex items-center justify-between w-full text-left"
              >
                <h2 className="text-sm font-semibold text-text">議事録（文字起こし）</h2>
                {transcriptOpen ? (
                  <ChevronUp className="h-4 w-4 text-text-secondary" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-text-secondary" />
                )}
              </button>
            </CardHeader>
            {transcriptOpen && (
              <CardContent>
                {meeting.transcript ? (
                  <div className="text-sm text-text whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto">
                    {meeting.transcript.full_text}
                  </div>
                ) : (
                  <p className="text-sm text-text-secondary py-4 text-center">議事録なし</p>
                )}
              </CardContent>
            )}
          </Card>
        </div>

        {/* 右カラム: 紐付け操作 */}
        <div>
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-text">紐付け</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select
                label="コンタクト"
                options={contacts}
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                placeholder="コンタクトを選択..."
              />
              <Select
                label="案件"
                options={deals}
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
                placeholder="案件を選択..."
              />
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={handleSave} loading={saving} disabled={saving}>
                  <Save className="h-4 w-4" />
                  保存
                </Button>
                {saveMsg && (
                  <span className={`text-xs ${saveMsg === '保存しました' ? 'text-green-500' : 'text-red-400'}`}>
                    {saveMsg}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
