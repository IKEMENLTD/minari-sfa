'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings, Eye, EyeOff, Save, AlertCircle, CheckCircle2, Wrench, HelpCircle, ChevronDown, ChevronUp, ExternalLink, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface SettingItem {
  key: string;
  value: string;
  updated_at: string;
}

interface SettingField {
  key: string;
  label: string;
  description: string;
}

const SETTING_FIELDS: SettingField[] = [
  {
    key: 'claude_api_key',
    label: 'Claude API Key',
    description: 'Anthropic Claude API のキー。AI要約生成に使用します。',
  },
  {
    key: 'tldv_api_key',
    label: 'TLDV API Key',
    description: 'tl;dv API のキー。会議データの同期に使用します。',
  },
  {
    key: 'tldv_webhook_secret',
    label: 'TLDV Webhook Secret',
    description: 'tl;dv Webhook の署名検証シークレット。',
  },
];

// ---------------------------------------------------------------------------
// APIキー取得ガイド
// ---------------------------------------------------------------------------

function ApiKeyGuide({ guideKey }: { guideKey: string }) {
  const [open, setOpen] = useState(false);

  if (guideKey === 'claude_api_key') {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-xs text-accent hover:underline"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          Claude APIキーの取得方法
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {open && (
          <div className="mt-2 rounded-md border border-border bg-muted/50 p-4 text-xs text-text-secondary space-y-3">
            <p className="font-medium text-text">Claude APIキーの取得手順</p>

            <div className="space-y-2">
              <p className="font-medium text-text">1. Anthropicアカウントを作成</p>
              <p>
                <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                  Anthropic Console <ExternalLink className="h-3 w-3" />
                </a>
                にアクセスし、「Sign Up」からアカウントを作成します。
              </p>
              <p>Google/GitHub アカウントまたはメールアドレスで登録できます。</p>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-text">2. クレジットを購入（初回のみ）</p>
              <p>ログイン後、左メニューの「Billing」をクリックします。</p>
              <p>「Add Credits」から利用分のクレジットを購入します（最低 $5〜）。</p>
              <p className="text-yellow-600">* APIは従量課金制です。AI要約1回あたり約 $0.01〜$0.05 程度です。</p>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-text">3. APIキーを発行</p>
              <p>左メニューの「API Keys」をクリックします。</p>
              <p>「Create Key」ボタンを押し、名前（例: deal-board）を入力して作成します。</p>
              <p className="text-yellow-600">* キーは作成時に一度だけ表示されます。必ずコピーしてください。</p>
              <p>形式: <code className="bg-background px-1.5 py-0.5 rounded text-text font-mono">sk-ant-api03-xxxx...xxxx</code></p>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-text">4. このページに貼り付けて保存</p>
              <p>上の入力欄にコピーしたキーを貼り付け、「保存」ボタンを押してください。</p>
              <p>保存後、会議詳細ページの「AI要約を生成」ボタンが使えるようになります。</p>
            </div>

            <div className="rounded border border-yellow-500/30 bg-yellow-500/10 p-3 space-y-1">
              <p className="font-medium text-yellow-600">セキュリティに関する注意</p>
              <p>APIキーは第三者に共有しないでください。</p>
              <p>万が一漏洩した場合は、Anthropic Consoleから即座に無効化（Revoke）してください。</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (guideKey === 'tldv_api_key') {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-xs text-accent hover:underline"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          tl;dv APIキーの取得方法
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {open && (
          <div className="mt-2 rounded-md border border-border bg-muted/50 p-4 text-xs text-text-secondary space-y-3">
            <p className="font-medium text-text">tl;dv APIキーの取得手順</p>

            <div className="space-y-2">
              <p className="font-medium text-text">1. tl;dv にログイン</p>
              <p>
                <a href="https://tldv.io/app/settings/integrations" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                  tl;dv 設定ページ <ExternalLink className="h-3 w-3" />
                </a>
                にアクセスします。
              </p>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-text">2. API Integrations からキーを発行</p>
              <p>Settings &gt; Integrations &gt; API から「Generate API Key」をクリックします。</p>
              <p>表示されたキーをコピーしてください。</p>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-text">3. このページに貼り付けて保存</p>
              <p>上の入力欄に貼り付け、「保存」ボタンを押してください。</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, { type: 'success' | 'error'; message: string }>>({});
  const [loading, setLoading] = useState(true);
  const [dbWarning, setDbWarning] = useState<string | null>(null);
  const [fixLoading, setFixLoading] = useState(false);
  const [fixFeedback, setFixFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      const json = await res.json();
      if (json.warning) {
        setDbWarning(json.warning);
      }
      if (json.data) {
        setSettings(json.data);
        const vals: Record<string, string> = {};
        for (const s of json.data as SettingItem[]) {
          vals[s.key] = s.value;
        }
        setValues(vals);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async (key: string) => {
    const value = values[key];
    if (value === undefined) return;

    // Don't save if value is still the masked placeholder
    if (value.startsWith('****') && value === settings.find((s) => s.key === key)?.value) {
      setFeedback((prev) => ({ ...prev, [key]: { type: 'error', message: '新しい値を入力してください' } }));
      return;
    }

    setSaving((prev) => ({ ...prev, [key]: true }));
    setFeedback((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      const json = await res.json();
      if (json.error) {
        setFeedback((prev) => ({ ...prev, [key]: { type: 'error', message: json.error } }));
      } else {
        setFeedback((prev) => ({ ...prev, [key]: { type: 'success', message: '保存しました' } }));
        // Re-fetch to get masked values
        await fetchSettings();
      }
    } catch {
      setFeedback((prev) => ({ ...prev, [key]: { type: 'error', message: '保存に失敗しました' } }));
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleDelete = async (key: string) => {
    if (!confirm('このAPIキーを削除してもよろしいですか？')) return;
    setDeleting((prev) => ({ ...prev, [key]: true }));
    setFeedback((prev) => { const next = { ...prev }; delete next[key]; return next; });
    try {
      const res = await fetch(`/api/settings?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) {
        setFeedback((prev) => ({ ...prev, [key]: { type: 'error', message: json.error } }));
      } else {
        setFeedback((prev) => ({ ...prev, [key]: { type: 'success', message: '削除しました' } }));
        setValues((prev) => { const next = { ...prev }; delete next[key]; return next; });
        await fetchSettings();
      }
    } catch {
      setFeedback((prev) => ({ ...prev, [key]: { type: 'error', message: '削除に失敗しました' } }));
    } finally {
      setDeleting((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleFixTranscripts = async () => {
    setFixLoading(true);
    setFixFeedback(null);
    try {
      const res = await fetch('/api/admin/fix-transcripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.error) {
        setFixFeedback({ type: 'error', message: json.error });
      } else {
        setFixFeedback({ type: 'success', message: '議事録データの修正が完了しました' });
      }
    } catch {
      setFixFeedback({ type: 'error', message: '議事録データの修正に失敗しました' });
    } finally {
      setFixLoading(false);
    }
  };

  const toggleVisibility = (key: string) => {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const getExistingSetting = (key: string) => settings.find((s) => s.key === key);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-3 sm:px-6 py-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-accent" />
        <h1 className="text-xl font-bold text-text">設定</h1>
      </div>

      {/* DB Warning */}
      {dbWarning && (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm space-y-2">
          <div className="flex items-center gap-2 text-yellow-600 font-medium">
            <AlertCircle className="h-4 w-4" />
            データベースのセットアップが必要です
          </div>
          <p className="text-xs text-text-secondary">{dbWarning}</p>
          <div className="text-xs text-text-secondary space-y-1">
            <p>以下の手順でテーブルを作成してください：</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Supabase ダッシュボードにログイン</li>
              <li>左メニューの「SQL Editor」を開く</li>
              <li>以下のSQLを貼り付けて「Run」をクリック</li>
            </ol>
            <pre className="mt-2 p-3 bg-background rounded border border-border overflow-x-auto text-[11px] font-mono whitespace-pre">{`CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;`}</pre>
            <p className="mt-2">実行後、このページをリロードしてください。</p>
          </div>
        </div>
      )}

      {/* API Keys Section */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-text">API キー設定</h2>
          <p className="text-sm text-text-secondary mt-1">
            外部サービスとの連携に使用するAPIキーを管理します。
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {SETTING_FIELDS.map((field) => {
                const existing = getExistingSetting(field.key);
                const currentValue = values[field.key] ?? '';
                const isVisible = visibility[field.key] ?? false;
                const isSaving = saving[field.key] ?? false;
                const fb = feedback[field.key];

                return (
                  <div key={field.key} className="space-y-2">
                    <div>
                      <label className="text-sm font-medium text-text" htmlFor={field.key}>
                        {field.label}
                      </label>
                      <p className="text-xs text-text-secondary">{field.description}</p>
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          id={field.key}
                          type={isVisible ? 'text' : 'password'}
                          value={currentValue}
                          onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                          onFocus={() => {
                            // Clear masked value on focus so user can type fresh
                            if (currentValue.startsWith('****')) {
                              setValues((prev) => ({ ...prev, [field.key]: '' }));
                            }
                          }}
                          placeholder={existing ? '新しい値を入力（変更する場合）' : '値を入力'}
                          className="w-full rounded-md border border-border bg-surface px-3 py-2 pr-10 text-sm text-text placeholder:text-text-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
                        />
                        <button
                          type="button"
                          onClick={() => toggleVisibility(field.key)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text p-1"
                          aria-label={isVisible ? '非表示' : '表示'}
                        >
                          {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        loading={isSaving}
                        onClick={() => handleSave(field.key)}
                      >
                        <Save className="h-4 w-4" />
                        保存
                      </Button>
                      {existing && (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={deleting[field.key] ?? false}
                          onClick={() => handleDelete(field.key)}
                          className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {existing && (
                      <p className="text-xs text-text-secondary">
                        最終更新: {new Date(existing.updated_at).toLocaleString('ja-JP')}
                      </p>
                    )}
                    {fb && (
                      <div
                        className={`flex items-center gap-1.5 text-xs ${
                          fb.type === 'success' ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {fb.type === 'success' ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5" />
                        )}
                        {fb.message}
                      </div>
                    )}
                    <ApiKeyGuide guideKey={field.key} />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin Tools Section */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-text">管理ツール</h2>
          <p className="text-sm text-text-secondary mt-1">
            データの修正やメンテナンスに使用するツールです。
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-text">議事録データ修正</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                議事録データの不整合を検出し修正します。
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={fixLoading}
              onClick={handleFixTranscripts}
            >
              <Wrench className="h-4 w-4" />
              修正を実行
            </Button>
            {fixFeedback && (
              <div
                className={`flex items-center gap-1.5 text-xs ${
                  fixFeedback.type === 'success' ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {fixFeedback.type === 'success' ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5" />
                )}
                {fixFeedback.message}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
