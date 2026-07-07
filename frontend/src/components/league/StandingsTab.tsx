import { useEffect, useState } from 'react';
import type { EventStage, StandingsEntry } from '../../types/models';
import { getEventStandings } from '../../api/core';
import { StagePicker } from './shared';

interface Props {
  list: StandingsEntry[];
  teamShortNames: Record<string, string>;
  eventId: number;
  stages: EventStage[];
}

type ColKey = keyof StandingsEntry;

interface ColDef {
  key: ColKey;
  label: string;
  title: string;
  desc: boolean; // default sort direction: true = descending
  fmt: (e: StandingsEntry) => string;
  align?: 'center' | 'right';
}

const COLS: ColDef[] = [
  { key: 'games',           label: 'GP',     title: 'Games played',       desc: true,  fmt: (e) => String(e.games) },
  { key: 'game_wins',       label: 'W',      title: 'Game wins',          desc: true,  fmt: (e) => String(e.game_wins) },
  { key: 'losses',          label: 'L',      title: 'Game losses',        desc: false, fmt: (e) => String(e.games - e.game_wins) },
  { key: 'win_rate',        label: 'WR%',    title: 'Win rate (matches)', desc: true,  fmt: (e) => `${e.win_rate}%`, align: 'right' },
  { key: 'game_win_rate',   label: 'GWR%',   title: 'Game win rate',      desc: true,  fmt: (e) => `${e.game_win_rate}%` },
  { key: 'kills_per_game',  label: 'K/G',    title: 'Kills per game',     desc: true,  fmt: (e) => String(e.kills_per_game) },
  { key: 'deaths_per_game', label: 'D/G',    title: 'Deaths per game',    desc: false, fmt: (e) => String(e.deaths_per_game) },
  { key: 'kd_ratio',        label: 'K:D',    title: 'Kill:Death ratio',   desc: true,  fmt: (e) => e.kd_ratio != null ? String(e.kd_ratio) : '—' },
  { key: 'gold_per_min',    label: 'GPM',    title: 'Gold per minute',    desc: true,  fmt: (e) => e.gold_per_min ? e.gold_per_min.toLocaleString() : '—' },
  { key: 'towers_per_game', label: 'TWR/G',  title: 'Towers per game',    desc: true,  fmt: (e) => String(e.towers_per_game) },
  { key: 'dragons_per_game',label: 'DRG/G',  title: 'Dragons per game',   desc: true,  fmt: (e) => String(e.dragons_per_game) },
  { key: 'barons_per_game', label: 'BRN/G',  title: 'Barons per game',    desc: true,  fmt: (e) => String(e.barons_per_game) },
  { key: 'avg_game_length', label: 'AVG LEN',title: 'Avg game length (min)',desc: false,fmt: (e) => e.avg_game_length ? `${e.avg_game_length}m` : '—' },
];

