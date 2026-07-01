// Shared API response / model types

// DRF PageNumberPagination envelope
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// lol app

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

export interface ChampionProfileMeta {
  id: number;
  name: string;
  title: string;
  tags: string[];
  resource_type: string;
  icon_url: string;
  splash_url: string | null;
  patch: string;
}

export interface ChampionProfileAbility {
  id: number;
  ability_type: string;
  name: string;
  description: string;
  cooldown: number[];
  cost: number[];
  image_url: string | null;
}

export interface ChampionProfileStats {
  games: number;
  wins: number;
  losses: number;
  win_rate: number | null;
  bans: number;
  pick_rate: number | null;
  ban_rate: number | null;
  presence: number | null;
  avg_kills: number;
  avg_deaths: number;
  avg_assists: number;
  kda: number;
  avg_cs: number;
  avg_cs_per_min: number | null;
  avg_gold: number;
  avg_damage: number;
  blue_games: number;
  blue_win_rate: number | null;
  red_games: number;
  red_win_rate: number | null;
}

export interface ChampionProfileRole {
  role: string;
  games: number;
  wins: number;
  win_rate: number | null;
  share: number;
}

export interface ChampionProfilePlayer {
  name: string;
  team: string;
  games: number;
  win_rate: number;
  kda: number;
  avg_kills: number;
  avg_deaths: number;
  avg_assists: number;
  image: string | null;
  team_logo: string | null;
}

export interface ChampionProfileRegion {
  id: number;
  name: string;
  full_name: string;
  logo: string | null;
  games: number;
  wins: number;
  win_rate: number;
}

export interface ChampionProfileGame {
  game_id: number;
  match_id: number;
  datetime: string | null;
  event: string;
  league: string;
  player: string;
  role: string;
  team: string;
  team_logo: string | null;
  opponent: string;
  opponent_logo: string | null;
  won: boolean | null;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
}

