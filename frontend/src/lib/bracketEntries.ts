import type { Match } from '../types/models';
export interface BracketEntry { team: string; label: string; match_id: number | null }
// Include teams in hidden series; removing cards does not remove qualification.
export function qualifiedEntries(matches: Match[], saved: BracketEntry[] = []): BracketEntry[] {
  const first = new Map<string, Match>();
  for (const match of [...matches].sort((a, b) => (a.datetime_utc || '9999').localeCompare(b.datetime_utc || '9999') || a.id - b.id)) {
    for (const team of [match.team1, match.team2]) if (team?.trim() && !/^tbd$/i.test(team.trim()) && !first.has(team)) first.set(team, match);
  }
  const existing = new Set(saved.map(e => e.team));
  return [...saved, ...[...first].filter(([team]) => !existing.has(team)).map(([team, match]) => ({ team, label: '', match_id: match.bracket_hidden ? null : match.id }))];
}
