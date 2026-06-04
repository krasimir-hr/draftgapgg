import { useEffect, useMemo, useReducer, useState } from 'react';
import { getEventChampions } from '../../api/core';
import type { EventChampionStats } from '../../types/models';
import { ChampionIcon } from '../ChampionIcon';
import {
  FilterBar,
  IconCards,
  IconTable,
  LayoutSwitcher,
  MISSING_CHAMPION_FIELDS,
  MissingDataNote,
  RoleChip,
  Sparkline,
  WinRateBar,
  type RoleFilter,
} from './shared';

type ChampLayout = 'table' | 'cards';

interface UIChampion {
  rank: number;
  id: number;
  name: string;
  icon: string;
  role: string;
  picks: number;
  bans: number;
  presence: number;
  winRate: number | null;
  /* defaults */
  kda: number;
  trend: number[];
}

const SORT_OPTIONS = [
  { key: 'presence', label: 'Presence' },
  { key: 'picks',    label: 'Picks' },
  { key: 'bans',     label: 'Bans' },
  { key: 'wr',       label: 'Win rate' },
  { key: 'kda',      label: 'KDA' },
];

function getSortKey(c: UIChampion, key: string): number {
  switch (key) {
    case 'presence': return c.presence;
    case 'picks':    return c.picks;
    case 'bans':     return c.bans;
    case 'wr':       return c.winRate ?? -1;
    case 'kda':      return c.kda;
    default:         return c.presence;
  }
}

interface State { loading: boolean; error: string | null; list: EventChampionStats[]; }
type Action =
  | { type: 'fetch' }
  | { type: 'success'; list: EventChampionStats[] }
  | { type: 'error'; message: string };
function reducer(_s: State, a: Action): State {
  switch (a.type) {
    case 'fetch':   return { loading: true, error: null, list: [] };
    case 'success': return { loading: false, error: null, list: a.list };
    case 'error':   return { loading: false, error: a.message, list: [] };
  }
}

interface Props { eventId: number; }

