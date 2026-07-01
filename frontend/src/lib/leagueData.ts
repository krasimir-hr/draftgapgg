import {
  getMatches, getEventStandings, getEventHighlights, getEventPlayers, getEventChampions, getEventRatings, getEventRosters,
} from '../api/core';
import type {
  Match, StandingsEntry, EventHighlights, EventPlayerStats, EventChampionStats, RatingEntry,
} from '../types/models';
import { bracketKey, type LeagueView, type BracketNeed } from './leagueView';

export interface OverviewData {
  upcoming: Match[];
  recent: Match[];
  standings: StandingsEntry[];
  highlights: EventHighlights | null;
}

export interface LeagueTabData {
  overview?: OverviewData;
  matches?: Match[];
  standings?: StandingsEntry[];
  players?: EventPlayerStats[];
  champions?: EventChampionStats[];
  ratings?: RatingEntry[];
}

export interface TeamMeta {
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
}

export interface RailsData {
  upcoming: Match[];
  recent: Match[];
}

export async function loadRails(eventIds: number[]): Promise<RailsData> {
  if (!eventIds.length) return { upcoming: [], recent: [] };
  const now = new Date();
  const key = eventIds.join(',');
  const [upRes, reRes] = await Promise.all([
    getMatches({ event__in: key, has_result: 'false', page_size: 20 }),
    getMatches({ event__in: key, has_result: 'true', page_size: 20 }),
  ]);
  const upcoming = [...upRes.data.results]
    .filter((m) => m.datetime_utc && new Date(m.datetime_utc) > now)
    .sort((a, b) => (a.datetime_utc ?? '').localeCompare(b.datetime_utc ?? ''))
    .slice(0, 8);
  const recent = [...reRes.data.results]
    .sort((a, b) => (b.datetime_utc ?? '').localeCompare(a.datetime_utc ?? ''))
    .slice(0, 8);
  return { upcoming, recent };
}

// Matches for every bracket view the active tab can show, keyed by `bracketKey`.
export async function loadBracketMatches(needs: BracketNeed[]): Promise<Record<string, Match[]>> {
  const entries = await Promise.all(
    needs.map(async (n) => {
      const params: Record<string, string | number> = { event: n.eventId, page_size: 100 };
      if (n.stageId != null) params.stage = n.stageId;
      const matches = await getMatches(params).then((r) => r.data.results).catch(() => []);
      return [bracketKey(n.eventId, n.stageId), matches] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export async function loadTeamMeta(eventId: number): Promise<TeamMeta> {
  const teamLogos: Record<string, string | null> = {};
  const teamShortNames: Record<string, string> = {};
  try {
    const res = await getEventRosters(eventId);
    for (const r of res.data.results) {
      if (!r.name) continue;
      teamLogos[r.name] = r.org?.logo ?? null;
      if (r.org?.short_name) teamShortNames[r.name] = r.org.short_name;
    }
  } catch { /* non-critical */ }
  return { teamLogos, teamShortNames };
}

async function loadOverview(eventIds: number[], eventId: number): Promise<OverviewData> {
  const now = new Date();
  const eventParam = eventIds.join(',') || String(eventId);
  const [upRes, resRes, standRes, hlRes] = await Promise.all([
    getMatches({ event__in: eventParam, has_result: 'false', page_size: 50 }),
    getMatches({ event__in: eventParam, has_result: 'true', page_size: 20 }),
    getEventStandings(eventId).catch(() => ({ data: [] as StandingsEntry[] })),
    getEventHighlights(eventId).catch(() => ({ data: null as EventHighlights | null })),
  ]);
  const upcoming = [...upRes.data.results]
    .filter((m) => m.datetime_utc && new Date(m.datetime_utc) > now)
    .sort((a, b) => (a.datetime_utc ?? '').localeCompare(b.datetime_utc ?? ''))
    .slice(0, 5);
  const recent = [...resRes.data.results]
    .sort((a, b) => (b.datetime_utc ?? '').localeCompare(a.datetime_utc ?? ''))
    .slice(0, 5);
  return { upcoming, recent, standings: (standRes.data ?? []).slice(0, 10), highlights: hlRes.data };
}

// Data for the active leaf tab. Bracket tabs are handled by loadBracketMatches.
export async function loadLeagueTab(view: LeagueView, eventId: number): Promise<LeagueTabData> {
  switch (view.activeTab) {
    case 'Overview':
      return { overview: await loadOverview(view.overviewEventIds, eventId) };
    case 'Matches':
      return { matches: (await getMatches({ event: eventId, page_size: 500 })).data.results };
    case 'Team Stats':
      return { standings: await getEventStandings(eventId).then((r) => r.data).catch(() => []) };
    case 'Players': {
      // Merge scoreboard stats with performance ratings.
      const [players, ratings] = await Promise.all([
        getEventPlayers(eventId).then((r) => r.data).catch(() => []),
        getEventRatings(eventId).then((r) => r.data).catch(() => []),
      ]);
      return { players, ratings };
    }
    case 'Champions':
      return { champions: await getEventChampions(eventId).then((r) => r.data).catch(() => []) };
    case 'Ratings':
      return { ratings: await getEventRatings(eventId).then((r) => r.data).catch(() => []) };
    default:
      return {};
  }
}