export default function StandingsTab({ list: initialList, teamShortNames, eventId, stages }: Props) {
  const [sortKey, setSortKey] = useState<ColKey>('game_wins');
  const [sortDesc, setSortDesc] = useState(true);
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null);
  const [activeList, setActiveList] = useState<StandingsEntry[]>(initialList);

  useEffect(() => {
    if (selectedStageId === null) {
      setActiveList(initialList);
      return;
    }
    getEventStandings(eventId, { stage: selectedStageId })
      .then((r) => setActiveList(r.data))
      .catch(() => setActiveList([]));
  }, [selectedStageId, eventId, initialList]);

  if (activeList.length === 0) {
    return <p className="text-sm text-(--text-dim) py-6 px-6">No standings data yet.</p>;
  }

  function handleSort(col: ColDef) {
    if (sortKey === col.key) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(col.key);
      setSortDesc(col.desc);
    }
  }

  function getSortVal(e: StandingsEntry): number {
    if (sortKey === 'losses') return e.games - e.game_wins;
    return (e[sortKey] as number) ?? -Infinity;
  }

  const sorted = [...activeList].sort((a, b) => {
    const av = getSortVal(a);
    const bv = getSortVal(b);
    if (av === bv) return a.placement - b.placement;
    const cmp = (av as number) < (bv as number) ? -1 : 1;
    return sortDesc ? -cmp : cmp;
  });

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      {stages.length > 0 && (
        <div className="card card-soft-shadow" style={{ padding: '8px 14px' }}>
          <StagePicker stages={stages} selected={selectedStageId} onSelect={setSelectedStageId} />
        </div>
      )}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="w-full font-sans" style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <Th style={{ width: 58, textAlign: 'center', padding: '10px 8px 10px 24px' }}>#</Th>
              <Th style={{ textAlign: 'left', paddingLeft: 16 }}>Team</Th>
              {COLS.map((col, ci) => {
                const active = sortKey === col.key;
                const last = ci === COLS.length - 1;
                return (
                  <Th
                    key={col.key}
                    title={col.title}
                    onClick={() => handleSort(col)}
                    style={{ cursor: 'pointer', userSelect: 'none', textAlign: col.align ?? 'center', paddingRight: last ? 24 : undefined }}
                    active={active}
                  >
                    {col.label}
                    <SortArrow active={active} desc={sortDesc} />
                  </Th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry, i) => (
              <StandingsRow key={entry.team} entry={entry} index={i} sortKey={sortKey} teamShortNames={teamShortNames} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StandingsRow({ entry, index, sortKey, teamShortNames }: { entry: StandingsEntry; index: number; sortKey: ColKey; teamShortNames: Record<string, string> }) {
  const total = entry.wins + entry.losses;
  const s = sortKey;

  return (
    <tr
      className="transition-colors hover:bg-(--surface-sub)"
      style={{ borderTop: index > 0 ? '1px solid var(--border)' : 'none' }}
    >
      {/* Row number */}
      <td
        className="tabular-nums"
        style={{ padding: '12px 8px 12px 24px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 11.5, fontWeight: 600, width: 58 }}
      >
        {index + 1}
      </td>

      {/* Team */}
      <td style={{ padding: '10px 24px 10px 16px' }}>
        <div className="flex items-center" style={{ gap: 10 }}>
          {entry.logo ? (
            <img src={entry.logo} alt={entry.team} width={32} height={32} loading="lazy" decoding="async" style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--surface-sub)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', flexShrink: 0 }}>
              {entry.team.slice(0, 2)}
            </div>
          )}
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-h)', fontSize: 13, whiteSpace: 'nowrap' }}>{entry.team}</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 1, whiteSpace: 'nowrap' }}>{teamShortNames[entry.team] || ''}</div>
          </div>
        </div>
      </td>

      {/* GP */}
      <Td dim active={s === 'games'}>{entry.games}</Td>
      {/* W */}
      <Td active={s === 'game_wins'}>{entry.game_wins}</Td>
      {/* L */}
      <Td active={s === 'losses'}>{entry.games - entry.game_wins}</Td>
      {/* WR% */}
      <Td active={s === 'win_rate'} alignRight>
        <div className="inline-flex items-center justify-end" style={{ gap: 6 }}>
          <span>{entry.win_rate.toFixed(1)}%</span>
          {total > 0 && (
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ width: `${entry.win_rate}%`, height: '100%', background: 'var(--accent-2)', borderRadius: 2 }} />
            </div>
          )}
        </div>
      </Td>
      {/* GWR% */}
      <Td active={s === 'game_win_rate'}>{entry.game_win_rate}%</Td>
      {/* K/G */}
      <Td active={s === 'kills_per_game'}>{entry.kills_per_game}</Td>
      {/* D/G */}
      <Td dim active={s === 'deaths_per_game'}>{entry.deaths_per_game}</Td>
      {/* K:D */}
      <Td bright active={s === 'kd_ratio'}>{entry.kd_ratio != null ? entry.kd_ratio : '—'}</Td>
      {/* GPM */}
      <Td active={s === 'gold_per_min'}>{entry.gold_per_min ? entry.gold_per_min.toLocaleString() : '—'}</Td>
      {/* TWR/G */}
      <Td dim active={s === 'towers_per_game'}>{entry.towers_per_game}</Td>
      {/* DRG/G */}
      <Td dim active={s === 'dragons_per_game'}>{entry.dragons_per_game}</Td>
      {/* BRN/G */}
      <Td dim active={s === 'barons_per_game'}>{entry.barons_per_game}</Td>
      {/* AVG LEN */}
      <Td dim active={s === 'avg_game_length'} padRight>{entry.avg_game_length ? `${entry.avg_game_length}m` : '—'}</Td>
    </tr>
  );
}

function Th({
  children, style, onClick, title, active,
}: {
  children?: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
  title?: string;
  active?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const color = active ? 'var(--accent-2)' : hovered && onClick ? 'var(--text-h)' : 'var(--text-dim)';
  return (
    <th
      onClick={onClick}
      title={title}
      className={onClick ? 'th-sort' : undefined}
      onMouseEnter={() => onClick && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '10px 8px',
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
        color,
        whiteSpace: 'nowrap',
        transition: 'color 0.15s',
        ...style,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {onClick && <span aria-hidden style={{ width: 11, display: 'inline-block', flexShrink: 0 }} />}
        {children}
      </div>
    </th>
  );
}

function Td({ children, dim, bright, active, alignRight, padRight }: { children: React.ReactNode; dim?: boolean; bright?: boolean; active?: boolean; alignRight?: boolean; padRight?: boolean }) {
  return (
    <td
      className="tabular-nums"
      style={{
        padding: padRight ? '10px 24px 10px 8px' : '10px 8px',
        textAlign: alignRight ? 'right' : 'center',
        color: active ? 'var(--text-h)' : bright ? 'var(--text-h)' : dim ? 'var(--text-dim)' : 'var(--text)',
        fontWeight: active || bright ? 600 : 500,
        fontSize: 12.5,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  );
}

function SortArrow({ active, desc }: { active: boolean; desc: boolean }) {
  return (
    <span style={{ marginLeft: 3, fontSize: 8, color: active ? 'var(--accent-2)' : undefined, opacity: active ? 1 : 0.25 }}>
      {active ? (desc ? '↓' : '↑') : '↕'}
    </span>
  );
}
