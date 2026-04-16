import api from './axios';
import type {
  PaginatedResponse,
  Champion,
  ChampionDetail,
  Item,
  RunePath,
  RunePathDetail,
  SummonerSpell,
} from '../types/models';

// ── Champions ──
export const getChampions = (page = 1) =>
  api.get<PaginatedResponse<Champion>>('/api/lol/champions/', { params: { page } });

export const getChampion = (id: number) =>
  api.get<ChampionDetail>(`/api/lol/champions/${id}/`);

// ── Items ──
export const getItems = (page = 1) =>
  api.get<PaginatedResponse<Item>>('/api/lol/items/', { params: { page } });

export const getItem = (id: number) =>
  api.get<Item>(`/api/lol/items/${id}/`);

// ── Rune Paths ──
export const getRunePaths = (page = 1) =>
  api.get<PaginatedResponse<RunePath>>('/api/lol/rune-paths/', { params: { page } });

export const getRunePath = (id: number) =>
  api.get<RunePathDetail>(`/api/lol/rune-paths/${id}/`);

// ── Summoner Spells ──
export const getSummonerSpells = (page = 1) =>
  api.get<PaginatedResponse<SummonerSpell>>('/api/lol/summoner-spells/', { params: { page } });
