export type ConnectionKind = 'winner' | 'loser';
export interface ConnectionPosition { col: number; lane: 'upper' | 'lower' | 'final' }
// Use a left gutter and enter the destination from the left with a right-pointing arrow.
export function leftConnectionPath(from: { x: number; y: number; top: number }, to: { x: number; y: number; top: number }, kind: ConnectionKind) {
  const gutter = from.x - 9;
  if (kind === 'loser' && Math.abs(to.x - from.x) < 70) return `M ${from.x} ${from.y} H ${gutter} V ${to.y} H ${to.x}`;
  const track = kind === 'loser' ? to.top - 12 : from.top - 12;
  const entrance = to.x - 12;
  return `M ${from.x} ${from.y} H ${gutter} V ${track} H ${entrance} V ${to.y} H ${to.x}`;
}
export function canConnect(from: ConnectionPosition | undefined, to: ConnectionPosition | undefined, kind: ConnectionKind, sameMatch = false) {
  if (!from || !to || sameMatch) return false;
  if (kind === 'winner') return to.col > from.col;
  return to.lane === 'lower' && (to.col > from.col || (to.col === from.col && from.lane === 'upper'));
}
