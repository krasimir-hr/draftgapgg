import type { Match } from '../types/models';
import { orderedBracketTabs } from './bracketRounds';

export type PlayoffLane = 'upper' | 'lower' | 'final' | 'placement';
export interface PlayoffMatch {
  match: Match;
  lane: PlayoffLane;
  winnerNext?: { matchId: number; round: string; lane: PlayoffLane };
  loserNext?: { matchId: number; round: string; lane: PlayoffLane };
}
export interface PlayoffRound { key: string; label: string; matches: PlayoffMatch[] }

// Arrange feeders beside their destinations without changing chronological detail views.
export function orderPlayoffRounds(rounds: PlayoffRound[]): PlayoffRound[] {
  const arranged = rounds.map(r => ({ ...r, matches: [...r.matches] }));
  for (let i = arranged.length - 2; i >= 0; i--) {
    const positions = new Map(arranged.slice(i + 1).flatMap((r, col) => r.matches.map((e, row) => [e.match.id, { col, row }] as const)));
    arranged[i].matches.sort((a, b) => {
      if (a.match.bracket_order != null || b.match.bracket_order != null) return (a.match.bracket_order ?? 9999) - (b.match.bracket_order ?? 9999);
      if (a.lane !== b.lane || !a.winnerNext || !b.winnerNext) return 0;
      const toA = positions.get(a.winnerNext.matchId), toB = positions.get(b.winnerNext.matchId);
      return toA && toB && toA.col === toB.col ? toA.row - toB.row : 0;
    });
  }
  return arranged;
}
const realTeam = (name: string) => !!name?.trim() && !/^tbd$/i.test(name.trim());
const finalMatch = (m: Match) => m.is_final || /^(?:grand\s+)?finals?$/i.test(m.tab?.trim() ?? '');
const placementMatch = (m: Match) => /\b(?:third[ -]?place|3rd[ -]?place|bronze|placement)\b/i.test(m.tab ?? '');
const chronological = (a: Match, b: Match) => (a.datetime_utc || '9999').localeCompare(b.datetime_utc || '9999') || a.id - b.id;

export function buildPlayoffs(allMatches: Match[]) {
  const matches = allMatches.filter(m => !m.bracket_hidden);
  const chronologicalMatches = [...matches].sort(chronological);
  const losses = new Map<string, number>();
  const lossesBefore = new Map<number, [number, number]>();
  let doubleElimination = matches.some(m => m.is_lower_bracket);
  for (const m of chronologicalMatches) {
    const before: [number, number] = [losses.get(m.team1) ?? 0, losses.get(m.team2) ?? 0];
    lossesBefore.set(m.id, before);
    // A recorded loser playing again outside a final confirms a second path.
    // Undated fixtures cannot establish progression from previous results.
    if (m.bracket_col == null && m.datetime_utc && !finalMatch(m) && !placementMatch(m) && before.every(n => n > 0)) doubleElimination = true;
    if (m.datetime_utc && m.winner != null) {
      const loser = m.winner === 1 ? m.team2 : m.team1;
      if (realTeam(loser)) losses.set(loser, (losses.get(loser) ?? 0) + 1);
    }
  }
  const fallbackTabs = orderedBracketTabs(matches);
  const columns = [...new Set(matches.map(m => m.bracket_col).filter((n): n is number => n != null))].sort((a,b) => a-b);
  const keys = [...columns.map(n => `column:${n}`), ...fallbackTabs.map(t => `tab:${t}`)];
  const keyOf = (m: Match) => m.bracket_col != null ? `column:${m.bracket_col}` : `tab:${m.tab || 'Stage 1'}`;
  const entries = chronologicalMatches.map((match): PlayoffMatch => ({
    match,
    lane: placementMatch(match) ? 'placement' : (match.is_final || (match.bracket_col == null && finalMatch(match))) ? 'final' : match.is_lower_bracket || (doubleElimination && match.bracket_col == null && !!match.datetime_utc && lossesBefore.get(match.id)!.every(n => n > 0)) ? 'lower' : 'upper',
  }));
  const rounds: PlayoffRound[] = keys.map((key, i) => {
    const entriesInRound = entries.filter(e => keyOf(e.match) === key);
    const labels = [...new Set(entriesInRound.map(e => e.match.tab).filter(Boolean))];
    return { key, label: labels.length === 1 ? labels[0] : `Round ${i + 1}`, matches: entriesInRound.sort((a, b) => (a.match.bracket_order ?? 9999) - (b.match.bracket_order ?? 9999)) };
  });
  const roundOf = new Map(rounds.flatMap(r => r.matches.map(e => [e.match.id, r.label] as const)));
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const destination = (next: PlayoffMatch | undefined) => next ? { matchId: next.match.id, round: roundOf.get(next.match.id)!, lane: next.lane } : undefined;
    const wired = entries.find(next => next.match.id === e.match.next_match);
    if (wired) e.winnerNext = destination(wired);
    const loserWired = entries.find(next => next.match.id === e.match.loser_next_match);
    if (loserWired) e.loserNext = destination(loserWired);
    if (e.match.winner == null || !e.match.datetime_utc) continue;
    const winner = e.match.winner === 1 ? e.match.team1 : e.match.team2;
    const loser = e.match.winner === 1 ? e.match.team2 : e.match.team1;
    const nextFor = (team: string) => realTeam(team) ? entries.slice(i + 1).find(next => !!next.match.datetime_utc && (next.match.team1 === team || next.match.team2 === team)) : undefined;
    if (e.match.bracket_col == null) e.winnerNext ??= destination(nextFor(winner));
    if (e.match.bracket_col == null) e.loserNext ??= destination(nextFor(loser));
  }
  const finals = entries.filter(e => e.lane === 'final');
  const decidedFinal = finals.length === 1 && finals[0].match.winner != null ? finals[0].match : null;
  const champion = decidedFinal ? (decidedFinal.winner === 1 ? decidedFinal.team1 : decidedFinal.team2) : null;
  const teams = [...new Set(matches.flatMap(m => [m.team1, m.team2]).filter(realTeam))].sort();
  return { rounds, doubleElimination, champion, teams };
}
