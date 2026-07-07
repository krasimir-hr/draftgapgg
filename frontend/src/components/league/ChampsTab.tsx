import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EventChampionStats, EventStage } from '../../types/models';
import { getEventChampions } from '../../api/core';
import { ChampionIcon } from '../ChampionIcon';
import { useEsportsSubHeader } from '../EsportsLayout';
import {
  FilterBar,
  IconCards,
  IconTable,
  LayoutSwitcher,
  RoleChip,
  RoleIcon,
  StagePicker,
  WinRateBar,
  ROLE_COLOR,
  type RoleFilter,
  type ViewLayout,
} from './shared';

interface RoleShare {
  role: string;
  picks: number;
}

interface UIChampion {
  rank: number;
  id: number;
  name: string;
  icon: string;
  role: string;            // top role (most-picked)
  roles: RoleShare[];      // every role it's played, by pick count
  picks: number;           // a pick == one game appearance
  bans: number;
  contested: number;       // picks + bans
  presence: number;        // % of games it was picked or banned
  winRate: number | null;
  kda: number;             // (K + A) / D across the event
  k: number;               // avg per game
  d: number;
  a: number;
}

function getSortKey(c: UIChampion, key: string): number {
  switch (key) {
    case 'presence':  return c.presence;
    case 'picks':     return c.picks;
    case 'bans':      return c.bans;
    case 'contested': return c.contested;
    case 'wr':        return c.winRate ?? -1;
    case 'kda':       return c.kda;
    default:          return c.presence;
  }
}

interface Props {
  champions: EventChampionStats[];
  eventId: number;
  stages: EventStage[];
}

export default function ChampsTab({ champions: initialChampions, eventId, stages }: Props) {
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null);
  const [activeChampions, setActiveChampions] = useState<EventChampionStats[]>(initialChampions);
  const [role, setRole] = useState<RoleFilter>('All');
  const [sort, setSort] = useState('presence');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [layout, setLayout] = useState<ViewLayout>('table');

  useEffect(() => {
    if (selectedStageId === null) {
      setActiveChampions(initialChampions);
      return;
    }
    getEventChampions(eventId, { stage: selectedStageId })
      .then((r) => setActiveChampions(r.data))
      .catch(() => setActiveChampions([]));
  }, [selectedStageId, eventId, initialChampions]);

  function handleSort(key: string) {
    if (key === sort) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSort(key); setSortDir('desc'); }
  }

  const totalGames = useMemo(() => {
    let total = 0;
    for (const c of activeChampions) total += Object.values(c.picks_by_role).reduce((a, b) => a + b, 0);
    return Math.max(1, Math.round(total / 10));
  }, [activeChampions]);

  const uiChamps = useMemo<UIChampion[]>(() => {
    const roleFilter = role === 'All' ? null : role;
    return activeChampions.map((c) => {
      const allRoles = Object.entries(c.picks_by_role)
        .map(([role, picks]) => ({ role, picks }))
        .sort((a, b) => b.picks - a.picks);

      const picks = roleFilter
        ? (c.picks_by_role[roleFilter] ?? 0)
        : allRoles.reduce((s, r) => s + r.picks, 0);
      const wins = roleFilter
        ? (c.wins_by_role[roleFilter] ?? 0)
        : Object.values(c.wins_by_role).reduce((s, n) => s + n, 0);
      const winRate = picks > 0 ? (wins / picks) * 100 : null;

      const kd = roleFilter ? c.kda_by_role[roleFilter] : null;
      const kills = roleFilter ? (kd?.kills ?? 0) : c.kills;
      const deaths = roleFilter ? (kd?.deaths ?? 0) : c.deaths;
      const assists = roleFilter ? (kd?.assists ?? 0) : c.assists;
      const kda = (kills + assists) / Math.max(deaths, 1);

      const contested = picks + c.bans;
      // Bans aren't attributable to a role, so a role view ranks by that role's
      // pick rate; only the "All" view folds bans into presence (pick+ban rate).
      const presence = Math.min(100, ((roleFilter ? picks : contested) / totalGames) * 100);
      const roles = roleFilter ? allRoles.filter((r) => r.role === roleFilter) : allRoles;

      return {
        rank: 0,
        id: c.id,
        name: c.name,
        icon: c.icon_url,
        role: roleFilter ?? allRoles[0]?.role ?? 'Mid',
        roles,
        picks,
        bans: c.bans,
        contested,
        presence,
        winRate,
        kda,
        k: picks > 0 ? kills / picks : 0,
        d: picks > 0 ? deaths / picks : 0,
        a: picks > 0 ? assists / picks : 0,
      };
    });
  }, [activeChampions, totalGames, role]);

  const filtered = useMemo(() => {
    let list = uiChamps.filter((c) => {
      if (role !== 'All' && c.picks <= 0) return false;
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    list = list.slice().sort((a, b) => dir * (getSortKey(a, sort) - getSortKey(b, sort)));
    return list.map((c, i) => ({ ...c, rank: i + 1 }));
  }, [uiChamps, role, sort, sortDir]);

  const subHeaderEl = useEsportsSubHeader();
  const filter = (
    <FilterBar
      stagePicker={stages.length > 0 ? <StagePicker stages={stages} selected={selectedStageId} onSelect={setSelectedStageId} /> : undefined}
      role={role}
      onRole={setRole}
      layoutSwitcher={
        <LayoutSwitcher<ViewLayout>
          layout={layout}
          onChange={setLayout}
          options={[
            { key: 'table', label: 'Table', icon: <IconTable /> },
            { key: 'cards', label: 'Cards', icon: <IconCards /> },
          ]}
        />
      }
    />
  );

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      {/* Filter lives in the fixed header region (portaled) so only the data scrolls. */}
      {subHeaderEl ? createPortal(<div style={{ marginTop: 12 }}>{filter}</div>, subHeaderEl) : filter}

      {layout === 'table' && <ChampionsTable champs={filtered} sort={sort} sortDir={sortDir} onSort={handleSort} />}
      {layout === 'cards' && <ChampionsCards champs={filtered} />}
    </div>
  );
}

