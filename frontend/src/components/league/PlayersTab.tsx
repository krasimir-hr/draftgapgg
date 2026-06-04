import { useEffect, useMemo, useReducer, useState } from 'react';
import { getEventPlayers } from '../../api/core';
import type { EventPlayerStats } from '../../types/models';
import { useDrawer } from '../../contexts/DrawerContext';
import {
  FilterBar,
  IconCards,
  IconCrown,
  IconTable,
  LayoutSwitcher,
  MISSING_PLAYER_FIELDS,
  MissingDataNote,
  PlayerAvatar,
  RoleChip,
  Sparkline,
  TeamMark,
  WinRateBar,
  ROLE_COLOR,
  type RoleFilter,
  type ViewLayout,
} from './shared';

/* ── UI player shape (merges API data with defaults for missing fields) */
interface UIPlayer {
  rank: number;
  name: string;
  team: string;
  teamShort: string;
  teamLogo: string | null;
  role: string;
  image: string | null;
  nationality: string | null;
  games: number;
  k: number;
  d: number;
  a: number;
  kda: number;
  csm: number | null;
  /* defaults */
  winRate: number;
  dmgShare: number;
  fp: number;
  ownership: number;
  trend: number[];
  bestChamp: { name: string; icon: string | null; games: number; wr: number } | null;
}

const SORT_OPTIONS = [
  { key: 'fp',    label: 'Fantasy points' },
  { key: 'kda',   label: 'KDA' },
  { key: 'wr',    label: 'Win rate' },
  { key: 'csm',   label: 'CS / min' },
  { key: 'dmg',   label: 'Damage share' },
  { key: 'games', label: 'Games' },
];

function getSortKey(p: UIPlayer, key: string): number {
  switch (key) {
    case 'fp':    return p.fp;
    case 'kda':   return p.kda;
    case 'wr':    return p.winRate;
    case 'csm':   return p.csm ?? 0;
    case 'dmg':   return p.dmgShare;
    case 'games': return p.games;
    default:      return p.fp;
  }
}

interface State { loading: boolean; error: string | null; list: EventPlayerStats[]; }
type Action =
  | { type: 'fetch' }
  | { type: 'success'; list: EventPlayerStats[] }
  | { type: 'error'; message: string };
function reducer(_s: State, a: Action): State {
  switch (a.type) {
    case 'fetch':   return { loading: true, error: null, list: [] };
    case 'success': return { loading: false, error: null, list: a.list };
    case 'error':   return { loading: false, error: a.message, list: [] };
  }
}

interface Props {
  eventId: number;
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
}

