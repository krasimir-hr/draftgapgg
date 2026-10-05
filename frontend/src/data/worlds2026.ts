// Editorial schedule metadata from Riot; teams and matches come from the DraftGap API.
export const WORLDS_CHECKED_ON = '3 October 2026';
export const WORLDS_SOURCES = {
  schedule: 'https://lolesports.com/en-US/news/msi-and-worlds-updates',
};
export const STAGES = ['Play-In', 'Swiss Stage', 'Knockout'] as const;
export type Stage = typeof STAGES[number];
export const STAGE_INFO: Record<Stage, { dates: string; venue: string; format: string }> = {
  'Play-In': {
    dates: '15–18 October',
    venue: 'Riot Games Arena · Los Angeles',
    format: '4 teams · BO5 double elimination · 1 advances to Swiss',
  },
  'Swiss Stage': {
    dates: '23–26 & 28–31 October',
    venue: 'Credit Union of Texas Event Center · Allen, Texas',
    format: '16 teams · 5 rounds · 3 wins to advance · 8 reach Knockout',
  },
  Knockout: {
    dates: '3–8 & 14 November',
    venue: 'Allen, Texas · Final in Brooklyn, New York',
    format: '8 teams · Single elimination · Quarterfinals, semifinals and final',
  },
};

export const KNOCKOUT_SCHEDULE = [
  { round: 'Quarterfinals', dates: '3–6 November', venue: 'Credit Union of Texas Event Center · Allen, Texas' },
  { round: 'Semifinals', dates: '7–8 November', venue: 'Credit Union of Texas Event Center · Allen, Texas' },
  { round: 'Grand Final', dates: '14 November', venue: 'Barclays Center · Brooklyn, New York' },
];

