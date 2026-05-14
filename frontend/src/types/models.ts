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
  path_icon: string;
  path_riot_id: number;
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
  icon_url: string;
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
  color: string;
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
  team1_score: number;
  team2_score: number;
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

export interface GoldGraphPoint {
  m: number;
  t1: number;
  t2: number;
}

export interface GameDetail extends GameListItem {
  team1_picks: Champion[];
  team1_bans: Champion[];
  team2_picks: Champion[];
  team2_bans: Champion[];
  performances: PlayerPerformance[];
  gold_graph: GoldGraphPoint[] | null;
}

export interface MatchDetail extends Omit<Match, 'event'> {
  event: Event;
  games: GameListItem[];
}

export interface StandingsEntry {
  placement: number;
  team: string;
  logo: string | null;
  wins: number;
  losses: number;
  kills: number;
}

export interface EventChampionStats {
  placement: number;
  id: number;
  name: string;
  icon_url: string;
  bans: number;
  picks_by_role: Record<string, number>;
  wins_by_role: Record<string, number>;
}

export interface EventPlayerStats {
  placement: number;
  name: string;
  team: string;
  role: string;
  link: string;
  image: string | null;
  nationality: string | null;
  games_played: number;
  avg_kills: number;
  avg_deaths: number;
  avg_assists: number;
  avg_cs_per_min: number | null;
}

export interface OverviewTopChampion {
  id: number;
  name: string;
  icon_url: string;
  picks: number;
  wins: number;
  win_rate: number | null;
}

export interface OverviewTopPlayer {
  name: string;
  team: string;
  role: string;
  games: number;
  avg_kills: number;
  avg_deaths: number;
  avg_assists: number;
  kda: number;
}

export interface Overview {
  upcoming_matches: Match[];
  recent_results: Match[];
  top_champions: OverviewTopChampion[];
  top_players: OverviewTopPlayer[];
}

// ── Player profile ──

export interface PlayerProfileTeam {
  name: string;
  short_name: string;
  logo: string | null;
  color: string | null;
}

export interface PlayerProfileEventOption {
  id: number;
  name: string;
  year: number | null;
  league: string;
}

export interface PlayerProfileStats {
  games: number;
  wins: number;
  losses: number;
  win_rate: number | null;
  avg_kills: number;
  avg_deaths: number;
  avg_assists: number;
  kda: number;
  avg_cs: number;
  avg_cs_per_min: number | null;
  avg_gold: number;
  avg_damage: number;
}

export interface PlayerProfileChampion {
  id: number;
  name: string;
  icon_url: string;
  games: number;
  wins: number;
  win_rate: number;
  kills: number;
  deaths: number;
  assists: number;
  avg_kills: number;
  avg_deaths: number;
  avg_assists: number;
  kda: number;
}

export interface PlayerProfileGame {
  game_id: number;
  match_id: number;
  datetime: string | null;
  event: string;
  event_id: number;
  event_logo: string | null;
  league: string;
  league_logo: string | null;
  opponent: string;
  opponent_logo: string | null;
  team: string;
  team_logo: string | null;
  won: boolean | null;
  role: string;
  champion: string | null;
  champion_icon: string | null;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  cs_per_min: number | null;
  gamelength: string;
  best_of: number;
  match_team1: string | null;
  match_team2: string | null;
  match_team1_wins: number;
  match_team2_wins: number;
  match_winner: number | null;
}

export interface PlayerProfile {
  player: {
    name: string;
    real_name: string | null;
    image: string | null;
    leaguepedia_image: string;
    nationality: string | null;
    birthdate: string | null;
    age: string | null;
  };
  current_team: PlayerProfileTeam | null;
  current_role: string | null;
  available_years: number[];
  available_events: PlayerProfileEventOption[];
  stats: PlayerProfileStats;
  best_champions: PlayerProfileChampion[];
  recent_games: PlayerProfileGame[];
}

// ── Team profile ──

export interface TeamProfileEventOption {
  id: number;
  name: string;
  year: number | null;
  league: string;
}

export interface TeamProfileStats {
  matches: number;
  match_wins: number;
  match_losses: number;
  match_win_rate: number | null;
  games: number;
  game_wins: number;
  game_losses: number;
  game_win_rate: number | null;
  avg_kills_for: number;
  avg_kills_against: number;
  avg_game_length: string | null;
  avg_towers: number;
  avg_dragons: number;
  avg_barons: number;
}

export interface TeamProfileChampion {
  id: number;
  name: string;
  icon_url: string;
  picks: number;
  wins: number;
  win_rate: number | null;
  bans: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number | null;
}

export interface TeamProfilePlayer {
  name: string;
  role: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  avg_kills: number;
  avg_deaths: number;
  avg_assists: number;
  kda: number;
  win_rate: number | null;
  image: string | null;
  nationality: string | null;
}

export interface TeamProfileRosterPlayer {
  player_id: number;
  name: string;
  role: string;
  image: string | null;
  nationality: string | null;
  is_starter: boolean;
}

export interface TeamProfileMatch {
  match_id: number;
  datetime: string | null;
  event: string;
  event_id: number;
  event_logo: string | null;
  league: string;
  league_logo: string | null;
  team: string;
  team_logo: string | null;
  opponent: string;
  opponent_logo: string | null;
  best_of: number;
  tab: string;
  patch: string;
  team_score: number;
  opponent_score: number;
  won: boolean | null;
}

export interface TeamProfile {
  team: {
    id: number;
    name: string;
    short_name: string;
    logo: string | null;
    color: string | null;
    region: string | null;
    leaguepedia_page: string | null;
  };
  current_event: TeamProfileEventOption | null;
  current_roster: TeamProfileRosterPlayer[];
  available_years: number[];
  available_events: TeamProfileEventOption[];
  stats: TeamProfileStats;
  top_champions: TeamProfileChampion[];
  top_players: TeamProfilePlayer[];
  recent_matches: TeamProfileMatch[];
}
