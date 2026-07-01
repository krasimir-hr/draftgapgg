import type { EventChampionStats } from '../../types/models';
import { SideRail } from '../Sidebar';
import { StatLeaderboard, type Row } from './StatRail';

interface Props {
  champions: EventChampionStats[];
}

export default function ChampsStatsRail({ champions }: Props) {
  if (champions.length === 0) {
    return (
      <SideRail title="Champion graphs">
        <div className="text-(--text-dim) text-center" style={{ padding: '14px 18px', fontSize: 12.5 }}>
          No champion data yet.
        </div>
      </SideRail>
    );
  }

  const picks = (c: EventChampionStats) => Object.values(c.picks_by_role).reduce((a, b) => a + b, 0);
  const wins = (c: EventChampionStats) => Object.values(c.wins_by_role).reduce((a, b) => a + b, 0);

  const pickRows: Row[] = champions
    .map((c) => ({ label: c.name, logo: c.icon_url, value: picks(c), display: String(picks(c)) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const banRows: Row[] = champions
    .filter((c) => c.bans > 0)
    .map((c) => ({ label: c.name, logo: c.icon_url, value: c.bans, display: String(c.bans) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const wrRows: Row[] = champions
    .filter((c) => picks(c) >= 3)
    .map((c) => {
      const p = picks(c);
      const wr = p > 0 ? (wins(c) / p) * 100 : 0;
      return { label: c.name, logo: c.icon_url, value: wr, display: `${wr.toFixed(0)}%` };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const kdaRows: Row[] = champions
    .filter((c) => picks(c) >= 3)
    .map((c) => {
      const kda = (c.kills + c.assists) / Math.max(c.deaths, 1);
      return { label: c.name, logo: c.icon_url, value: kda, display: kda.toFixed(2) };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return (
    <>
      {pickRows.length > 0 && <StatLeaderboard title="Most picked" rows={pickRows} champIcon />}
      {banRows.length > 0 && <StatLeaderboard title="Most banned" rows={banRows} champIcon />}
      {wrRows.length > 0 && <StatLeaderboard title="Best win rate" rows={wrRows} champIcon />}
      {kdaRows.length > 0 && <StatLeaderboard title="Best KDA" rows={kdaRows} champIcon />}
    </>
  );
}