export interface ChampionProfile {
  champion: ChampionProfileMeta;
  abilities: ChampionProfileAbility[];
  available_years: number[];
  stats: ChampionProfileStats;
  roles: ChampionProfileRole[];
  best_players: ChampionProfilePlayer[];
  best_regions: ChampionProfileRegion[];
  recent_games: ChampionProfileGame[];
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

// core app

export interface League {
  id: number;
  name: string;
  short_name: string | null;
  logo: string | null;
  youtube: string;
  instagram: string;
  twitter: string;
  twitch: string;
}

export interface EventStage {
  id: number;
  name: string;
  type: 'league' | 'playoff' | 'swiss' | 'group' | 'play_in';
  order: number;
  has_lower_bracket: boolean;
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
  prize_pool: string;
  stages: EventStage[];
}

export interface EventStats {
  prize_pool: string | null;
  total_matches: number;
  completed_matches: number;
  games_played: number;
  avg_game_length: string | null;
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
  next_match: number | null;
  bracket_col: number | null;
  bracket_order: number | null;
  is_lower_bracket: boolean;
  is_final: boolean;
  league_logo: string | null;
  league_short_name: string | null;
  // Present on the home feed (/api/home-matches/); team org crests + short names.
  team1_logo?: string | null;
  team2_logo?: string | null;
  team1_short?: string | null;
  team2_short?: string | null;
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
  vision_score: number;
  rating: PerformanceRatingInfo | null;
  items: Item[];
  trinket: Item | null;
  summoner_spell_d: SummonerSpell | null;
  summoner_spell_f: SummonerSpell | null;
  keystone_rune: Rune | null;
  runes: Rune[];
}

export interface RatingMetric {
  key: string;
  score: number;   // 0–100 vs same-role peers
  weight: number;  // 0–1, how much this metric counts for the role (renormalized)
}

export interface PerformanceRatingInfo {
  pr: number;
  points: number;
  tier: 'enriched' | 'basic';
  is_mvp: boolean;
  won: boolean;
  contribution: number;
  metrics: RatingMetric[];
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

export interface H2HMatch {
  id: number;
  datetime_utc: string | null;
  event_name: string;
  event_id: number;
  league: string;
  league_logo: string | null;
  tab: string;
  patch: string;
  best_of: number;
  team1: string;
  team2: string;
  team1_score: number;
  team2_score: number;
  team1_logo: string | null;
  team2_logo: string | null;
  winner: 1 | 2;
}

export interface FormMatch {
  match_id: number;
  result: 'W' | 'L';
  opponent: string;
  opponent_logo: string | null;
  score: string;
  datetime_utc: string | null;
  tab: string;
}

export interface StandingsEntry {
  placement: number;
  team: string;
  logo: string | null;
  wins: number;
  losses: number;
  win_rate: number;
  form: FormMatch[];
  kills: number;
  deaths: number;
  kd_ratio: number | null;
  kills_per_game: number;
  deaths_per_game: number;
  gold_per_min: number;
  towers: number;
  towers_per_game: number;
  dragons: number;
  dragons_per_game: number;
  barons: number;
  barons_per_game: number;
  games: number;
  game_wins: number;
  game_win_rate: number;
  avg_game_length: number;
}

export interface EventHighlights {
  player_of_month: {
    name: string;
    team: string;
    team_logo: string | null;
    role: string;
    nationality: string | null;
    games: number;
    avg_kills: number;
    avg_deaths: number;
    avg_assists: number;
    kda: number;
    image: string | null;
  } | null;
  inform_team: {
    team: string;
    logo: string | null;
    wins: number;
    played: number;
    form: ('W' | 'L')[];
  } | null;
  must_pick: {
    id: number;
    name: string;
    icon_url: string;
    splash_url: string;
    picks: number;
    wins: number;
    win_rate: number | null;
  } | null;
  match_of_week: {
    team1: string;
    team2: string;
    team1_logo: string | null;
    team2_logo: string | null;
    team1_pos: number | null;
    team2_pos: number | null;
    datetime_utc: string | null;
  } | null;
  banger_of_week: {
    team1: string;
    team2: string;
    team1_logo: string | null;
    team2_logo: string | null;
    team1_pos: number | null;
    team2_pos: number | null;
    team1_score: number;
    team2_score: number;
    winner: number;
    datetime_utc: string | null;
  } | null;
}

export interface EventChampionStats {
  placement: number;
  id: number;
  name: string;
  icon_url: string;
  bans: number;
  picks_by_role: Record<string, number>;
  wins_by_role: Record<string, number>;
  /** K/D/A summed across every pick of this champion in the event. */
  kills: number;
  deaths: number;
  assists: number;
  /** K/D/A summed per role, so stats can be scoped to a single role. */
  kda_by_role: Record<string, { kills: number; deaths: number; assists: number }>;
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

export interface RatingEntry {
  placement: number;
  name: string;
  team: string;
  role: string;
  link: string;
  image: string | null;
  nationality: string | null;
  games_played: number;
  avg_pr: number;
  total_points: number;
  avg_contribution: number;
  mvps: number;
  tier: 'enriched' | 'basic';
  /** Recent games, oldest → newest (last 10) — drives the form graph. */
  form: FormGame[];
  /** Player's 3 best champions (PR shrunk toward overall PR), best first. */
  champions: ChampStat[];
}

/** A champion in a player's best-champions list (see ratings endpoint). */
export interface ChampStat {
  name: string;
  icon: string | null;
  games: number;
  pr: number;
}

/** One recent game in a player's form graph (see ratings endpoint). */
export interface FormGame {
  pr: number;
  win: boolean | null;
  opponent: string;
  champion: string | null;
  champion_icon: string | null;
  kills: number;
  deaths: number;
  assists: number;
  date: string | null;
}

export interface ChampionStatEntry {
  id: number;
  name: string;
  icon_url: string;
  picks: number;
  wins: number;
  bans: number;
  win_rate: number | null;
}

export interface ChampionStats {
  top_picks: ChampionStatEntry[];
  top_bans: ChampionStatEntry[];
  top_win_rate: ChampionStatEntry[];
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

export interface HomeMatches {
  server_time: string;
  matches: Match[];
}

export interface HomeLeagueRef {
  id: number;
  name: string;
  short_name: string | null;
  logo: string | null;
}

export interface HomeStandingRow {
  placement: number;
  team: string;
  logo: string | null;
  wins: number;
  losses: number;
  win_rate: number;
}

export interface HomeStandingsGroup {
  league: HomeLeagueRef;
  event_name: string;
  is_active: boolean;
  standings: HomeStandingRow[];
}

export interface HomeStandings {
  leagues: HomeStandingsGroup[];
}

export interface Overview {
  upcoming_matches: Match[];
  recent_results: Match[];
  top_champions: OverviewTopChampion[];
  top_players: OverviewTopPlayer[];
}

// Player profile

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

export interface PlayerProfileTrait {
  key: string;
  label: string;
  value: number | null;
  display: string;
  percentile: number | null;
}

export interface PlayerProfileTraits {
  role: string;
  sample: number;
  traits: PlayerProfileTrait[];
}

export interface PlayerProfileUpcomingMatch {
  id: number;
  datetime: string | null;
  event: string;
  best_of: number;
  team1: string;
  team2: string;
  team1_logo: string | null;
  team2_logo: string | null;
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
  traits: PlayerProfileTraits | null;
  best_champions: PlayerProfileChampion[];
  recent_games: PlayerProfileGame[];
  upcoming_matches: PlayerProfileUpcomingMatch[];
}

// Team profile

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
