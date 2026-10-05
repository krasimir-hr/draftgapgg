import type { Match } from '../types/models';

// Imported matches arrive newest-first. Unwired bracket columns must follow
// the named rounds instead; round dates can overlap in double elimination.
export function orderedBracketTabs(matches: Match[]): string[] {
  const firstDates = new Map<string, string>();
  for (const m of matches) {
    if (m.bracket_col != null) continue;
    const tab = m.tab || 'Stage 1';
    const date = m.datetime_utc || '9999';
    if (!firstDates.has(tab) || date < firstDates.get(tab)!) firstDates.set(tab, date);
  }
  const rank = (tab: string): number | null => {
    const round = tab.match(/\bround\s+(\d+)\b/i);
    if (round) return Number(round[1]);
    if (/quarterfinal/i.test(tab)) return 1000;
    if (/semifinal/i.test(tab)) return 1001;
    if (/\b(?:grand\s+)?finals?\b/i.test(tab)) return 1002;
    return null;
  };
  return [...firstDates.keys()].sort((a, b) => {
    const ar = rank(a) ?? 0, br = rank(b) ?? 0;
    if (ar !== br) return ar - br;
    return firstDates.get(a)!.localeCompare(firstDates.get(b)!) || a.localeCompare(b, undefined, { numeric: true });
  });
}
