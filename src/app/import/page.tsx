'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Upload, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeader,
} from '@/components/ui/table';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type ImportType = 'contacts' | 'deals';

interface ParsedCSV {
  headers: string[];
  rows: string[][];
}

interface ImportRowError {
  row: number;
  error: string;
}

interface ImportResult {
  imported: number;
  errors: ImportRowError[];
}

// ---------------------------------------------------------------------------
// フィールド定義
// ---------------------------------------------------------------------------

interface FieldDefinition {
  key: string;
  label: string;
  required: boolean;
}

const CONTACT_FIELDS: readonly FieldDefinition[] = [
  { key: 'full_name', label: '氏名', required: true },
  { key: 'company_name', label: '会社名', required: false },
  { key: 'department', label: '部署', required: false },
  { key: 'position', label: '役職', required: false },
  { key: 'email', label: 'メール', required: false },
  { key: 'phone', label: '電話', required: false },
  { key: 'tier', label: 'Tier (1-4)', required: false },
] as const;

const DEAL_FIELDS: readonly FieldDefinition[] = [
  { key: 'title', label: '案件名', required: true },
  { key: 'contact_name', label: 'コンタクト名', required: true },
  { key: 'company_name', label: '会社名', required: false },
  { key: 'phase', label: 'フェーズ', required: false },
  { key: 'deliverable', label: '制作物', required: false },
  { key: 'industry', label: '職種/内容', required: false },
  { key: 'status_detail', label: 'ステータス詳細', required: false },
  { key: 'probability', label: '確度', required: false },
  { key: 'deadline', label: '納期', required: false },
  { key: 'revenue', label: '報酬', required: false },
  { key: 'target_country', label: '対象国', required: false },
  { key: 'client_contact_name', label: 'クライアント窓口', required: false },
  { key: 'note', label: 'メモ', required: false },
] as const;

// ---------------------------------------------------------------------------
// CSVパース (RFC 4180 準拠)
// ---------------------------------------------------------------------------

function parseCSVLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCSV(text: string): ParsedCSV {
  const separator = text.includes('\t') ? '\t' : ',';
  const lines = text.split('\n').filter((l) => l.trim());
  const headers = parseCSVLine(lines[0], separator);
  const rows = lines.slice(1).map((l) => parseCSVLine(l, separator));
  return { headers, rows };
}

// ---------------------------------------------------------------------------
// 自動マッピング推測
// ---------------------------------------------------------------------------

const HEADER_ALIASES: Record<string, string[]> = {
  full_name: ['氏名', '名前', 'name', 'full_name', 'fullname', '担当者名'],
  company_name: ['会社名', '会社', 'company', 'company_name', '法人名', '企業名'],
  department: ['部署', 'department', '部門'],
  position: ['役職', 'position', '肩書'],
  email: ['メール', 'email', 'mail', 'メールアドレス', 'e-mail'],
  phone: ['電話', 'phone', 'tel', '電話番号'],
  tier: ['tier', 'ティア', 'ランク', '優先度'],
  title: ['案件名', 'title', '件名', '案件', 'プロジェクト名'],
  contact_name: ['コンタクト名', 'contact_name', '担当者名', '顧客名', '氏名'],
  phase: ['フェーズ', 'phase', 'ステータス', '段階'],
  deliverable: ['制作物', 'deliverable', '成果物', '納品物'],
  industry: ['職種', 'industry', '業界', '内容'],
  status_detail: ['ステータス詳細', 'status_detail', '状態'],
  probability: ['確度', 'probability', '確率', '見込み'],
  deadline: ['納期', 'deadline', '期限', '期日'],
  revenue: ['報酬', 'revenue', '金額', '売上', '受注額'],
  target_country: ['対象国', 'target_country', '国'],
  client_contact_name: ['クライアント窓口', 'client_contact_name', '窓口'],
  note: ['メモ', 'note', '備考', 'ノート'],
};

