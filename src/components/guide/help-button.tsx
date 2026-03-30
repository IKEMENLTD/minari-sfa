'use client';

import { usePathname } from 'next/navigation';
import { HelpCircle } from 'lucide-react';
import { useGuide } from './guide-provider';

export function HelpButton() {
  const { isActive, startTour } = useGuide();
  const pathname = usePathname();

  if (isActive) return null;
  if (pathname === '/login') return null;

  return (
    <button
      type="button"
      onClick={startTour}
      aria-label="ヘルプ・ガイドツアー"
      data-guide="help-fab"
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[9990] w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] shadow-lg hover:shadow-xl transition-all flex items-center justify-center"
    >
      <HelpCircle size={24} />
    </button>
  );
}
