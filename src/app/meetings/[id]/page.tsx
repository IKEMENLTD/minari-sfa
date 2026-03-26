import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { MeetingDetailView } from '@/components/meetings/meeting-detail';
import type { MeetingDetail, ApiResult } from '@/types';

async function getMeeting(id: string): Promise<MeetingDetail | null> {
  try {
    // NOTE: 本番環境では必ず NEXT_PUBLIC_BASE_URL を https:// で設定すること
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/meetings/${id}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json: ApiResult<MeetingDetail> = await res.json();
    if (json.error) return null;
    return json.data;
  } catch {
    return null;
  }
}

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const meeting = await getMeeting(id);

  if (!meeting) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
        <p className="text-sm">議事録が見つかりませんでした</p>
        <Link href="/meetings" className="mt-3 text-sm text-accent hover:underline">
          一覧に戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* パンくず */}
      <nav className="flex items-center gap-1 text-sm text-text-secondary">
        <Link href="/meetings" className="hover:text-accent">
          議事録
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-text">
          {meeting.company?.name || meeting.ai_estimated_company || '詳細'}
        </span>
      </nav>

      <MeetingDetailView meeting={meeting} />
    </div>
  );
}
