import { API_TIMEOUT_MS } from '@/lib/constants';
import { isMockMode } from '@/lib/utils';
import type { JamrollTranscript } from '@/types';

// ---------------------------------------------------------------------------
// Jamroll API 連携
// ---------------------------------------------------------------------------

const JAMROLL_API_BASE = 'https://api.jamroll.jp/v1';

// ---------------------------------------------------------------------------
// モック実装 - サンプル商談データ 3 件
// ---------------------------------------------------------------------------

function getMockTranscripts(): JamrollTranscript[] {
  return [
    {
      id: 'jamroll-mock-001',
      title: '株式会社ABC様 初回ヒアリング',
      date: '2026-03-20',
      participants: ['田中', '佐藤', '山田（ABC）', '鈴木（ABC）'],
      transcript: [
        '田中: 本日はお時間をいただきありがとうございます。まず御社の現在の課題について教えてください。',
        '山田: 現在、営業チームの活動が属人化しており、情報共有がうまくいっていません。',
        '佐藤: なるほど。CRMツールは現在ご利用ですか？',
        '鈴木: Excelで管理していますが、リアルタイム性がなく困っています。',
        '田中: 弊社のソリューションではその課題を解決できます。次回デモをお見せできればと思います。',
        '山田: ぜひお願いします。来週水曜はいかがでしょうか。',
      ].join('\n'),
    },
    {
      id: 'jamroll-mock-002',
      title: '合同会社XYZ様 提案プレゼン',
      date: '2026-03-22',
      participants: ['高橋', '渡辺', '中村（XYZ）'],
      transcript: [
        '高橋: 前回のヒアリングを踏まえ、御社向けの提案をまとめてまいりました。',
        '中村: ありがとうございます。予算感も含めて教えてください。',
        '渡辺: まずは機能面からご説明いたします。ダッシュボードで営業活動を一元管理できます。',
        '中村: 他社製品との違いは何ですか？',
        '高橋: AI による自動分析と、カスタマイズ性の高さが大きな特徴です。',
        '中村: 見積をいただけますか。社内で検討したいと思います。',
      ].join('\n'),
    },
    {
      id: 'jamroll-mock-003',
      title: '社内定例ミーティング',
      date: '2026-03-24',
      participants: ['田中', '高橋', '佐藤', '渡辺'],
      transcript: [
        '田中: それでは今週の営業進捗を共有しましょう。',
        '高橋: XYZ様に提案を実施しました。見積依頼をいただいています。',
        '佐藤: ABC様は来週デモ予定です。',
        '渡辺: 新規リードが3件入っています。来週アポ取りします。',
        '田中: 了解しました。来週も頑張りましょう。',
      ].join('\n'),
    },
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Jamroll から新しい議事録を取得する
 * @param from - 取得開始日 (YYYY-MM-DD) optional
 * @param to - 取得終了日 (YYYY-MM-DD) optional
 */
export async function fetchNewTranscripts(from?: string, to?: string): Promise<JamrollTranscript[]> {
  if (isMockMode()) {
    const mocks = getMockTranscripts();
    if (!from && !to) return mocks;
    return mocks.filter((t) => {
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      return true;
    });
  }

  const apiKey = process.env.JAMROLL_API_KEY;
  if (!apiKey) {
    throw new Error('環境変数 JAMROLL_API_KEY が設定されていません');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    // from/to指定時は日付範囲で取得（statusフィルタなし）、未指定時は従来通り新規のみ
    let url: string;
    if (from || to) {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      url = `${JAMROLL_API_BASE}/transcripts?${params.toString()}`;
    } else {
      url = `${JAMROLL_API_BASE}/transcripts?status=new`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Jamroll API エラー詳細 (${response.status}):`, errorBody);
      throw new Error(`Jamroll API エラー (${response.status}): リクエストに失敗しました`);
    }

    const data = (await response.json()) as { transcripts: JamrollTranscript[] };
    return data.transcripts;
  } finally {
    clearTimeout(timeoutId);
  }
}