/* 1) TABLE LAYOUT */

function ChampionsTable({
  champs, sort, sortDir, onSort,
}: {
  champs: UIChampion[];
  sort: string;
  sortDir: 'asc' | 'desc';
  onSort: (key: string) => void;
}) {
  const headerStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '12px 14px',
    fontSize: 9.5,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-dim)',
    fontFamily: 'var(--font-sans)',
    whiteSpace: 'nowrap',
    // Stick the header row to the top of the scroll body (the filter now lives
    // in the fixed header above). Box-shadow (not border) draws the divider so
    // it stays put with border-collapse tables.
    position: 'sticky',
    top: 0,
    zIndex: 3,
    background: 'var(--surface)',
    boxShadow: 'inset 0 -1px 0 var(--border)',
  };
  const cellPad = '12px 14px';

  const SortHead = ({ keyName, children }: { keyName: string; children: React.ReactNode }) => {
    const active = sort === keyName;
    const arrowW = 12;
    return (
      <th style={headerStyle}>
        <button
          type="button"
          onClick={() => onSort(keyName)}
          className="inline-flex items-center justify-center uppercase"
          style={{
            color: active ? 'var(--text-h)' : 'var(--text-dim)',
            font: 'inherit',
            letterSpacing: 'inherit',
            cursor: 'pointer',
          }}
        >
          <span aria-hidden style={{ width: arrowW, display: 'inline-block' }} />
          {children}
          <span style={{ width: arrowW, textAlign: 'left', fontSize: 9.5, opacity: active ? 1 : 0.25 }}>
            {active && sortDir === 'asc' ? '↑' : '↓'}
          </span>
        </button>
      </th>
    );
  };

  return (
    <div className="card card-soft-shadow" style={{ borderRadius: 12, border: 'none', background: 'var(--surface)' }}>
        <table className="w-full font-sans" style={{ borderCollapse: 'collapse', fontSize: 12.5, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 42 }} />   {/* # */}
            <col />                          {/* Champion — flexible */}
            <col style={{ width: 156 }} />  {/* Roles */}
            <col style={{ width: 70 }} />   {/* Picks */}
            <col style={{ width: 70 }} />   {/* Bans */}
            <col style={{ width: 70 }} />   {/* P+B */}
            <col style={{ width: 130 }} />  {/* Presence */}
            <col style={{ width: 130 }} />  {/* Win rate */}
            <col style={{ width: 70 }} />   {/* KDA */}
            <col style={{ width: 112 }} />  {/* K/D/A */}
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ ...headerStyle, textAlign: 'center', width: 50 }}>#</th>
              <th style={{ ...headerStyle, textAlign: 'left' }}>Champion</th>
              <th style={{ ...headerStyle, textAlign: 'left' }}>Roles</th>
              <SortHead keyName="picks">Picks</SortHead>
              <SortHead keyName="bans">Bans</SortHead>
              <SortHead keyName="contested">P+B</SortHead>
              <SortHead keyName="presence">Presence</SortHead>
              <SortHead keyName="wr">Win rate</SortHead>
              <SortHead keyName="kda">KDA</SortHead>
              <th style={headerStyle}>K / D / A</th>
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
                  className="tabular-nums"
                  style={{ padding: cellPad, textAlign: 'center', color: 'var(--text-dim)', fontSize: 11.5, verticalAlign: 'middle' }}
                >
                  {c.rank}
                </td>
                <td style={{ padding: cellPad, verticalAlign: 'middle' }}>
                  <div className="flex items-center" style={{ gap: 10 }}>
                    <ChampionIcon src={c.icon} alt={c.name} size={34} />
                    <span style={{ color: 'var(--text-h)', fontWeight: 600, fontSize: 13 }}>
                      {c.name}
                    </span>
                  </div>
                </td>
                <td style={{ padding: cellPad, verticalAlign: 'middle' }}>
                  <RoleSpread roles={c.roles} />
                </td>
                <NumTd weight={600}>{c.picks}</NumTd>
                <NumTd color="var(--text-dim)">{c.bans}</NumTd>
                <NumTd>{c.contested}</NumTd>
                <td style={{ padding: cellPad, textAlign: 'center', verticalAlign: 'middle' }}>
                  <div className="inline-flex items-center" style={{ gap: 8 }}>
                    <div
                      style={{
                        width: 60,
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
                      style={{ fontSize: 12, minWidth: 30, textAlign: 'right' }}
                    >
                      {c.presence.toFixed(0)}%
                    </span>
                  </div>
                </td>
                <td style={{ padding: cellPad, textAlign: 'center', verticalAlign: 'middle' }}>
                  {c.winRate != null ? (
                    <div className="inline-flex justify-center">
                      <WinRateBar wr={c.winRate} width={56} neutral />
                    </div>
                  ) : (
                    <span className="text-(--text-faint)">—</span>
                  )}
                </td>
                <NumTd weight={600}>
                  {c.kda.toFixed(2)}
                </NumTd>
                <td
                  className="tabular-nums"
                  style={{ padding: cellPad, textAlign: 'center', color: 'var(--text-dim)', fontSize: 11.5, verticalAlign: 'middle', whiteSpace: 'nowrap' }}
                >
                  <span style={{ color: 'var(--text)' }}>{c.k.toFixed(1)}</span>
                  <span style={{ color: 'var(--text-faint)' }}> / </span>
                  <span style={{ color: 'var(--text)' }}>{c.d.toFixed(1)}</span>
                  <span style={{ color: 'var(--text-faint)' }}> / </span>
                  <span style={{ color: 'var(--text)' }}>{c.a.toFixed(1)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      {champs.length === 0 && (
        <EmptyRow message="No champions match the current filter." />
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
        textAlign: 'center',
        color: color || 'var(--text-h)',
        fontWeight: weight || 500,
        fontSize: 12.5,
        verticalAlign: 'middle',
      }}
    >
      {children}
    </td>
  );
}

/* A horizontal spread of the roles a champion is played in, by pick count. */
function RoleSpread({ roles, gap = 10 }: { roles: RoleShare[]; gap?: number }) {
  if (roles.length === 0) return <span className="text-(--text-dim)">—</span>;
  return (
    <div className="inline-flex items-center" style={{ gap, verticalAlign: 'middle' }}>
      {roles.map(({ role, picks }) => (
        <span
          key={role}
          className="inline-flex items-center"
          style={{ gap: 4 }}
          title={`${role}: ${picks} pick${picks === 1 ? '' : 's'}`}
        >
          <RoleIcon role={role} size={14} color="var(--text)" />
          <span className="tabular-nums text-(--text-dim)" style={{ fontSize: 11 }}>
            {picks}
          </span>
        </span>
      ))}
    </div>
  );
}

/* 2) CARDS GRID */

function ChampionsCards({ champs }: { champs: UIChampion[] }) {
  if (champs.length === 0) return <EmptyCard message="No champions match the current filter." />;
  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}
    >
      {champs.map((c) => <ChampionCard key={c.id} c={c} />)}
    </div>
  );
}

