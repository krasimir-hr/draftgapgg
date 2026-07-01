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
  RatingEntry,
  EventStats,
  EventHighlights,
  Overview,
  HomeMatches,
  HomeStandings,
  PlayerProfile,
  TeamProfile,
  H2HMatch,
  ChampionStats,
} from '../types/models';

// Leagues
export const getLeagues = (params: Record<string, string | number> = {}) =>
  api.get<PaginatedResponse<League>>('/api/leagues/', { params });

export const getLeague = (id: number) =>
  api.get<League>(`/api/leagues/${id}/`);

// Events
export const getEvents = (params: Record<string, string | number> = {}) =>
  api.get<PaginatedResponse<Event>>('/api/events/', { params });

export const getEvent = (id: number) =>
  api.get<Event>(`/api/events/${id}/`);

export const getEventStandings = (id: number, params: Record<string, string | number> = {}) =>
  api.get<StandingsEntry[]>(`/api/events/${id}/standings/`, { params });

export const getEventStats = (id: number) =>
  api.get<EventStats>(`/api/events/${id}/stats/`);

export const getEventHighlights = (id: number) =>
  api.get<EventHighlights>(`/api/events/${id}/highlights/`);

export const getEventPlayers = (id: number, params: Record<string, string | number> = {}) =>
  api.get<EventPlayerStats[]>(`/api/events/${id}/players/`, { params });

export const getEventChampions = (id: number, params: Record<string, string | number> = {}) =>
  api.get<EventChampionStats[]>(`/api/events/${id}/champions/`, { params });

export const getEventRatings = (id: number, params: Record<string, string> = {}) =>
  api.get<RatingEntry[]>(`/api/events/${id}/ratings/`, { params });

// Champion stats
export const getChampionStats = (limit = 6) =>
  api.get<ChampionStats>('/api/champion-stats/', { params: { limit } });

// Organizations
export const getOrganizations = (page = 1) =>
  api.get<PaginatedResponse<Organization>>('/api/organizations/', { params: { page } });

// Players
export const getPlayers = (page = 1) =>
  api.get<PaginatedResponse<Player>>('/api/players/', { params: { page } });

export const getPlayerProfile = (
  name: string,
  params: { year?: number | string; event?: number | string } = {},
) =>
  api.get<PlayerProfile>(`/api/players/profile/${encodeURIComponent(name)}/`, { params });

// Teams
export const getTeamProfile = (
  name: string,
  params: { year?: number | string; event?: number | string } = {},
) =>
  api.get<TeamProfile>(`/api/teams/profile/${encodeURIComponent(name)}/`, { params });

// Rosters
export const getRosters = (page = 1) =>
  api.get<PaginatedResponse<TeamRoster>>('/api/rosters/', { params: { page } });

export const getEventRosters = (eventId: number) =>
  api.get<PaginatedResponse<TeamRoster>>('/api/rosters/', { params: { event: eventId, page_size: 100 } });

export const getRoster = (id: number) =>
  api.get<TeamRosterDetail>(`/api/rosters/${id}/`);

// Matches
export const getMatches = (params: Record<string, string | number> = {}) =>
  api.get<PaginatedResponse<Match>>('/api/matches/', { params });

export const getMatch = (id: number) =>
  api.get<MatchDetail>(`/api/matches/${id}/`);

export const getMatchH2H = (id: number) =>
  api.get<{ results: H2HMatch[] }>(`/api/matches/${id}/h2h/`);

export const patchMatchBracket = (
  id: number,
  data: { bracket_col?: number | null; bracket_order?: number | null; next_match?: number | null; is_lower_bracket?: boolean; is_final?: boolean },
) => api.patch<Match>(`/api/matches/${id}/bracket/`, data);

export const renameColumn = (
  eventId: number,
  bracketCol: number,
  tab: string,
  opts?: { stageId?: number; isLower?: boolean },
) => api.post<{ ok: boolean }>('/api/matches/rename-column/', {
  event: eventId,
  bracket_col: bracketCol,
  tab,
  ...(opts?.stageId != null && { stage: opts.stageId }),
  ...(opts?.isLower != null && { is_lower_bracket: opts.isLower }),
});

// Games
export const getGames = (params: Record<string, string | number> = {}) =>
  api.get<PaginatedResponse<GameListItem>>('/api/games/', { params });

export const getGame = (id: number) =>
  api.get<GameDetail>(`/api/games/${id}/`);

// Player Performances
export const getPerformances = (params: Record<string, string | number> = {}) =>
  api.get<PaginatedResponse<PlayerPerformanceCompact>>('/api/performances/', { params });

// Overview
export const getOverview = () =>
  api.get<Overview>('/api/overview/');

// Home match feed (flat, date-ordered window of recent + upcoming matches)
export const getHomeMatches = () =>
  api.get<HomeMatches>('/api/home-matches/');

// Top-3 standings per league for the home side rail
export const getHomeStandings = () =>
  api.get<HomeStandings>('/api/home-standings/');
