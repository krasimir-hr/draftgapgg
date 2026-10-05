import { getEvents, getMatches, getEventRosters } from '../api/core';
import type { LoaderFunctionArgs } from 'react-router-dom';
import { createWorldsDemo } from '../data/worldsDemo';
import type { Event, Match, PaginatedResponse, TeamRoster } from '../types/models';

export type WorldsTeam = { name: string; shortName: string; logo: string | null; region: string };
export type WorldsMatch = Match & { predictionStage: string };
export interface WorldsData { events: Event[]; matches: WorldsMatch[]; teams: WorldsTeam[]; demo?: boolean }

async function allPages<T>(fetchPage: (page: number) => Promise<{ data: PaginatedResponse<T> }>): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const { data } = await fetchPage(page);
    items.push(...data.results);
    if (!data.next) return items;
  }
}

export function isWorlds2026(event: Event): boolean {
  return event.year === 2026 && /^(worlds|world championship)$/i.test(event.league.short_name || event.league.name);
}

export function predictionStage(name: string, type?: string): string {
  if (type === 'play_in' || /play[ -]?ins?/i.test(name)) return 'Play-In';
  if (type === 'swiss' || /swiss/i.test(name)) return 'Swiss Stage';
  if (type === 'playoff' || /knockout|playoffs?|quarterfinal|semifinal|final/i.test(name)) return 'Knockout';
  return 'Other matches';
}

export function canPickMatch(match: Match, now: number): boolean {
  const knownTeam = (name: string) => !!name.trim() && !/^(tbd|tba|unknown|to be (decided|determined|announced))\b|^(winner|loser) (of |match )/i.test(name.trim());
  const start = match.datetime_utc ? Date.parse(match.datetime_utc) : NaN;
  return match.winner == null && knownTeam(match.team1) && knownTeam(match.team2) && Number.isFinite(start) && start > now;
}

export function rosterTeams(rosters: TeamRoster[]): WorldsTeam[] {
  return [...new Map(rosters.map((roster) => {
    const name = roster.name || roster.org.name;
    return [name, { name, shortName: roster.org.short_name || name, logo: roster.org.logo, region: roster.org.region || 'Teams' }];
  })).values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function worldsPredictionsLoader({ request }: LoaderFunctionArgs): Promise<WorldsData> {
  if (new URL(request.url).searchParams.get('demo') === '1') return createWorldsDemo();
  const events = (await allPages((page) => getEvents({ year: 2026, page_size: 100, page }))).filter(isWorlds2026);
  if (!events.length) return { events: [], matches: [], teams: [] };
  const [rosters, matchGroups] = await Promise.all([
    Promise.all(events.map((event) => allPages((page) => getEventRosters(event.id, page)))),
    Promise.all(events.map(async (event) => {
      const matches = await allPages((page) => getMatches({ event: event.id, page_size: 100, page }));
      // MatchListSerializer does not expose stage IDs. Resolve membership through
      // the existing stage filter rather than guessing from round labels alone.
      const memberships = await Promise.all(event.stages.map(async (stage) => {
        const stageMatches = await allPages((page) => getMatches({ event: event.id, stage: stage.id, page_size: 100, page }));
        return stageMatches.map((match) => [match.id, predictionStage(stage.name, stage.type)] as const);
      }));
      const stageById = new Map(memberships.flat());
      return matches.map((match) => ({ ...match, predictionStage: stageById.get(match.id) ?? predictionStage(`${event.name} ${match.tab}`) }));
    })),
  ]);
  return {
    events,
    matches: [...new Map(matchGroups.flat().map((match) => [match.id, match])).values()]
      .sort((a, b) => (a.datetime_utc || '9999').localeCompare(b.datetime_utc || '9999') || a.id - b.id),
    teams: rosterTeams(rosters.flat()),
  };
}
