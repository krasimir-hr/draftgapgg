export type ConnectionKind = 'winner' | 'loser';
export interface ConnectionPosition { col: number; lane: 'upper' | 'lower' | 'final' }
export function canConnect(from: ConnectionPosition | undefined, to: ConnectionPosition | undefined, kind: ConnectionKind, sameMatch = false) {
  if (!from || !to || sameMatch) return false;
  if (kind === 'winner') return to.col > from.col;
  return to.lane === 'lower' && (to.col > from.col || (to.col === from.col && from.lane === 'upper'));
}
