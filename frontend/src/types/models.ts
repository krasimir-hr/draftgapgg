/* ───────────────────────────────────────────────
   Shared API response / model types
   ─────────────────────────────────────────────── */

// DRF PageNumberPagination envelope
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ── lol app ──

export interface Champion {
  id: number;
  riot_id: string;
  key: number;
  name: string;
  title: string;
  tags: string[];
  resource_type: string;
  image: string;
  patch: string;
  icon_url: string;
}

export interface ChampionAbility {
  id: number;
  ability_type: string;
  riot_id: string;
  name: string;
  description: string;
  cooldown: number[];
  cost: number[];
  max_rank: number;
  image: string;
}

export interface ChampionDetail extends Champion {
  abilities: ChampionAbility[];
}

export interface Item {
  id: number;
  riot_id: number;
  name: string;
  description: string;
  plaintext: string;
  gold_total: number;
  gold_base: number;
  purchasable: boolean;
  tags: string[];
  image: string;
  patch: string;
  icon_url: string;
}

export interface RunePath {
  id: number;
  riot_id: number;
  name: string;
  icon: string;
  patch: string;
}

export interface Rune {
  id: number;
  riot_id: number;
  name: string;
  row: number;
  short_description: string;
  long_description: string;
  icon: string;
  patch: string;
}

export interface RunePathDetail extends RunePath {
  runes: Rune[];
}

export interface SummonerSpell {
  id: number;
  riot_id: string;
  key: number;
  name: string;
  description: string;
  cooldown: number;
  image: string;
  patch: string;
}

// ── core app ──

export interface League {
  id: number;
  name: string;
  short_name: string | null;
  logo: string | null;
}

export interface Event {
  id: number;
  name: string;
  league: League;
  year: number | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  logo: string | null;
  leaguepedia_page: string | null;
}

export interface Organization {
  id: number;
  name: string;
  short_name: string;
  logo: string | null;
  leaguepedia_page: string | null;
  region: string | null;
}

export interface Player {
  id: number;
  name: string;
  real_name: string | null;
  image: string | null;
  nationality: string | null;
  birthdate: string | null;
  age: string | null;
}

export interface RosterPlayer {
  id: number;
  player: Player;
  role: string;
  is_starter: boolean;
}

export interface TeamRoster {
  id: number;
  name: string | null;
  org: Organization;
  event: number;
}

export interface TeamRosterDetail extends Omit<TeamRoster, 'event'> {
  players: RosterPlayer[];
  event: Event;
}

export interface Match {
  id: number;
  match_id: string;
  event: number;
  team1: string;
  team2: string;
  winner: number | null;
  best_of: number;
  tab: string;
  datetime_utc: string | null;
  patch: string;
}

export interface GameListItem {
  id: number;
  game_id: string;
  match: number;
  game_number: number;
  datetime_utc: string | null;
  patch: string;
  gamelength: string;
  winner: number | null;
  vod: string;
  team1: string;
  team2: string;
  team1_kills: number;
  team1_gold: number;
  team1_towers: number;
  team1_dragons: number;
  team1_barons: number;
  team1_rift_heralds: number;
  team2_kills: number;
  team2_gold: number;
  team2_towers: number;
  team2_dragons: number;
  team2_barons: number;
  team2_rift_heralds: number;
}

export interface PlayerPerformance {
  id: number;
  name: string;
  link: string;
  team: string;
  side: number;
  role: string;
  champion: Champion;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  damage_to_champions: number;
  items: Item[];
  trinket: Item | null;
  summoner_spell_d: SummonerSpell | null;
  summoner_spell_f: SummonerSpell | null;
  keystone_rune: Rune | null;
  runes: Rune[];
}

export interface PlayerPerformanceCompact {
  id: number;
  name: string;
  team: string;
  side: number;
  role: string;
  champion_name: string | null;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  damage_to_champions: number;
}

export interface GameDetail extends GameListItem {
  team1_picks: Champion[];
  team1_bans: Champion[];
  team2_picks: Champion[];
  team2_bans: Champion[];
  performances: PlayerPerformance[];
}

export interface MatchDetail extends Omit<Match, 'event'> {
  event: Event;
  games: GameListItem[];
}
