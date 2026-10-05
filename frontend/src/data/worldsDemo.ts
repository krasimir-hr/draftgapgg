import type { WorldsData, WorldsMatch, WorldsTeam } from '../lib/worldsPredictions';

// Hypothetical participants and fixtures for trying the UI, never API records.
const teams: WorldsTeam[] = [
  { name: 'T1', shortName: 'T1', region: 'Korea', logo: null },
  { name: 'Gen.G', shortName: 'GEN', region: 'Korea', logo: null },
  { name: 'G2 Esports', shortName: 'G2', region: 'Europe', logo: null },
  { name: 'Fnatic', shortName: 'FNC', region: 'Europe', logo: null },
  { name: 'Bilibili Gaming', shortName: 'BLG', region: 'China', logo: null },
  { name: 'Top Esports', shortName: 'TES', region: 'China', logo: null },
  { name: 'Cloud9', shortName: 'C9', region: 'North America', logo: null },
  { name: 'FlyQuest', shortName: 'FLY', region: 'North America', logo: null },
];

export function createWorldsDemo(now = Date.now()): WorldsData {
  const fixture = (id: number, team1: string, team2: string, predictionStage: string, hours: number, tab: string, best_of = 1, extra: Partial<WorldsMatch> = {}): WorldsMatch => ({
    id: -id, match_id: `demo-${id}`, event: -1, team1, team2,
    predictionStage, datetime_utc: new Date(now + hours * 3_600_000).toISOString(),
    tab, best_of, winner: null, team1_score: 0, team2_score: 0, patch: '',
    next_match: null, bracket_col: null, bracket_order: null,
    is_lower_bracket: false, is_final: false, league_logo: null, league_short_name: 'Demo',
    ...extra,
  });
  return {
    demo: true, events: [], teams,
    matches: [
      fixture(1, 'Cloud9', 'Fnatic', 'Play-In', 24, 'Opening match', 5),
      fixture(2, 'FlyQuest', 'Top Esports', 'Play-In', 27, 'Opening match', 5),
      fixture(3, 'T1', 'G2 Esports', 'Swiss Stage', 48, 'Round 1'),
      fixture(4, 'Gen.G', 'Bilibili Gaming', 'Swiss Stage', 49, 'Round 1'),
      fixture(5, 'Fnatic', 'FlyQuest', 'Swiss Stage', -1, 'In progress'),
      fixture(6, 'Top Esports', 'Cloud9', 'Swiss Stage', -24, 'Completed', 3, { winner: 1, team1_score: 2, team2_score: 1 }),
      fixture(7, 'T1', 'Bilibili Gaming', 'Knockout', 96, 'Quarterfinal', 5),
      fixture(8, 'TBD', 'TBD', 'Knockout', 120, 'Semifinal', 5),
    ],
  };
}
