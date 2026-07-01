import { useMemo, useState } from 'react';
import type { RatingEntry } from '../../types/models';
import { useDrawer } from '../../contexts/DrawerContext';
import {
  PlayerAvatar,
  RoleChip,
  RoleFilterBar,
  TeamMark,
  Badge,
  type RoleFilter,
} from './shared';

type SortKey = 'pr' | 'points';

interface Props {
  ratings: RatingEntry[];
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
}

const prColor = (pr: number) =>
  pr >= 65 ? 'var(--green)' : pr <= 40 ? 'var(--red)' : 'var(--text-h)';

export default function RatingsTab({ ratings, teamLogos, teamShortNames }: Props) {
  const [role, setRole] = useState<RoleFilter>('All');
  const [sort, setSort] = useState<SortKey>('pr');

  const rows = useMemo(() => {
    let list = ratings;
    if (role !== 'All') list = list.filter((r) => r.role === role);
    list = [...list].sort((a, b) =>
      sort === 'pr' ? b.avg_pr - a.avg_pr : b.total_points - a.total_points,
    );
    return list.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [ratings, role, sort]);

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div>
        <div className="flex items-baseline" style={{ gap: 8 }}>
          <h2 className="section-label">Performance Ratings</h2>
          <span className="text-(--text-dim)" style={{ fontSize: 11.5 }}>
            · role-relative score (0–100), see methodology
          </span>
        </div>
        <p className="text-(--text-dim)" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
          PR is z-scored within each role, so cross-role comparison is fair.
          <span style={{ color: 'var(--text-faint)' }}> Enriched</span> rows use Oracle's Elixir laning/vision data;
          <span style={{ color: 'var(--text-faint)' }}> basic</span> rows use scoreboard stats only.
        </p>
      </div>

      <div className="card card-soft-shadow overflow-hidden" style={{ borderRadius: 12 }}>
        <RoleFilterBar selected={role} onChange={setRole} />

        <div className="overflow-x-auto">
          <table className="w-full font-sans" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <Th style={{ textAlign: 'center', width: 50 }}>#</Th>
                <Th style={{ textAlign: 'left' }}>Player</Th>
                <Th style={{ textAlign: 'left' }}>Team</Th>
                <Th>Games</Th>
                <SortTh active={sort === 'pr'} onClick={() => setSort('pr')}>PR</SortTh>
                <SortTh active={sort === 'points'} onClick={() => setSort('points')}>Points</SortTh>
                <Th>Carry%</Th>
                <Th>MVPs</Th>
                <Th style={{ textAlign: 'center' }}>Tier</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <Row
                  key={p.name}
                  p={p}
                  isFirst={i === 0}
                  teamLogo={teamLogos[p.team] ?? null}
                  teamShort={teamShortNames[p.team] || p.team}
                />
              ))}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <div className="text-(--text-dim) text-center" style={{ padding: '60px 20px', fontSize: 13 }}>
            No ratings yet for this filter.
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  p, isFirst, teamLogo, teamShort,
}: {
  p: RatingEntry & { rank: number };
  isFirst: boolean;
  teamLogo: string | null;
  teamShort: string;
}) {
  const { openPlayer } = useDrawer();
  const cellPad = '12px 14px';
  return (
    <tr
      onClick={() => openPlayer(p.name)}
      className="cursor-pointer transition-colors hover:bg-(--surface-sub)"
      style={{ borderTop: isFirst ? 'none' : '1px solid var(--border)' }}
    >
      <td className="tabular-nums" style={{ padding: cellPad, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12, verticalAlign: 'middle' }}>
        <div className="flex items-center justify-center" style={{ gap: 4 }}>
          {p.rank}
          {p.rank <= 3 && (
            <span style={{ width: 4, height: 4, borderRadius: 4, background: p.rank === 1 ? '#d4a017' : p.rank === 2 ? '#a3a3a3' : '#c2410c' }} />
          )}
        </div>
      </td>
      <td style={{ padding: cellPad, verticalAlign: 'middle' }}>
        <div className="flex items-center" style={{ gap: 10 }}>
          <PlayerAvatar name={p.name} image={p.image} role={p.role} size={34} />
          <div>
            <div className="flex items-center" style={{ color: 'var(--text-h)', fontWeight: 600, fontSize: 14, gap: 6 }}>
              {p.name}
              <RoleChip role={p.role} size="sm" />
            </div>
            {p.nationality && (
              <div className="text-(--text-dim)" style={{ fontSize: 11, marginTop: 1 }}>{p.nationality}</div>
            )}
          </div>
        </div>
      </td>
      <td style={{ padding: cellPad, verticalAlign: 'middle' }}>
        <div className="flex items-center" style={{ gap: 8 }}>
          <TeamMark short={teamShort} logo={teamLogo} size={22} />
          <span className="font-medium text-(--text)" style={{ fontSize: 12.5 }}>{teamShort}</span>
        </div>
      </td>
      <NumTd>{p.games_played}</NumTd>
      <NumTd color={prColor(p.avg_pr)} weight={700}>{p.avg_pr.toFixed(1)}</NumTd>
      <NumTd weight={600} color="var(--accent-2)">{p.total_points.toFixed(1)}</NumTd>
      <NumTd>{(p.avg_contribution * 100).toFixed(0)}%</NumTd>
      <NumTd>{p.mvps || '—'}</NumTd>
      <td style={{ padding: cellPad, textAlign: 'center', verticalAlign: 'middle' }}>
        <Badge tone={p.tier === 'enriched' ? 'accent' : 'neutral'}>{p.tier}</Badge>
      </td>
    </tr>
  );
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th style={{
      textAlign: 'right', padding: '12px 14px', fontSize: 10, fontWeight: 600,
      letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-dim)',
      background: 'var(--surface-sub)', whiteSpace: 'nowrap', ...style,
    }}>
      {children}
    </th>
  );
}

function SortTh({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Th>
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1" style={{ color: active ? 'var(--accent-2)' : undefined }}>
        {children}
        {active && <span style={{ fontSize: 10 }}>↓</span>}
      </button>
    </Th>
  );
}

function NumTd({ children, color, weight }: { children: React.ReactNode; color?: string; weight?: number }) {
  return (
    <td className="tabular-nums" style={{ padding: '12px 14px', textAlign: 'right', color: color || 'var(--text-h)', fontWeight: weight || 500, fontSize: 13, verticalAlign: 'middle' }}>
      {children}
    </td>
  );
}
