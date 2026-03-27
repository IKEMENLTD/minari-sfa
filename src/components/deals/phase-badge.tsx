import { Badge } from '@/components/ui/badge';
import type { BadgeVariant } from '@/components/ui/badge';

interface PhaseBadgeProps {
  phaseName: string;
  phaseOrder: number;
  totalPhases?: number;
}

const PHASE_ORDER_PENDING = 91;
const PHASE_ORDER_LOST = 92;
const PHASE_ORDER_CHURNED = 93;

function getPhaseVariant(phaseOrder: number, totalPhases: number): BadgeVariant {
  if (phaseOrder === PHASE_ORDER_PENDING) return 'default';
  if (phaseOrder === PHASE_ORDER_LOST) return 'danger';
  if (phaseOrder === PHASE_ORDER_CHURNED) return 'danger';
  const ratio = phaseOrder / totalPhases;
  if (ratio <= 0.25) return 'info';       // 序盤: 青
  if (ratio <= 0.5) return 'warning';     // 中盤: 黄
  if (ratio < 1) return 'success';        // 終盤: 緑
  return 'default';                        // 受注: 濃緑（専用スタイル）
}

function PhaseBadge({ phaseName, phaseOrder, totalPhases = 5 }: PhaseBadgeProps) {
  const variant = getPhaseVariant(phaseOrder, totalPhases);
  const isWon =
    phaseOrder !== PHASE_ORDER_PENDING &&
    phaseOrder !== PHASE_ORDER_LOST &&
    phaseOrder !== PHASE_ORDER_CHURNED &&
    phaseOrder / totalPhases >= 1;
  const isChurned = phaseOrder === PHASE_ORDER_CHURNED;

  return (
    <Badge
      variant={variant}
      className={
        isWon
          ? 'bg-green-600 text-white'
          : isChurned
          ? 'bg-red-700 text-white'
          : undefined
      }
    >
      {phaseName}
    </Badge>
  );
}

export { PhaseBadge };
