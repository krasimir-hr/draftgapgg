import type { Event, League } from '../types/models';

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function getStageName(eventName: string, stageEvents: Event[]): string {
  if (stageEvents.length === 0) return eventName;
  const prefixes = stageEvents.map((e) => e.name.split(' - ')[0]);
  const first = prefixes[0];
  const commonPrefix = prefixes.every((p) => p === first) ? first : '';
  if (commonPrefix && eventName.startsWith(commonPrefix + ' - ')) {
    return eventName.slice(commonPrefix.length + 3);
  }
  return eventName;
}

export function getEventStagePart(league: League, year: number, event: Event, stageEvents: Event[]): string {
  const leagueSlug = slugify(league.short_name ?? league.name);
  let stageSlug = slugify(getStageName(event.name, stageEvents));
  const redundantPrefix = `${leagueSlug}-${year}-`;
  if (stageSlug.startsWith(redundantPrefix)) {
    stageSlug = stageSlug.slice(redundantPrefix.length);
  }
  return stageSlug;
}

export function buildLeagueSlug(league: League, year: number, event: Event, stageEvents: Event[]): string {
  const leagueSlug = slugify(league.short_name ?? league.name);
  return `${leagueSlug}-${year}-${getEventStagePart(league, year, event, stageEvents)}`;
}

export function parseLeagueSlug(slug: string): { leaguePart: string; year: number; stagePart: string } | null {
  const m = slug.match(/^(.+?)-(20\d{2})-(.+)$/);
  if (!m) return null;
  return { leaguePart: m[1], year: Number(m[2]), stagePart: m[3] };
}

export function leagueBasePath(league: League): string {
  return `/leagues/${slugify(league.short_name ?? league.name)}`;
}