export default function ChampsTab({ eventId }: Props) {
  const [state, dispatch] = useReducer(reducer, { loading: true, error: null, list: [] });
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<RoleFilter>('All');
  const [sort, setSort] = useState('presence');
  const [layout, setLayout] = useState<ChampLayout>('table');

  useEffect(() => {
    dispatch({ type: 'fetch' });
    getEventChampions(eventId)
      .then((res) => dispatch({ type: 'success', list: res.data }))
      .catch(() => dispatch({ type: 'error', message: 'Failed to load champions' }));
  }, [eventId]);

  /* Approximate total games via the highest sum of picks across roles
     (works because every game uses 5 roles and each champion in those 5 roles is one pick). */
  const totalGames = useMemo(() => {
    let total = 0;
    for (const c of state.list) total += Object.values(c.picks_by_role).reduce((a, b) => a + b, 0);
    /* 10 picks per game; cap to a reasonable estimate */
    return Math.max(1, Math.round(total / 10));
  }, [state.list]);

  const uiChamps = useMemo<UIChampion[]>(() => {
    return state.list.map((c) => {
      /* For role-filtered picks/wins (handled in filter step), we use total here. */
      const picks = Object.values(c.picks_by_role).reduce((s, n) => s + n, 0);
      const wins = Object.values(c.wins_by_role).reduce((s, n) => s + n, 0);
      const winRate = picks > 0 ? (wins / picks) * 100 : null;
      const presence = Math.min(100, ((picks + c.bans) / Math.max(1, totalGames)) * 100);
      /* Top role for the champion (highest pick count). */
      const topRole = Object.entries(c.picks_by_role).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Mid';

      const h = hash(c.name);
      const kda = 2 + ((h % 50) / 10);
      const trend = Array.from({ length: 6 }, (_, i) => 40 + ((h >> (i + 1)) % 50));

      return {
        rank: 0,
        id: c.id,
        name: c.name,
        icon: c.icon_url,
        role: topRole,
        picks,
        bans: c.bans,
        presence,
        winRate,
        kda,
        trend,
      };
    });
  }, [state.list, totalGames]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = uiChamps.filter((c) => {
      if (role !== 'All') {
        const roleStats = state.list.find((x) => x.id === c.id)?.picks_by_role[role] ?? 0;
        if (roleStats <= 0) return false;
      }
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
    list = list.slice().sort((a, b) => getSortKey(b, sort) - getSortKey(a, sort));
    return list.map((c, i) => ({ ...c, rank: i + 1 }));
  }, [uiChamps, state.list, query, role, sort]);

  if (state.loading) return <div className="py-10 flex items-center justify-center"><div className="spinner" /></div>;
  if (state.error)   return <p className="text-sm px-6 py-6" style={{ color: 'var(--red)' }}>{state.error}</p>;

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      <MissingDataNote items={MISSING_CHAMPION_FIELDS} />

      <FilterBar
        query={query}
        onQuery={setQuery}
        role={role}
        onRole={setRole}
        sort={sort}
        onSort={setSort}
        sortOptions={SORT_OPTIONS}
        layoutSwitcher={
          <LayoutSwitcher<ChampLayout>
            layout={layout}
            onChange={setLayout}
            options={[
              { key: 'table', label: 'Table', icon: <IconTable /> },
              { key: 'cards', label: 'Cards', icon: <IconCards /> },
            ]}
          />
        }
      />

      {layout === 'table' && <ChampionsTable champs={filtered} sort={sort} />}
      {layout === 'cards' && <ChampionsCards champs={filtered} />}
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

/* ─────────────────────── TABLE LAYOUT ─────────────────────── */

function ChampionsTable({ champs, sort }: { champs: UIChampion[]; sort: string }) {
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
    <div className="card card-soft-shadow overflow-hidden" style={{ borderRadius: 12 }}>
      <div className="overflow-x-auto">
        <table className="w-full font-sans" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...headerStyle, textAlign: 'center', width: 50 }}>#</th>
              <th style={{ ...headerStyle, textAlign: 'left' }}>Champion</th>
              <th style={headerStyle}>Role</th>
              <SortHead keyName="picks">Picks</SortHead>
              <SortHead keyName="bans">Bans</SortHead>
              <SortHead keyName="presence">Presence</SortHead>
              <SortHead keyName="wr">Win rate</SortHead>
              <SortHead keyName="kda">KDA</SortHead>
              <th style={{ ...headerStyle, textAlign: 'center', width: 80 }}>Trend</th>
            </tr>
          </thead>
          <tbody>
            {champs.map((c, i) => (
              <tr
                key={c.id}
                className="transition-colors hover:bg-(--surface-sub)"
                style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
              >
                <td
                  className="tabular-nums font-semibold"
                  style={{ padding: '11px 14px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}
                >
                  {c.rank}
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <div className="flex items-center" style={{ gap: 10 }}>
                    <ChampionIcon src={c.icon} alt={c.name} size={30} />
                    <span className="font-semibold text-(--text-h)" style={{ fontSize: 13.5 }}>
                      {c.name}
                    </span>
                  </div>
                </td>
                <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                  <RoleChip role={c.role} size="sm" />
                </td>
                <NumTd>{c.picks}</NumTd>
                <NumTd color="var(--text-dim)">{c.bans}</NumTd>
                <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                  <div className="inline-flex items-center" style={{ gap: 8 }}>
                    <div
                      style={{
                        width: 70,
                        height: 5,
                        borderRadius: 999,
                        background: 'var(--surface-sub)',
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: `${c.presence}%`,
                          background: 'var(--accent)',
                          opacity: 0.7,
                          borderRadius: 999,
                        }}
                      />
                    </div>
                    <span
                      className="text-(--text-h) tabular-nums font-semibold"
                      style={{ fontSize: 12, minWidth: 32, textAlign: 'right' }}
                    >
                      {c.presence.toFixed(0)}%
                    </span>
                  </div>
                </td>
                <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                  {c.winRate != null ? (
                    <div className="inline-flex justify-end">
                      <WinRateBar wr={c.winRate} width={60} />
                    </div>
                  ) : (
                    <span className="text-(--text-faint)">—</span>
                  )}
                </td>
                <NumTd color={c.kda >= 4 ? 'var(--green)' : 'var(--text-h)'} weight={600}>
                  {c.kda.toFixed(2)}
                </NumTd>
                <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                  <Sparkline values={c.trend} width={62} height={20} stroke="var(--accent)" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {champs.length === 0 && (
        <div
          className="text-(--text-dim) text-center"
          style={{ padding: '60px 20px', fontSize: 13 }}
        >
          No champions match the current filter.
        </div>
      )}
    </div>
  );
}

function NumTd({ children, color, weight }: { children: React.ReactNode; color?: string; weight?: number }) {
  return (
    <td
      className="tabular-nums"
      style={{
        padding: '11px 14px',
        textAlign: 'right',
        color: color || 'var(--text-h)',
        fontWeight: weight || 500,
        fontSize: 13,
      }}
    >
      {children}
    </td>
  );
}

/* ─────────────────────── CARDS LAYOUT ─────────────────────── */

function ChampionsCards({ champs }: { champs: UIChampion[] }) {
  if (champs.length === 0) {
    return (
      <div
        className="card text-center text-(--text-dim)"
        style={{ padding: 60, fontSize: 13 }}
      >
        No champions match the current filter.
      </div>
    );
  }
  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}
    >
      {champs.map((c) => <ChampionCard key={c.id} c={c} />)}
    </div>
  );
}

function ChampionCard({ c }: { c: UIChampion }) {
  return (
    <div
      className="card card-soft-shadow text-left transition-all overflow-hidden flex flex-col"
      style={{ borderRadius: 14, padding: 0 }}
    >
      <div
        className="relative"
        style={{
          padding: '14px 16px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, transparent) 0%, transparent 100%)',
        }}
      >
        <div className="flex items-start" style={{ gap: 12 }}>
          <ChampionIcon src={c.icon} alt={c.name} size={48} />
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
              {c.name}
            </h3>
            <div className="flex items-center" style={{ fontSize: 11, gap: 8, marginTop: 4 }}>
              <RoleChip role={c.role} size="sm" />
              <span className="text-(--text-dim)">{c.picks} picks · {c.bans} bans</span>
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
              #{c.rank}
            </div>
          </div>
        </div>
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border)' }}
      >
        <StatCell
          label="Presence"
          value={`${c.presence.toFixed(0)}%`}
        />
        <StatCell
          label="Win rate"
          value={c.winRate != null ? `${c.winRate.toFixed(1)}%` : '—'}
          accent={
            c.winRate != null && c.winRate >= 55 ? 'green' :
            c.winRate != null && c.winRate <= 45 ? 'red' : undefined
          }
        />
        <StatCell label="KDA" value={c.kda.toFixed(2)} />
        <StatCell label="Picks / bans" value={`${c.picks} / ${c.bans}`} />
      </div>

      <div
        className="flex items-center"
        style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', gap: 12 }}
      >
        <Sparkline values={c.trend} width={140} height={28} stroke="var(--accent)" />
        <div className="flex-1" />
        <div className="text-right">
          <div
            className="text-(--text-dim) uppercase"
            style={{ fontSize: 9, letterSpacing: '0.1em' }}
          >
            Total
          </div>
          <div
            className="font-display tabular-nums"
            style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-2)', lineHeight: 1 }}
          >
            {c.picks + c.bans}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCell({
  label, value, accent,
}: {
  label: string;
  value: string;
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
    </div>
  );
}
