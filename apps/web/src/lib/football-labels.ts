import type { Position } from '@fantasy/domain';

export const positionNames: Record<Position, { ar: string; en: string }> = {
  GK: { ar: 'حراسة', en: 'GK' },
  DEF: { ar: 'دفاع', en: 'DEF' },
  MID: { ar: 'وسط', en: 'MID' },
  FWD: { ar: 'هجوم', en: 'FWD' },
};
