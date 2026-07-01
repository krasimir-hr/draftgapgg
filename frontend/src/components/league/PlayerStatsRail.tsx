import type { EventPlayerStats, RatingEntry } from '../../types/models';
import { SideRail } from '../Sidebar';
import { StatLeaderboard, type Row } from './StatRail';

interface Props {
  players: EventPlayerStats[];
  ratings: RatingEntry[];
  teamLogos: Record<string, string | null>;
}

// Per-metric player leaderboards shown on the Players tab in place of the match rails.
export default function PlayerStatsRail({ players, ratings, teamLogos }: Props) {
  const pool = players.filter((p) => p.games_played > 0);
  if (pool.length === 0) {
    return (
      <SideRail title="Player graphs">
        <div className="text-(--text-dim) text-center" style={{ padding: '14px 18px', fontSize: 12.5 }}>
          No player data yet.
        </div>
      </SideRail>
    );
  }

  const prByName = new Map(ratings.map((r) => [r.name, r.avg_pr]));
  const teamLogo = (p: EventPlayerStats) => teamLogos[p.team] ?? null;

  const rating: Row[] = pool
    .filter((p) => prByName.has(p.name))
    .map((p) => ({ label: p.name, logo: p.image, subLogo: teamLogo(p), value: prByName.get(p.name)!, display: prByName.get(p.name)!.toFixed(1) }))
    .sort((a, b) => b.value - a.value);

  const kda: Row[] = pool
    .map((p) => {
      const v = (p.avg_kills + p.avg_assists) / Math.max(p.avg_deaths, 0.1);
      return { label: p.name, logo: p.image, subLogo: teamLogo(p), value: v, display: v.toFixed(2) };
    })
    .sort((a, b) => b.value - a.value);

  const csm: Row[] = pool
    .filter((p) => p.avg_cs_per_min)
    .map((p) => ({ label: p.name, logo: p.image, subLogo: teamLogo(p), value: p.avg_cs_per_min!, display: p.avg_cs_per_min!.toFixed(2) }))
    .sort((a, b) => b.value - a.value);

  return (
    <>
      {rating.length > 0 && <StatLeaderboard title="Rating (PR)" rows={rating} bleedImage />}
      <StatLeaderboard title="KDA" rows={kda} bleedImage />
      {csm.length > 0 && <StatLeaderboard title="CS / min" rows={csm} bleedImage />}
    </>
  );
}
