import { Badge } from '@/components/ui/badge';
import type { BadgeVariant } from '@/components/ui/badge';

interface PhaseBadgeProps {
  phaseName: string;
  phaseOrder: number;
  totalPhases?: number;
}

function getPhaseVariant(phaseOrder: number, totalPhases: number): BadgeVariant {
  const ratio = phaseOrder / totalPhases;
  if (ratio <= 0.25) return 'info';
  if (ratio <= 0.5) return 'warning';
  if (ratio <= 0.75) return 'success';
  return 'success';
}

function PhaseBadge({ phaseName, phaseOrder, totalPhases = 5 }: PhaseBadgeProps) {
  const variant = getPhaseVariant(phaseOrder, totalPhases);
  return <Badge variant={variant}>{phaseName}</Badge>;
}

export { PhaseBadge };
