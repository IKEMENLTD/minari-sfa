'use client';

import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <AlertCircle className="h-10 w-10 text-red-500" />
      <h2 className="text-lg font-semibold text-text">エラーが発生しました</h2>
      <p className="text-sm text-text-secondary">予期しないエラーが発生しました。再試行してください。</p>
      <Button variant="secondary" size="sm" onClick={reset}>
        再試行
      </Button>
    </div>
  );
}