export default function PlayersTab({ eventId, teamLogos, teamShortNames }: Props) {
  const [state, dispatch] = useReducer(reducer, { loading: true, error: null, list: [] });
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<RoleFilter>('All');
  const [team, setTeam] = useState('All');
  const [sort, setSort] = useState('fp');
  const [layout, setLayout] = useState<ViewLayout>('fantasy');

  useEffect(() => {
    dispatch({ type: 'fetch' });
    getEventPlayers(eventId)
      .then((res) => dispatch({ type: 'success', list: res.data }))
      .catch(() => dispatch({ type: 'error', message: 'Failed to load players' }));
  }, [eventId]);

  /* Build UIPlayers with defaults */
  const uiPlayers = useMemo<UIPlayer[]>(() => {
    return state.list.map((p) => {
      const kda = (p.avg_kills + p.avg_assists) / Math.max(p.avg_deaths, 0.1);
      /* Deterministic default WR / DMG / FP / ownership / trend per player so the UI
         doesn't shuffle every render — derived from a simple name hash. */
      const h = hash(p.name);
      const winRate = 40 + (h % 25);                         // 40 – 64
      const dmgShare = 14 + ((h >> 3) % 18);                 // 14 – 31
      const fp = Math.round(60 + (kda * 12) + ((h >> 5) % 40)); // ~60 – ~200
      const ownership = (h >> 7) % 90;                       // 0 – 89
      const trend = Array.from({ length: 6 }, (_, i) => 50 + ((h >> (i + 1)) % 60));

      return {
        rank: 0, // assigned after sort
        name: p.name,
        team: p.team,
        teamShort: teamShortNames[p.team] || p.team,
        teamLogo: teamLogos[p.team] ?? null,
        role: p.role,
        image: p.image,
        nationality: p.nationality,
        games: p.games_played,
        k: p.avg_kills,
        d: p.avg_deaths,
        a: p.avg_assists,
        kda,
        csm: p.avg_cs_per_min,
        winRate,
        dmgShare,
        fp,
        ownership,
        trend,
        bestChamp: null,
      };
    });
  }, [state.list, teamLogos, teamShortNames]);

  /* Team filter options derived from API list */
  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of state.list) set.add(p.team);
    return [
      { value: 'All', label: 'All teams' },
      ...Array.from(set).sort().map((t) => ({ value: t, label: teamShortNames[t] || t })),
    ];
  }, [state.list, teamShortNames]);

  /* Filtered + sorted */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = uiPlayers.filter((p) => {
      if (role !== 'All' && p.role !== role) return false;
      if (team !== 'All' && p.team !== team) return false;
      if (q) {
        const hay = `${p.name} ${p.team} ${p.teamShort}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list = list.slice().sort((a, b) => getSortKey(b, sort) - getSortKey(a, sort));
    return list.map((p, i) => ({ ...p, rank: i + 1 }));
  }, [uiPlayers, query, role, team, sort]);

  if (state.loading) return <div className="py-10 flex items-center justify-center"><div className="spinner" /></div>;
  if (state.error)   return <p className="text-sm px-6 py-6" style={{ color: 'var(--red)' }}>{state.error}</p>;

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      <MissingDataNote items={MISSING_PLAYER_FIELDS} />

      <FilterBar
        query={query}
        onQuery={setQuery}
        role={role}
        onRole={setRole}
        team={team}
        onTeam={setTeam}
        teamOptions={teamOptions}
        sort={sort}
        onSort={setSort}
        sortOptions={SORT_OPTIONS}
        layoutSwitcher={
          <LayoutSwitcher<ViewLayout>
            layout={layout}
            onChange={setLayout}
            options={[
              { key: 'table',   label: 'Table',   icon: <IconTable /> },
              { key: 'cards',   label: 'Cards',   icon: <IconCards /> },
              { key: 'fantasy', label: 'Fantasy', icon: <IconCrown /> },
            ]}
          />
        }
      />

      {layout === 'table'   && <PlayersTable   players={filtered} sort={sort} />}
      {layout === 'cards'   && <PlayersCards   players={filtered} />}
      {layout === 'fantasy' && <FantasyBoard   players={filtered} />}
    </div>
  );
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

/* ─────────────────────── 1) TABLE LAYOUT ─────────────────────── */

function PlayersTable({ players, sort }: { players: UIPlayer[]; sort: string }) {
  const { openPlayer } = useDrawer();
  const headerStyle: React.CSSProperties = {
    textAlign: 'right',
    padding: '12px 14px',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-dim)',
    fontFamily: 'var(--font-sans)',
    background: 'var(--surface-sub)',
    whiteSpace: 'nowrap',
  };
  const cellPad = '12px 14px';

  const SortHead = ({ keyName, children, align = 'right' }: { keyName: string; children: React.ReactNode; align?: 'left' | 'right' | 'center' }) => (
    <th style={{ ...headerStyle, textAlign: align }}>
      <span
        className="inline-flex items-center gap-1"
        style={{ color: sort === keyName ? 'var(--accent-2)' : undefined }}
      >
        {children}
        {sort === keyName && <span style={{ fontSize: 10 }}>↓</span>}
      </span>
    </th>
  );

  return (
    <div
      className="card card-soft-shadow overflow-hidden"
      style={{ borderRadius: 12 }}
    >
      <div className="overflow-x-auto">
        <table className="w-full font-sans" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...headerStyle, textAlign: 'center', width: 50 }}>#</th>
              <th style={{ ...headerStyle, textAlign: 'left' }}>Player</th>
              <th style={{ ...headerStyle, textAlign: 'left' }}>Team</th>
              <SortHead keyName="games">Games</SortHead>
              <SortHead keyName="wr">Win rate</SortHead>
              <SortHead keyName="kda">KDA</SortHead>
              <th style={headerStyle}>K / D / A</th>
              <SortHead keyName="csm">CS / m</SortHead>
              <SortHead keyName="dmg">DMG%</SortHead>
              <SortHead keyName="fp">FP</SortHead>
              <th style={{ ...headerStyle, textAlign: 'center', width: 80 }}>Form</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => {
              const kdaColor = p.kda >= 5 ? 'var(--green)' : p.kda <= 2.5 ? 'var(--red)' : 'var(--text-h)';
              return (
                <tr
                  key={p.name}
                  onClick={() => openPlayer(p.name)}
                  className="cursor-pointer transition-colors hover:bg-(--surface-sub)"
                  style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
                >
                  <td
                    className="tabular-nums"
                    style={{ padding: cellPad, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12, verticalAlign: 'middle' }}
                  >
                    <div className="flex items-center justify-center" style={{ gap: 4 }}>
                      {p.rank}
                      {p.rank <= 3 && (
                        <span
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: 4,
                            background: p.rank === 1 ? '#d4a017' : p.rank === 2 ? '#a3a3a3' : '#c2410c',
                          }}
                        />
                      )}
                    </div>
                  </td>
                  <td style={{ padding: cellPad, verticalAlign: 'middle' }}>
                    <div className="flex items-center" style={{ gap: 10 }}>
                      <PlayerAvatar
                        name={p.name}
                        image={p.image}
                        role={p.role}
                        size={34}
                      />
                      <div>
                        <div
                          className="flex items-center"
                          style={{ color: 'var(--text-h)', fontWeight: 600, fontSize: 14, gap: 6 }}
                        >
                          {p.name}
                          <RoleChip role={p.role} size="sm" />
                        </div>
                        {p.nationality && (
                          <div
                            className="text-(--text-dim)"
                            style={{ fontSize: 11, marginTop: 1 }}
                          >
                            {p.nationality}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: cellPad, verticalAlign: 'middle' }}>
                    <div className="flex items-center" style={{ gap: 8 }}>
                      <TeamMark short={p.teamShort} logo={p.teamLogo} size={22} />
                      <span
                        className="font-medium text-(--text)"
                        style={{ fontSize: 12.5 }}
                      >
                        {p.teamShort}
                      </span>
                    </div>
                  </td>
                  <NumTd>{p.games}</NumTd>
                  <td style={{ padding: cellPad, textAlign: 'right', verticalAlign: 'middle' }}>
                    <div className="inline-flex justify-end">
                      <WinRateBar wr={p.winRate} width={64} />
                    </div>
                  </td>
                  <NumTd color={kdaColor} weight={600}>{p.kda.toFixed(2)}</NumTd>
                  <td
                    className="tabular-nums"
                    style={{ padding: cellPad, textAlign: 'right', color: 'var(--text-dim)', fontSize: 12 }}
                  >
                    <span style={{ color: 'var(--text)' }}>{p.k.toFixed(1)}</span>
                    <span style={{ color: 'var(--text-faint)' }}> / </span>
                    <span style={{ color: 'var(--red)' }}>{p.d.toFixed(1)}</span>
                    <span style={{ color: 'var(--text-faint)' }}> / </span>
                    <span style={{ color: 'var(--text)' }}>{p.a.toFixed(1)}</span>
                  </td>
                  <NumTd>{p.csm != null ? p.csm.toFixed(2) : '—'}</NumTd>
                  <NumTd>{p.dmgShare}%</NumTd>
                  <td
                    className="tabular-nums"
                    style={{
                      padding: cellPad,
                      textAlign: 'right',
                      fontWeight: 700,
                      fontSize: 14,
                      color: 'var(--accent-2)',
                      verticalAlign: 'middle',
                    }}
                  >
                    {p.fp}
                  </td>
                  <td style={{ padding: cellPad, textAlign: 'center', verticalAlign: 'middle' }}>
                    <Sparkline
                      values={p.trend}
                      width={62}
                      height={20}
                      stroke={p.kda >= 5 ? 'var(--green)' : p.kda <= 2.5 ? 'var(--red)' : 'var(--accent)'}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {players.length === 0 && (
        <EmptyRow message="No players match the current filter." />
      )}
    </div>
  );
}

function NumTd({ children, color, weight }: { children: React.ReactNode; color?: string; weight?: number }) {
  return (
    <td
      className="tabular-nums"
      style={{
        padding: '12px 14px',
        textAlign: 'right',
        color: color || 'var(--text-h)',
        fontWeight: weight || 500,
        fontSize: 13,
        verticalAlign: 'middle',
      }}
    >
      {children}
    </td>
  );
}

/* ─────────────────────── 2) CARDS GRID ─────────────────────── */

function PlayersCards({ players }: { players: UIPlayer[] }) {
  if (players.length === 0) return <EmptyCard message="No players match the current filter." />;
  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}
    >
      {players.map((p) => <PlayerCard key={p.name} p={p} />)}
    </div>
  );
}

function PlayerCard({ p }: { p: UIPlayer }) {
  const { openPlayer } = useDrawer();
  const teamColor = 'var(--accent)';
  const roleColor = ROLE_COLOR[p.role] || teamColor;

  return (
    <button
      type="button"
      onClick={() => openPlayer(p.name)}
      className="card card-soft-shadow text-left transition-all overflow-hidden flex flex-col"
      style={{ borderRadius: 14, padding: 0, cursor: 'pointer' }}
    >
      <div
        className="relative"
        style={{
          padding: '14px 16px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, transparent) 0%, transparent 100%)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: 3,
            width: '100%',
            background: `linear-gradient(90deg, ${teamColor} 0%, ${roleColor} 100%)`,
          }}
        />
        <div className="flex items-start" style={{ gap: 12 }}>
          <PlayerAvatar name={p.name} image={p.image} role={p.role} size={48} />
          <div className="flex-1 min-w-0">
            <h3
              className="font-display"
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 600,
                color: 'var(--text-h)',
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
              }}
            >
              {p.name}
            </h3>
            <div
              className="flex items-center text-(--text-dim)"
              style={{ fontSize: 11, gap: 8, marginTop: 4 }}
            >
              <RoleChip role={p.role} size="sm" />
              {p.nationality && <span>{p.nationality}</span>}
            </div>
          </div>
          <div className="text-right">
            <div
              className="text-(--text-dim) uppercase"
              style={{ fontSize: 9, letterSpacing: '0.1em', marginBottom: 1 }}
            >
              Rank
            </div>
            <div
              className="font-display tabular-nums"
              style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-h)', lineHeight: 1 }}
            >
              #{p.rank}
            </div>
          </div>
        </div>
        <div
          className="flex items-center text-(--text-dim)"
          style={{ gap: 8, marginTop: 10, fontSize: 11 }}
        >
          <TeamMark short={p.teamShort} logo={p.teamLogo} size={18} />
          <span className="text-(--text) font-medium">{p.team}</span>
        </div>
      </div>

      {/* 2x2 stat grid */}
      <div
        className="grid"
        style={{ gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border)' }}
      >
        <StatCell
          label="Win rate"
          value={`${p.winRate.toFixed(1)}%`}
          accent={p.winRate >= 55 ? 'green' : p.winRate <= 45 ? 'red' : undefined}
        />
        <StatCell label="KDA" value={p.kda.toFixed(2)} sub={`${p.k.toFixed(1)}/${p.d.toFixed(1)}/${p.a.toFixed(1)}`} />
        <StatCell label="CS / min" value={p.csm != null ? p.csm.toFixed(2) : '—'} />
        <StatCell label="DMG share" value={`${p.dmgShare}%`} />
      </div>

      {/* Footer: sparkline + FP */}
      <div
        className="flex items-center"
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          gap: 12,
          background: 'var(--surface)',
        }}
      >
        <Sparkline
          values={p.trend}
          width={120}
          height={28}
          stroke="var(--accent-2)"
        />
        <div className="flex-1" />
        <div className="text-right">
          <div
            className="text-(--text-dim) uppercase"
            style={{ fontSize: 9, letterSpacing: '0.1em' }}
          >
            FP
          </div>
          <div
            className="font-display tabular-nums"
            style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-2)', lineHeight: 1 }}
          >
            {p.fp}
          </div>
        </div>
      </div>
    </button>
  );
}

function StatCell({
  label, value, sub, accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'green' | 'red';
}) {
  const color = accent === 'green' ? 'var(--green)' : accent === 'red' ? 'var(--red)' : 'var(--text-h)';
  return (
    <div style={{ background: 'var(--surface)', padding: '10px 14px' }}>
      <div
        className="text-(--text-dim) uppercase"
        style={{ fontSize: 9, letterSpacing: '0.1em', marginBottom: 2 }}
      >
        {label}
      </div>
      <div
        className="font-sans tabular-nums"
        style={{ fontSize: 15, fontWeight: 700, color, lineHeight: 1.1 }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="text-(--text-dim) tabular-nums"
          style={{ fontSize: 10.5, marginTop: 2 }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── 3) FANTASY BOARD ─────────────────────── */

function FantasyBoard({ players }: { players: UIPlayer[] }) {
  const top3 = players.slice(0, 3);
  const rest = players.slice(3);

  if (players.length === 0) return <EmptyCard message="No players match the current filter." />;

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      {top3.length > 0 && (
        <div
          className="grid items-end"
          style={{
            gridTemplateColumns: top3.length === 3 ? '1fr 1.15fr 1fr' : `repeat(${top3.length}, 1fr)`,
            gap: 14,
          }}
        >
          {top3[1] && <PodiumCard p={top3[1]} place={2} />}
          {top3[0] && <PodiumCard p={top3[0]} place={1} />}
          {top3[2] && <PodiumCard p={top3[2]} place={3} />}
        </div>
      )}

      {rest.length > 0 && (
        <div
          className="card card-soft-shadow overflow-hidden"
          style={{ borderRadius: 12 }}
        >
          <div
            className="flex items-baseline"
            style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', gap: 10 }}
          >
            <h2
              className="font-sans"
              style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)', letterSpacing: '-0.005em' }}
            >
              Fantasy leaderboard
            </h2>
            <span className="text-(--text-dim)" style={{ fontSize: 11.5 }}>
              · {players.length} players
            </span>
          </div>
          {rest.map((p, i) => (
            <FantasyRow key={p.name} p={p} isLast={i === rest.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function PodiumCard({ p, place }: { p: UIPlayer; place: 1 | 2 | 3 }) {
  const { openPlayer } = useDrawer();
  const medal = ['#d4a017', '#a3a3a3', '#c2410c'][place - 1];
  const isFirst = place === 1;

  return (
    <button
      type="button"
      onClick={() => openPlayer(p.name)}
      className="card text-left transition-all relative overflow-hidden"
      style={{
        padding: isFirst ? '22px 18px 18px' : '18px 16px 14px',
        borderRadius: 14,
        boxShadow: isFirst ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transform: isFirst ? 'translateY(-6px)' : 'none',
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: medal }} />

      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <div
          className="flex items-center justify-center text-white font-bold"
          style={{ width: 26, height: 26, borderRadius: 999, background: medal, fontSize: 13 }}
        >
          {place}
        </div>
        <span className="badge badge-accent">{p.ownership}% owned</span>
      </div>

      <div className="flex items-center" style={{ gap: 12, marginBottom: 14 }}>
        <PlayerAvatar name={p.name} image={p.image} role={p.role} size={isFirst ? 60 : 50} />
        <div className="flex-1 min-w-0">
          <h3
            className="font-display"
            style={{
              margin: 0,
              fontSize: isFirst ? 28 : 22,
              fontWeight: 700,
              color: 'var(--text-h)',
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
            }}
          >
            {p.name}
          </h3>
          <div
            className="flex items-center text-(--text-dim)"
            style={{ fontSize: 11.5, marginTop: 4, gap: 6 }}
          >
            <RoleChip role={p.role} size="sm" />
            <span>·</span>
            <TeamMark short={p.teamShort} logo={p.teamLogo} size={14} />
            <span>{p.teamShort}</span>
          </div>
        </div>
      </div>

      <div
        className="flex items-center justify-between"
        style={{
          background: 'var(--surface-sub)',
          borderRadius: 10,
          padding: '12px 14px',
          marginBottom: 10,
        }}
      >
        <div>
          <div
            className="text-(--text-dim) uppercase"
            style={{ fontSize: 9, letterSpacing: '0.1em', marginBottom: 1 }}
          >
            Fantasy points
          </div>
          <div
            className="font-display tabular-nums"
            style={{ fontSize: isFirst ? 38 : 32, fontWeight: 700, color: 'var(--accent-2)', lineHeight: 1 }}
          >
            {p.fp}
          </div>
        </div>
        <Sparkline values={p.trend} width={isFirst ? 92 : 76} height={32} stroke="var(--accent-2)" />
      </div>

      <div className="flex justify-between tabular-nums" style={{ fontSize: 11.5 }}>
        <MicroStat label="KDA" value={p.kda.toFixed(2)} />
        <MicroStat
          label="WR"
          value={`${p.winRate.toFixed(0)}%`}
          color={p.winRate >= 55 ? 'var(--green)' : p.winRate <= 45 ? 'var(--red)' : 'var(--text-h)'}
        />
        <MicroStat label="CS/m" value={p.csm != null ? p.csm.toFixed(2) : '—'} />
        <MicroStat label="DMG" value={`${p.dmgShare}%`} />
      </div>
    </button>
  );
}

function MicroStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div
        className="text-(--text-dim) uppercase"
        style={{ fontSize: 9, letterSpacing: '0.08em' }}
      >
        {label}
      </div>
      <div
        className="font-bold tabular-nums"
        style={{ fontSize: 13, color: color || 'var(--text-h)', marginTop: 2 }}
      >
        {value}
      </div>
    </div>
  );
}

function FantasyRow({ p, isLast }: { p: UIPlayer; isLast: boolean }) {
  const { openPlayer } = useDrawer();
  return (
    <button
      type="button"
      onClick={() => openPlayer(p.name)}
      className="w-full grid items-center transition-colors hover:bg-(--surface-sub) text-left"
      style={{
        gridTemplateColumns: '40px 1.4fr 110px 70px 60px 70px 70px 80px 70px',
        gap: 12,
        padding: '11px 18px',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        fontSize: 13,
      }}
    >
      <div
        className="tabular-nums font-semibold text-(--text-dim)"
        style={{ fontSize: 12 }}
      >
        {p.rank}
      </div>

      <div className="flex items-center min-w-0" style={{ gap: 10 }}>
        <PlayerAvatar name={p.name} image={p.image} role={p.role} size={32} />
        <div className="min-w-0">
          <div
            className="flex items-center font-semibold text-(--text-h)"
            style={{ fontSize: 13.5, gap: 6 }}
          >
            {p.name}
            <RoleChip role={p.role} size="sm" />
          </div>
          <div
            className="inline-flex items-center text-(--text-dim)"
            style={{ fontSize: 11, gap: 5 }}
          >
            <TeamMark short={p.teamShort} logo={p.teamLogo} size={12} />
            {p.teamShort}
          </div>
        </div>
      </div>

      <WinRateBar wr={p.winRate} width={56} />
      <div
        className="text-right tabular-nums font-semibold"
        style={{ color: p.kda >= 5 ? 'var(--green)' : 'var(--text-h)' }}
      >
        {p.kda.toFixed(2)}
      </div>
      <div className="text-right tabular-nums text-(--text)">
        {p.csm != null ? p.csm.toFixed(2) : '—'}
      </div>
      <div className="text-right tabular-nums text-(--text)">{p.dmgShare}%</div>
      <div className="flex justify-end">
        <Sparkline
          values={p.trend}
          width={64}
          height={20}
          stroke={p.kda >= 5 ? 'var(--green)' : 'var(--accent)'}
        />
      </div>
      <div
        className="text-right tabular-nums text-(--text-dim)"
        style={{ fontSize: 11.5 }}
      >
        {p.ownership}%
      </div>
      <div
        className="text-right tabular-nums font-display"
        style={{ fontWeight: 700, color: 'var(--accent-2)', fontSize: 15 }}
      >
        {p.fp}
      </div>
    </button>
  );
}

/* ── Empty states ───────────────────────────────────────────────────── */

function EmptyRow({ message }: { message: string }) {
  return (
    <div
      className="text-(--text-dim) text-center"
      style={{ padding: '60px 20px', fontSize: 13 }}
    >
      {message}
    </div>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div
      className="card text-center text-(--text-dim)"
      style={{ padding: 60, fontSize: 13 }}
    >
      {message}
    </div>
  );
}
