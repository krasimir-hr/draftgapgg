import type { ChampionStats } from '../types/models';
import { StatLeaderboard, type Row } from './league/StatRail';

interface Props {
  stats: ChampionStats;
}

export default function ChampionStatsRail({ stats }: Props) {
  const toRow = (c: ChampionStats['top_picks'][number], display: string): Row => ({
    label: c.name,
    logo: c.icon_url,
    value: c.picks,
    display,
  });

  const pickRows: Row[] = stats.top_picks.map((c) => toRow(c, String(c.picks)));
  const banRows: Row[] = stats.top_bans.map((c) => ({
    label: c.name,
    logo: c.icon_url,
    value: c.bans,
    display: String(c.bans),
  }));
  const wrRows: Row[] = stats.top_win_rate.map((c) => ({
    label: c.name,
    logo: c.icon_url,
    value: c.win_rate ?? 0,
    display: `${(c.win_rate ?? 0).toFixed(0)}%`,
  }));

  return (
    <>
      {pickRows.length > 0 && <StatLeaderboard title="Most picked" rows={pickRows} champIcon />}
      {banRows.length > 0 && <StatLeaderboard title="Most banned" rows={banRows} champIcon />}
      {wrRows.length > 0 && <StatLeaderboard title="Best win rate" rows={wrRows} champIcon />}
    </>
  );
}