function guessMapping(csvHeaders: string[], fields: readonly FieldDefinition[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const field of fields) {
    const aliases = HEADER_ALIASES[field.key] ?? [field.key];
    const matchIdx = csvHeaders.findIndex((h) =>
      aliases.some((a) => h.toLowerCase() === a.toLowerCase()),
    );
    if (matchIdx >= 0) {
      mapping[field.key] = csvHeaders[matchIdx];
    }
  }

  return mapping;
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export default function ImportPage() {
  const [importType, setImportType] = useState<ImportType>('contacts');
  const [csv, setCsv] = useState<ParsedCSV | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [encoding, setEncoding] = useState<string>('UTF-8');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fields = importType === 'contacts' ? CONTACT_FIELDS : DEAL_FIELDS;

  const handleFileRead = useCallback(
    (text: string, name: string) => {
      try {
        const parsed = parseCSV(text);
        if (parsed.headers.length === 0 || parsed.rows.length === 0) {
          setError('CSVファイルにデータがありません');
          return;
        }
        if (parsed.rows.length > 1000) {
          setError('最大1000行までインポートできます');
          return;
        }
        setCsv(parsed);
        setFileName(name);
        setResult(null);
        setError(null);

        // 自動マッピング
        const currentFields = importType === 'contacts' ? CONTACT_FIELDS : DEAL_FIELDS;
        const autoMapping = guessMapping(parsed.headers, currentFields);
        setMapping(autoMapping);
      } catch {
        setError('ファイルの解析に失敗しました');
      }
    },
    [importType],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          handleFileRead(reader.result, file.name);
        }
      };
      reader.readAsText(file, encoding);
    },
    [handleFileRead, encoding],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          handleFileRead(reader.result, file.name);
        }
      };
      reader.readAsText(file, encoding);
    },
    [handleFileRead, encoding],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleMappingChange = useCallback((fieldKey: string, csvHeader: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (csvHeader === '') {
        delete next[fieldKey];
      } else {
        next[fieldKey] = csvHeader;
      }
      return next;
    });
  }, []);

  const handleTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newType = e.target.value as ImportType;
      setImportType(newType);
      setResult(null);
      setError(null);

      // 再マッピング
      if (csv) {
        const newFields = newType === 'contacts' ? CONTACT_FIELDS : DEAL_FIELDS;
        const autoMapping = guessMapping(csv.headers, newFields);
        setMapping(autoMapping);
      }
    },
    [csv],
  );

  const handleImport = useCallback(async () => {
    if (!csv) return;

    // 必須フィールドチェック
    const missingRequired = fields.filter((f) => f.required && !mapping[f.key]);
    if (missingRequired.length > 0) {
      setError(`必須フィールドがマッピングされていません: ${missingRequired.map((f) => f.label).join(', ')}`);
      return;
    }

    setImporting(true);
    setError(null);
    setResult(null);

    try {
      // CSVデータをマッピングに基づいてRecord配列に変換
      const rows = csv.rows.map((row) => {
        const record: Record<string, string> = {};
        for (const field of fields) {
          const csvHeader = mapping[field.key];
          if (csvHeader) {
            const colIdx = csv.headers.indexOf(csvHeader);
            if (colIdx >= 0 && colIdx < row.length) {
              record[field.key] = row[colIdx];
            }
          }
        }
        return record;
      });

      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: importType, rows }),
      });

      const json: { data: ImportResult | null; error: string | null } = await res.json();

      if (!res.ok || json.error) {
        setError(json.error ?? 'インポートに失敗しました');
        return;
      }

      if (json.data) {
        setResult(json.data);
      }
    } catch {
      setError('インポート中にエラーが発生しました');
    } finally {
      setImporting(false);
    }
  }, [csv, fields, mapping, importType]);

  const handleReset = useCallback(() => {
    setCsv(null);
    setFileName(null);
    setMapping({});
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-text-secondary hover:text-text transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold text-text">データインポート</h1>
      </div>

      {/* インポート種別 */}
      <Card>
        <CardContent>
          <div className="max-w-xs">
            <Select
              label="インポート種別"
              options={[
                { value: 'contacts', label: 'コンタクト' },
                { value: 'deals', label: '案件' },
              ]}
              value={importType}
              onChange={handleTypeChange}
            />
          </div>
        </CardContent>
      </Card>

      {/* ファイルアップロード */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text">ファイル選択</h2>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <label className="text-xs font-medium text-text-secondary">文字コード:</label>
            <select
              value={encoding}
              onChange={(e) => setEncoding(e.target.value)}
              className="rounded border border-border bg-surface px-2 py-1 text-xs text-text"
            >
              <option value="UTF-8">UTF-8</option>
              <option value="Shift_JIS">Shift_JIS</option>
              <option value="EUC-JP">EUC-JP</option>
            </select>
          </div>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed p-8 cursor-pointer transition-colors ${
              isDragOver
                ? 'border-accent bg-accent/10'
                : 'border-border hover:border-accent/50'
            }`}
          >
            <Upload className="h-8 w-8 text-text-secondary" />
            <p className="text-sm text-text-secondary">
              CSV / TSVファイルをドラッグ&ドロップ、またはクリックして選択
            </p>
            {fileName && (
              <Badge variant="info">{fileName}</Badge>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </CardContent>
      </Card>

      {/* エラー表示 */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* プレビュー + マッピング */}
      {csv && !result && (
        <>
          {/* 列マッピング */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-text">列マッピング</h2>
              <p className="text-xs text-text-secondary mt-1">
                CSVの列とシステムのフィールドを対応付けてください
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {fields.map((field) => (
                  <Select
                    key={field.key}
                    label={`${field.label}${field.required ? ' *' : ''}`}
                    placeholder="-- 未選択 --"
                    options={csv.headers.map((h) => ({ value: h, label: h }))}
                    value={mapping[field.key] ?? ''}
                    onChange={(e) => handleMappingChange(field.key, e.target.value)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* プレビューテーブル */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text">
                  プレビュー（先頭5行 / 全{csv.rows.length}行）
                </h2>
                <Badge variant="info">{csv.rows.length}行</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHead>
                  <tr>
                    {csv.headers.map((h) => (
                      <TableHeader key={h}>{h}</TableHeader>
                    ))}
                  </tr>
                </TableHead>
                <TableBody>
                  {csv.rows.slice(0, 5).map((row, i) => (
                    <TableRow key={i}>
                      {row.map((cell, j) => (
                        <TableCell key={j} className="max-w-[200px] truncate">
                          {cell || '-'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* アクション */}
          <div className="flex gap-3">
            <Button variant="primary" loading={importing} onClick={handleImport}>
              インポート実行
            </Button>
            <Button variant="secondary" onClick={handleReset}>
              リセット
            </Button>
          </div>
        </>
      )}

      {/* 結果表示 */}
      {result && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text">インポート結果</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <span className="text-sm text-text">
                  成功: <strong>{result.imported}件</strong>
                </span>
              </div>
              {result.errors.length > 0 && (
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                  <span className="text-sm text-text">
                    エラー: <strong>{result.errors.length}件</strong>
                  </span>
                </div>
              )}
            </div>

            {result.errors.length > 0 && (
              <div className="max-h-60 overflow-y-auto">
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeader>行番号</TableHeader>
                      <TableHeader>エラー内容</TableHeader>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {result.errors.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell>{e.row}</TableCell>
                        <TableCell className="text-red-400 whitespace-normal">{e.error}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="secondary" onClick={handleReset}>
                別のファイルをインポート
              </Button>
              <Link href={importType === 'contacts' ? '/contacts' : '/deals'}>
                <Button variant="primary">
                  {importType === 'contacts' ? 'コンタクト一覧' : '案件一覧'}へ
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
