import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EventPlayerStats, EventStage, RatingEntry, FormGame, ChampStat } from '../../types/models';
import { getEventPlayers, getEventRatings } from '../../api/core';
import { useDrawer } from '../../contexts/DrawerContext';
import { useEsportsSubHeader } from '../EsportsLayout';
import {
  ChampCluster,
  FilterBar,
  IconCards,
  IconTable,
  LayoutSwitcher,
  FormGraph,
  PlayerAvatar,
  RoleChip,
  StagePicker,
  TeamMark,
  ROLE_COLOR,
  type RoleFilter,
  type ViewLayout,
} from './shared';

/* UI player shape (scoreboard stats + merged performance ratings) */
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
  /* from ratings — null/empty when the player has no rating row */
  pr: number | null;
  carry: number | null;
  mvps: number | null;
  form: FormGame[];
  champions: ChampStat[];
}

function getSortKey(p: UIPlayer, key: string): number {
  switch (key) {
    case 'pr':    return p.pr ?? -1;
    case 'kda':   return p.kda;
    case 'csm':   return p.csm ?? -1;
    case 'carry': return p.carry ?? -1;
    case 'mvps':  return p.mvps ?? -1;
    case 'games': return p.games;
    default:      return p.pr ?? -1;
  }
}

interface Props {
  players: EventPlayerStats[];
  ratings: RatingEntry[];
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
  eventId: number;
  stages: EventStage[];
}

