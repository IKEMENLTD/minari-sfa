'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings, Eye, EyeOff, Save, AlertCircle, CheckCircle2, Wrench } from 'lucide-react';
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

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, { type: 'success' | 'error'; message: string }>>({});
  const [loading, setLoading] = useState(true);
  const [fixLoading, setFixLoading] = useState(false);
  const [fixFeedback, setFixFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      const json = await res.json();
      if (json.data) {
        setSettings(json.data);
        // Initialize values with masked values from server
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
