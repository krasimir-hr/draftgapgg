import type { StandingsEntry } from '../../types/models';
import { SideRail } from '../Sidebar';
import { StatLeaderboard, type Row } from './StatRail';

interface Props {
  list: StandingsEntry[];
  teamShortNames: Record<string, string>;
}

// Per-metric leaderboards shown on the Team Stats tab in place of the match rails.
export default function TeamStatsRail({ list, teamShortNames }: Props) {
  const teams = list.filter((e) => e.games > 0);
  if (teams.length === 0) {
    return (
      <SideRail title="Team graphs">
        <div className="text-(--text-dim) text-center" style={{ padding: '14px 18px', fontSize: 12.5 }}>
          No team data yet.
        </div>
      </SideRail>
    );
  }

  const label = (e: StandingsEntry) => teamShortNames[e.team] || e.team;

  const kills: Row[] = teams
    .map((e) => ({ label: label(e), logo: e.logo, value: e.kills_per_game, display: e.kills_per_game.toFixed(1) }))
    .sort((a, b) => b.value - a.value);

  const gold: Row[] = teams
    .filter((e) => e.gold_per_min)
    .map((e) => ({ label: label(e), logo: e.logo, value: e.gold_per_min, display: Math.round(e.gold_per_min).toLocaleString() }))
    .sort((a, b) => b.value - a.value);

  const length: Row[] = teams
    .filter((e) => e.avg_game_length)
    .map((e) => ({ label: label(e), logo: e.logo, value: e.avg_game_length, display: `${e.avg_game_length.toFixed(1)}m` }))
    .sort((a, b) => a.value - b.value); // shortest (fastest) first

  return (
    <>
      <StatLeaderboard title="Kills / game" rows={kills} />
      {gold.length > 0 && <StatLeaderboard title="Gold / min" rows={gold} />}
      {length.length > 0 && <StatLeaderboard title="Avg game length" rows={length} />}
    </>
  );
}