export default function PlayersTab({ players: initialPlayers, ratings: initialRatings, teamLogos, teamShortNames, eventId, stages }: Props) {
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null);
  const [activePlayers, setActivePlayers] = useState<EventPlayerStats[]>(initialPlayers);
  const [activeRatings, setActiveRatings] = useState<RatingEntry[]>(initialRatings);
  const [role, setRole] = useState<RoleFilter>('All');
  const [team, setTeam] = useState('All');
  const [sort, setSort] = useState('pr');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [layout, setLayout] = useState<ViewLayout>('table');

  /* Fetch stage-specific data when stage selection changes. */
  useEffect(() => {
    if (selectedStageId === null) {
      setActivePlayers(initialPlayers);
      setActiveRatings(initialRatings);
      return;
    }
    const params = { stage: selectedStageId };
    Promise.all([
      getEventPlayers(eventId, params).then((r) => r.data).catch(() => []),
      getEventRatings(eventId).then((r) => r.data).catch(() => []),
    ]).then(([p, r]) => { setActivePlayers(p); setActiveRatings(r); });
  }, [selectedStageId, eventId, initialPlayers, initialRatings]);

  function handleSort(key: string) {
    if (key === sort) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSort(key); setSortDir('desc'); }
  }

  const uiPlayers = useMemo<UIPlayer[]>(() => {
    const ratingByName = new Map(activeRatings.map((r) => [r.name, r]));
    return activePlayers.map((p) => {
      const kda = (p.avg_kills + p.avg_assists) / Math.max(p.avg_deaths, 0.1);
      const r = ratingByName.get(p.name);
      return {
        rank: 0,
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
        pr: r?.avg_pr ?? null,
        carry: r ? r.avg_contribution * 100 : null,
        mvps: r?.mvps ?? null,
        form: r?.form ?? [],
        champions: r?.champions ?? [],
      };
    });
  }, [activePlayers, activeRatings, teamLogos, teamShortNames]);

  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of activePlayers) set.add(p.team);
    return [
      { value: 'All', label: 'All teams' },
      ...Array.from(set).sort().map((t) => ({ value: t, label: teamShortNames[t] || t })),
    ];
  }, [activePlayers, teamShortNames]);

  const filtered = useMemo(() => {
    let list = uiPlayers.filter((p) => {
      if (role !== 'All' && p.role !== role) return false;
      if (team !== 'All' && p.team !== team) return false;
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    list = list.slice().sort((a, b) => dir * (getSortKey(a, sort) - getSortKey(b, sort)));
    return list.map((p, i) => ({ ...p, rank: i + 1 }));
  }, [uiPlayers, role, team, sort, sortDir]);

  const subHeaderEl = useEsportsSubHeader();
  const filter = (
    <FilterBar
      stagePicker={stages.length > 0 ? <StagePicker stages={stages} selected={selectedStageId} onSelect={setSelectedStageId} /> : undefined}
      role={role}
      onRole={setRole}
      team={team}
      onTeam={setTeam}
      teamOptions={teamOptions}
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
    <div className="flex flex-col" style={{ gap: 6 }}>
      {/* Filter lives in the fixed header region (portaled) so only the data scrolls. */}
      {subHeaderEl ? createPortal(<div style={{ marginTop: 12 }}>{filter}</div>, subHeaderEl) : filter}

      {layout === 'table' && <PlayersTable players={filtered} sort={sort} sortDir={sortDir} onSort={handleSort} teamShortNames={teamShortNames} />}
      {layout === 'cards' && <PlayersCards players={filtered} teamShortNames={teamShortNames} />}
    </div>
  );
}

/* 1) TABLE LAYOUT */

function PlayersTable({
  players, sort, sortDir, onSort, teamShortNames,
}: {
  players: UIPlayer[];
  sort: string;
  sortDir: 'asc' | 'desc';
  onSort: (key: string) => void;
  teamShortNames: Record<string, string>;
}) {
  const { openPlayer } = useDrawer();
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
    // A spacer matching the arrow's width sits on the left so the label stays
    // centered over the (centered) column values rather than being pushed left.
    const arrowW = 12;
    return (
      <th style={headerStyle}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
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
        </div>
      </th>
    );
  };

  return (
    <div
      className="card card-soft-shadow"
      style={{ borderRadius: 12, border: 'none', background: 'var(--surface)' }}
    >
        <table className="w-full font-sans" style={{ borderCollapse: 'collapse', fontSize: 12.5, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 42 }} />   {/* # */}
            <col style={{ width: 52 }} />   {/* Team — logo only */}
            <col style={{ width: 52 }} />   {/* Role */}
            <col style={{ width: 140 }} />   {/* Player */}
            <col style={{ width: 60 }} />   {/* Games */}
            <col style={{ width: 62 }} />   {/* PR */}
            <col style={{ width: 62 }} />   {/* KDA */}
            <col style={{ width: 96 }} />   {/* K/D/A */}
            <col style={{ width: 65 }} />   {/* CS/m */}
            <col style={{ width: 68 }} />   {/* Carry% */}
            <col style={{ width: 58 }} />   {/* MVPs */}
            <col style={{ width: 72 }} />   {/* Form */}
            <col style={{ width: 108 }} />  {/* Best champs */}
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ ...headerStyle, textAlign: 'center', width: 42 }}>#</th>
              <th style={{ ...headerStyle, width: 52 }}>Team</th>
              <th style={{ ...headerStyle, width: 52 }}>Role</th>
              <th style={{ ...headerStyle, textAlign: 'left' }}>Player</th>
              <SortHead keyName="games">Games</SortHead>
              <SortHead keyName="pr">PR</SortHead>
              <SortHead keyName="kda">KDA</SortHead>
              <th style={headerStyle}>K / D / A</th>
              <SortHead keyName="csm">CS / m</SortHead>
              <SortHead keyName="carry">Carry%</SortHead>
              <SortHead keyName="mvps">MVPs</SortHead>
              <th style={{ ...headerStyle, textAlign: 'center', width: 72 }}>Form</th>
              <th style={{ ...headerStyle, width: 108, paddingRight: 20 }}>Best champs</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr
                key={p.name}
                onClick={() => openPlayer(p.name)}
                className="cursor-pointer transition-colors hover:bg-(--surface-sub)"
                style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
              >
                <td
                  className="tabular-nums"
                  style={{ padding: cellPad, textAlign: 'center', color: 'var(--text-dim)', fontSize: 11.5, verticalAlign: 'middle' }}
                >
                  {p.rank}
                </td>
                <td style={{ padding: cellPad, textAlign: 'center', verticalAlign: 'middle' }}>
                  <div className="inline-flex justify-center">
                    <TeamMark short={p.teamShort} logo={p.teamLogo} size={22} />
                  </div>
                </td>
                <td style={{ padding: cellPad, textAlign: 'center', verticalAlign: 'middle' }}>
                  <div className="inline-flex justify-center">
                    <RoleChip role={p.role} size="md" />
                  </div>
                </td>
                <td style={{ padding: cellPad, verticalAlign: 'middle' }}>
                  <div
                    style={{ color: 'var(--text-h)', fontWeight: 600, fontSize: 13 }}
                  >
                    {p.name}
                  </div>
                  {p.nationality && (
                    <div
                      className="text-(--text-dim)"
                      style={{ fontSize: 11, marginTop: 1 }}
                    >
                      {p.nationality}
                    </div>
                  )}
                </td>
                <NumTd>{p.games}</NumTd>
                <NumTd color="var(--accent-2)" weight={700}>{p.pr != null ? p.pr.toFixed(1) : '—'}</NumTd>
                <NumTd weight={600}>{p.kda.toFixed(2)}</NumTd>
                <td
                  className="tabular-nums"
                  style={{ padding: cellPad, textAlign: 'center', color: 'var(--text-dim)', fontSize: 11.5, verticalAlign: 'middle', whiteSpace: 'nowrap' }}
                >
                  <span style={{ color: 'var(--text)' }}>{p.k.toFixed(1)}</span>
                  <span style={{ color: 'var(--text-faint)' }}> / </span>
                  <span style={{ color: 'var(--text)' }}>{p.d.toFixed(1)}</span>
                  <span style={{ color: 'var(--text-faint)' }}> / </span>
                  <span style={{ color: 'var(--text)' }}>{p.a.toFixed(1)}</span>
                </td>
                <NumTd>{p.csm != null ? p.csm.toFixed(2) : '—'}</NumTd>
                <NumTd>{p.carry != null ? `${p.carry.toFixed(0)}%` : '—'}</NumTd>
                <NumTd>{p.mvps || '—'}</NumTd>
                <td style={{ padding: cellPad, textAlign: 'center', verticalAlign: 'middle' }}>
                  <FormGraph games={p.form} width={62} height={20} stroke="var(--accent)" teamShortNames={teamShortNames} />
                </td>
                <td style={{ padding: '12px 20px 12px 14px', textAlign: 'center', verticalAlign: 'middle' }}>
                  <ChampCluster champs={p.champions} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

