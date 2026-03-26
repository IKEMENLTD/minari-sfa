'use client';

import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

export default function DealDetailError() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertCircle className="h-4 w-4 shrink-0" />
        案件の読み込み中にエラーが発生しました
      </div>
      <Link href="/deals" className="text-sm text-accent hover:underline">
        一覧に戻る
      </Link>
    </div>
  );
}
