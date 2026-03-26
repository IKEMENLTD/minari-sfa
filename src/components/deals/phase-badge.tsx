import { Badge } from '@/components/ui/badge';
import type { BadgeVariant } from '@/components/ui/badge';

interface PhaseBadgeProps {
  phaseName: string;
  phaseOrder: number;
  totalPhases?: number;
}

function getPhaseVariant(phaseOrder: number, totalPhases: number): BadgeVariant {
  const ratio = phaseOrder / totalPhases;
  if (ratio <= 0.25) return 'info';       // 序盤: 青
  if (ratio <= 0.5) return 'warning';     // 中盤: 黄
  if (ratio < 1) return 'success';        // 終盤: 緑
  return 'default';                        // 受注: 濃緑（専用スタイル）
}

function PhaseBadge({ phaseName, phaseOrder, totalPhases = 5 }: PhaseBadgeProps) {
  const variant = getPhaseVariant(phaseOrder, totalPhases);
  const isWon = phaseOrder / totalPhases >= 1;

  return (
    <Badge
      variant={variant}
      className={isWon ? 'bg-green-600 text-white' : undefined}
    >
      {phaseName}
    </Badge>
  );
}

export { PhaseBadge };