/* 2) CARDS GRID */

function PlayersCards({ players, teamShortNames }: { players: UIPlayer[]; teamShortNames: Record<string, string> }) {
  if (players.length === 0) return <EmptyCard message="No players match the current filter." />;
  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}
    >
      {players.map((p) => <PlayerCard key={p.name} p={p} teamShortNames={teamShortNames} />)}
    </div>
  );
}

function PlayerCard({ p, teamShortNames }: { p: UIPlayer; teamShortNames: Record<string, string> }) {
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
        <StatCell label="Rating (PR)" value={p.pr != null ? p.pr.toFixed(1) : '—'} />
        <StatCell label="KDA" value={p.kda.toFixed(2)} sub={`${p.k.toFixed(1)}/${p.d.toFixed(1)}/${p.a.toFixed(1)}`} />
        <StatCell label="CS / min" value={p.csm != null ? p.csm.toFixed(2) : '—'} />
        <StatCell label="Carry %" value={p.carry != null ? `${p.carry.toFixed(0)}%` : '—'} />
      </div>

      {/* Best champions strip */}
      {p.champions.length > 0 && (
        <div
          className="flex items-center"
          style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', gap: 8, background: 'var(--surface)' }}
        >
          <span className="text-(--text-dim) uppercase" style={{ fontSize: 9, letterSpacing: '0.1em' }}>Best champs</span>
          <div className="flex-1" />
          <ChampCluster champs={p.champions} />
        </div>
      )}

      {/* Footer: MVPs + form graph */}
      <div
        className="flex items-center"
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          gap: 12,
          background: 'var(--surface)',
        }}
      >
        <FooterStat label="MVPs" value={p.mvps != null ? String(p.mvps) : '—'} />
        <div className="flex-1" />
        <FormGraph games={p.form} width={120} height={28} stroke="var(--accent-2)" teamShortNames={teamShortNames} />
      </div>
    </button>
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
