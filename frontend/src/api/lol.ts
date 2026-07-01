import api from './axios';
import type {
  PaginatedResponse,
  Champion,
  ChampionDetail,
  ChampionProfile,
  Item,
  RunePath,
  RunePathDetail,
  SummonerSpell,
} from '../types/models';

// Champions
export const getChampions = (page = 1) =>
  api.get<PaginatedResponse<Champion>>('/api/lol/champions/', { params: { page } });

export const getChampion = (id: number) =>
  api.get<ChampionDetail>(`/api/lol/champions/${id}/`);

// Aggregated competitive profile (core app — stats, best players/regions).
export const getChampionProfile = (id: number, params: Record<string, string> = {}) =>
  api.get<ChampionProfile>(`/api/champions/profile/${id}/`, { params });

// Items
export const getItems = (page = 1) =>
  api.get<PaginatedResponse<Item>>('/api/lol/items/', { params: { page } });

export const getItem = (id: number) =>
  api.get<Item>(`/api/lol/items/${id}/`);

// Rune Paths
export const getRunePaths = (page = 1) =>
  api.get<PaginatedResponse<RunePath>>('/api/lol/rune-paths/', { params: { page } });

export const getRunePath = (id: number) =>
  api.get<RunePathDetail>(`/api/lol/rune-paths/${id}/`);

// Summoner Spells
export const getSummonerSpells = (page = 1) =>
  api.get<PaginatedResponse<SummonerSpell>>('/api/lol/summoner-spells/', { params: { page } });