function ChampionCard({ c }: { c: UIChampion }) {
  const roleColor = ROLE_COLOR[c.role] || 'var(--accent)';
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
          background: 'transparent',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: 3,
            width: '100%',
            background: `linear-gradient(90deg, var(--accent) 0%, ${roleColor} 100%)`,
          }}
        />
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

      {/* 2x2 stat grid */}
      <div
        className="grid"
        style={{ gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border)' }}
      >
        <StatCell label="Presence" value={`${c.presence.toFixed(0)}%`} />
        <StatCell
          label="Win rate"
          value={c.winRate != null ? `${c.winRate.toFixed(1)}%` : '—'}
        />
        <StatCell label="KDA" value={c.kda.toFixed(2)} sub={`${c.k.toFixed(1)}/${c.d.toFixed(1)}/${c.a.toFixed(1)}`} />
        <StatCell label="Picks / bans" value={`${c.picks} / ${c.bans}`} />
      </div>

      {/* Roles strip */}
      {c.roles.length > 0 && (
        <div
          className="flex items-center"
          style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', gap: 8, background: 'var(--surface)' }}
        >
          <span className="text-(--text-dim) uppercase" style={{ fontSize: 9, letterSpacing: '0.1em' }}>Roles</span>
          <div className="flex-1" />
          <RoleSpread roles={c.roles} />
        </div>
      )}

      {/* Footer: contested total */}
      <div
        className="flex items-center"
        style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', gap: 12, background: 'var(--surface)' }}
      >
        <FooterStat label="Win rate" value={c.winRate != null ? `${c.winRate.toFixed(0)}%` : '—'} />
        <div className="flex-1" />
        <div className="text-right">
          <div
            className="text-(--text-dim) uppercase"
            style={{ fontSize: 9, letterSpacing: '0.1em' }}
          >
            Pick + ban
          </div>
          <div
            className="font-display tabular-nums"
            style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-2)', lineHeight: 1, marginTop: 2 }}
          >
            {c.contested}
          </div>
        </div>
      </div>
    </div>
  );
}

function FooterStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="text-(--text-dim) uppercase"
        style={{ fontSize: 9, letterSpacing: '0.1em' }}
      >
        {label}
      </div>
      <div
        className="font-sans tabular-nums"
        style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-h)', lineHeight: 1.1, marginTop: 2 }}
      >
        {value}
      </div>
    </div>
  );
}

function StatCell({
  label, value, sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
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
        style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-h)', lineHeight: 1.1 }}
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

/* Empty states */

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
