/* eslint-disable @next/next/no-img-element */
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
  Video,
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
  exact?: boolean;
}

interface ParticipantSuggestion {
  participant_name: string;
  matches: ContactMatch[];
}

/** マッチなしの参加者（新規コンタクト候補） */
interface UnmatchedParticipant {
  participant_name: string;
  parsed_name: string;
  parsed_company: string | null;
}

interface SelectOption {
  value: string;
  label: string;
}

function formatTranscriptText(raw: string): string {
  // If it's not JSON, return as-is
  if (!raw.startsWith('{') && !raw.startsWith('[')) return raw;

  try {
    const parsed = JSON.parse(raw);

    // tldv format: { data: [...] }
    if (parsed.data && Array.isArray(parsed.data)) {
      return parsed.data
        .map((s: { speaker?: string; speaker_name?: string; text?: string; content?: string }) => {
          const speaker = s.speaker_name ?? s.speaker ?? '';
          const content = s.text ?? s.content ?? '';
          return speaker ? `${speaker}: ${content}` : (content || '');
        })
        .filter(Boolean)
        .join('\n');
    }

    // segments/entries format
    const segments = parsed.segments ?? parsed.entries;
    if (Array.isArray(segments)) {
      return segments
        .map((s: { speaker?: string; speaker_name?: string; text?: string; content?: string }) => {
          const speaker = s.speaker_name ?? s.speaker ?? '';
          const content = s.text ?? s.content ?? '';
          return speaker ? `${speaker}: ${content}` : (content || '');
        })
        .filter(Boolean)
        .join('\n');
    }

    // Plain text field
    if (typeof parsed.text === 'string') return parsed.text;

    // Fallback: return original
    return raw;
  } catch {
    return raw;
  }
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
  const [unmatched, setUnmatched] = useState<UnmatchedParticipant[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [linkingParticipant, setLinkingParticipant] = useState<string | null>(null);
  const [creatingContact, setCreatingContact] = useState<string | null>(null);
  const [createContactMsg, setCreateContactMsg] = useState<string | null>(null);

  // AI要約生成
  const [summarizing, setSummarizing] = useState(false);
  const [summarizeMsg, setSummarizeMsg] = useState<string | null>(null);

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

  // 全案件を保持（フィルタ用）
  const [allDeals, setAllDeals] = useState<(DealWithContact & { contact_id: string })[]>([]);

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
        setAllDeals(dJson.data as (DealWithContact & { contact_id: string })[]);
      }
    } catch (e) {
      console.error('選択肢の取得に失敗しました:', e);
    }
  }, []);

  // コンタクトが変わったら案件リストをフィルタ
  useEffect(() => {
    if (contactId) {
      // 選択中コンタクトの案件を先頭に、それ以外も表示
      const related = allDeals.filter(d => d.contact_id === contactId);
      const others = allDeals.filter(d => d.contact_id !== contactId);
      const options: SelectOption[] = [];
      if (related.length > 0) {
        related.forEach(d => options.push({ value: d.id, label: `★ ${d.title}` }));
      }
      if (others.length > 0) {
        others.forEach(d => options.push({ value: d.id, label: d.title }));
      }
      setDeals(options);

      // 案件が未選択で、関連案件が1件だけなら自動選択
      if (!dealId && related.length === 1) {
        setDealId(related[0].id);
      }
    } else {
      setDeals(allDeals.map(d => ({ value: d.id, label: d.title })));
    }
  }, [contactId, allDeals, dealId]);

  // コンタクト候補を自動取得（未紐付けの場合のみ）
  const fetchSuggestions = useCallback(async () => {
    if (!id) return;
    setSuggestLoading(true);
    try {
      const res = await fetch(`/api/meetings/${id}/suggest`);
      if (res.ok) {
        const json: { data: { suggestions: ParticipantSuggestion[]; unmatched: UnmatchedParticipant[] } } = await res.json();
        setSuggestions(json.data.suggestions);
        setUnmatched(json.data.unmatched ?? []);
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

  const handleSave = useCallback(async () => {
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
  }, [id, contactId, dealId, fetchMeeting]);

  // Ctrl+S / Cmd+S で保存
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

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

  // 未マッチ参加者を新規コンタクトとして登録
  const handleCreateContact = async (participant: UnmatchedParticipant) => {
    if (!id) return;
    setCreatingContact(participant.participant_name);
    setCreateContactMsg(null);
    try {
      const res = await fetch(`/api/meetings/${id}/create-contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participant_names: [participant.participant_name],
          auto_link_first: !meeting?.contact_id, // 未紐付けなら自動紐付け
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setCreateContactMsg(json.error ?? 'コンタクトの作成に失敗しました');
      } else {
        const result = json.data;
        if (result.created.length > 0) {
          setCreateContactMsg(`${result.created[0].full_name} をコンタクトとして登録しました`);
        } else if (result.skipped.length > 0) {
          setCreateContactMsg(`${result.skipped[0].existing_contact_name} は既に登録済みです`);
        }
        // unmatchedリストから除去
        setUnmatched((prev) => prev.filter((u) => u.participant_name !== participant.participant_name));
        // 会議データとオプションを再取得
        fetchMeeting();
        fetchOptions();
      }
      setTimeout(() => setCreateContactMsg(null), 5000);
    } catch (e) {
      console.error('コンタクトの作成に失敗しました:', e);
      setCreateContactMsg('コンタクトの作成に失敗しました');
      setTimeout(() => setCreateContactMsg(null), 5000);
    } finally {
      setCreatingContact(null);
    }
  };

  // 全未マッチ参加者を一括でコンタクト登録
  const handleCreateAllContacts = async () => {
    if (!id || unmatched.length === 0) return;
    setCreatingContact('__all__');
    setCreateContactMsg(null);
    try {
      const res = await fetch(`/api/meetings/${id}/create-contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participant_names: unmatched.map((u) => u.participant_name),
          auto_link_first: !meeting?.contact_id,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setCreateContactMsg(json.error ?? 'コンタクトの一括作成に失敗しました');
      } else {
        const result = json.data;
        const msgs: string[] = [];
        if (result.created.length > 0) {
          msgs.push(`${result.created.length}件のコンタクトを作成しました`);
        }
        if (result.skipped.length > 0) {
          msgs.push(`${result.skipped.length}件は既に登録済みです`);
        }
        setCreateContactMsg(msgs.join('、'));
        setUnmatched([]);
        fetchMeeting();
        fetchOptions();
      }
      setTimeout(() => setCreateContactMsg(null), 5000);
    } catch (e) {
      console.error('コンタクトの一括作成に失敗しました:', e);
      setCreateContactMsg('コンタクトの一括作成に失敗しました');
      setTimeout(() => setCreateContactMsg(null), 5000);
    } finally {
      setCreatingContact(null);
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

  const handleSummarize = async (force: boolean) => {
    setSummarizing(true);
    setSummarizeMsg('AI要約を生成中です...（30秒〜2分程度かかります）');
    try {
      const url = `/api/meetings/${id}/summarize${force ? '?force=true' : ''}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setSummarizeMsg(json.error ?? 'AI要約の生成に失敗しました');
        setTimeout(() => setSummarizeMsg(null), 10000);
      } else {
        setSummarizeMsg('AI要約を生成しました');
        await fetchMeeting();
        setTimeout(() => setSummarizeMsg(null), 5000);
      }
    } catch {
      setSummarizeMsg('AI要約の生成に失敗しました。ネットワーク接続を確認してください。');
      setTimeout(() => setSummarizeMsg(null), 10000);
    } finally {
      setSummarizing(false);
    }
  };

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
          {meeting.title || new Date(meeting.meeting_date).toLocaleDateString('ja-JP')}
        </span>
      </nav>

      {/* ヘッダー情報 */}
      <div className="flex items-start gap-4">
        {/* サムネイル */}
        <div className="shrink-0 w-16 h-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
          {meeting.thumbnail_url ? (
            <img src={meeting.thumbnail_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <Video className="h-6 w-6 text-text-secondary" />
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-text">
            {meeting.title || new Date(meeting.meeting_date).toLocaleDateString('ja-JP', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </h1>
          {meeting.title && (
            <p className="text-sm text-text-secondary mt-0.5">
              {new Date(meeting.meeting_date).toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {meeting.tool && <Badge variant="info">{TOOL_LABEL[meeting.tool] ?? meeting.tool}</Badge>}
            {meeting.contact && (
              <Link href={`/contacts/${meeting.contact.id}`} className="text-sm text-accent hover:underline">
                {meeting.contact.full_name}
              </Link>
            )}
            {!meeting.contact_id && <Badge variant="warning">未紐付け</Badge>}
          </div>
        </div>
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

      {/* 未マッチ参加者 - 新規コンタクト登録候補 */}
      {unmatched.length > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-yellow-500" />
                <h2 className="text-sm font-semibold text-yellow-500">
                  未登録の参加者（{unmatched.length}名）
                </h2>
              </div>
              {unmatched.length > 1 && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={creatingContact === '__all__'}
                  disabled={creatingContact !== null}
                  onClick={handleCreateAllContacts}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  全員をコンタクト登録
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {createContactMsg && (
              <div className={`text-xs px-3 py-2 rounded ${createContactMsg.includes('失敗') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                {createContactMsg}
              </div>
            )}
            {unmatched.map((participant) => (
              <div key={participant.participant_name} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text truncate">
                    {participant.parsed_name}
                  </p>
                  {participant.parsed_company && (
                    <p className="text-xs text-text-secondary truncate">
                      {participant.parsed_company}
                    </p>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={creatingContact === participant.participant_name}
                  disabled={creatingContact !== null}
                  onClick={() => handleCreateContact(participant)}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  コンタクト登録
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* AI要約 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between w-full">
                <h2 className="text-sm font-semibold text-text">AI要約</h2>
                <Button
                  size="sm"
                  variant={meeting.summary ? 'secondary' : 'primary'}
                  onClick={() => handleSummarize(!!meeting.summary)}
                  loading={summarizing}
                  disabled={summarizing || !meeting.transcript}
                >
                  {meeting.summary ? '再生成' : 'AI要約を生成'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {summarizeMsg && (
                <div className={`text-xs mb-3 px-3 py-2 rounded ${summarizeMsg.includes('失敗') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                  {summarizeMsg}
                </div>
              )}
              {meeting.summary ? (
                <div className="text-sm text-text whitespace-pre-wrap leading-relaxed">
                  {meeting.summary.summary_text}
                </div>
              ) : (
                <p className="text-sm text-text-secondary py-4 text-center">
                  {meeting.transcript ? 'AI要約未生成 - 上のボタンで生成できます' : 'AI要約未生成（議事録がありません）'}
                </p>
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
                    {formatTranscriptText(meeting.transcript.full_text)}
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
              <div>
                <Select
                  label="コンタクト"
                  options={contacts}
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  placeholder="コンタクトを選択..."
                />
                {contactId && (
                  <button
                    type="button"
                    onClick={() => setContactId('')}
                    className="text-xs text-red-400 hover:text-red-500 mt-1"
                  >
                    紐付けを解除
                  </button>
                )}
              </div>
              <div>
                <Select
                  label="案件"
                  options={deals}
                  value={dealId}
                  onChange={(e) => setDealId(e.target.value)}
                  placeholder="案件を選択..."
                />
                {dealId && (
                  <button
                    type="button"
                    onClick={() => setDealId('')}
                    className="text-xs text-red-400 hover:text-red-500 mt-1"
                  >
                    紐付けを解除
                  </button>
                )}
              </div>
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
