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
} from '../types/models';

// ── Leagues ──
export const getLeagues = (page = 1) =>
  api.get<PaginatedResponse<League>>('/api/leagues/', { params: { page } });

// ── Events ──
export const getEvents = (params: Record<string, string | number> = {}) =>
  api.get<PaginatedResponse<Event>>('/api/events/', { params });

// ── Organizations ──
export const getOrganizations = (page = 1) =>
  api.get<PaginatedResponse<Organization>>('/api/organizations/', { params: { page } });

// ── Players ──
export const getPlayers = (page = 1) =>
  api.get<PaginatedResponse<Player>>('/api/players/', { params: { page } });

// ── Rosters ──
export const getRosters = (page = 1) =>
  api.get<PaginatedResponse<TeamRoster>>('/api/rosters/', { params: { page } });

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
