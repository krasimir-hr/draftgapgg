import api from './axios';
import type {
  PaginatedResponse,
  League,
  Event,
  Organization,
  Player,
  TeamRoster,
  TeamRosterDetail,
  Match,
  MatchDetail,
  GameListItem,
  GameDetail,
  PlayerPerformanceCompact,
  StandingsEntry,
  EventChampionStats,
  EventPlayerStats,
  Overview,
  PlayerProfile,
  TeamProfile,
} from '../types/models';

// ── Leagues ──
export const getLeagues = (params: Record<string, string | number> = {}) =>
  api.get<PaginatedResponse<League>>('/api/leagues/', { params });

export const getLeague = (id: number) =>
  api.get<League>(`/api/leagues/${id}/`);

// ── Events ──
export const getEvents = (params: Record<string, string | number> = {}) =>
  api.get<PaginatedResponse<Event>>('/api/events/', { params });

export const getEvent = (id: number) =>
  api.get<Event>(`/api/events/${id}/`);

export const getEventStandings = (id: number) =>
  api.get<StandingsEntry[]>(`/api/events/${id}/standings/`);

export const getEventPlayers = (id: number) =>
  api.get<EventPlayerStats[]>(`/api/events/${id}/players/`);

export const getEventChampions = (id: number) =>
  api.get<EventChampionStats[]>(`/api/events/${id}/champions/`);

// ── Organizations ──
export const getOrganizations = (page = 1) =>
  api.get<PaginatedResponse<Organization>>('/api/organizations/', { params: { page } });

// ── Players ──
export const getPlayers = (page = 1) =>
  api.get<PaginatedResponse<Player>>('/api/players/', { params: { page } });

export const getPlayerProfile = (
  name: string,
  params: { year?: number | string; event?: number | string } = {},
) =>
  api.get<PlayerProfile>(`/api/players/profile/${encodeURIComponent(name)}/`, { params });

// ── Teams ──
export const getTeamProfile = (
  name: string,
  params: { year?: number | string; event?: number | string } = {},
) =>
  api.get<TeamProfile>(`/api/teams/profile/${encodeURIComponent(name)}/`, { params });

// ── Rosters ──
export const getRosters = (page = 1) =>
  api.get<PaginatedResponse<TeamRoster>>('/api/rosters/', { params: { page } });

export const getEventRosters = (eventId: number) =>
  api.get<PaginatedResponse<TeamRoster>>('/api/rosters/', { params: { event: eventId, page_size: 100 } });

export const getRoster = (id: number) =>
  api.get<TeamRosterDetail>(`/api/rosters/${id}/`);

// ── Matches ──
export const getMatches = (params: Record<string, string | number> = {}) =>
  api.get<PaginatedResponse<Match>>('/api/matches/', { params });

export const getMatch = (id: number) =>
  api.get<MatchDetail>(`/api/matches/${id}/`);

// ── Games ──
export const getGames = (params: Record<string, string | number> = {}) =>
  api.get<PaginatedResponse<GameListItem>>('/api/games/', { params });

export const getGame = (id: number) =>
  api.get<GameDetail>(`/api/games/${id}/`);

// ── Player Performances ──
export const getPerformances = (params: Record<string, string | number> = {}) =>
  api.get<PaginatedResponse<PlayerPerformanceCompact>>('/api/performances/', { params });

// ── Overview ──
export const getOverview = () =>
  api.get<Overview>('/api/overview/');
