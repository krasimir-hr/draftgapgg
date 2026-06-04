import { useEffect, useMemo, useReducer, useState } from 'react';
import { getMatches } from '../../api/core';
import type { Match } from '../../types/models';
import { Badge, TeamMark } from './shared';

type Scope = 'all' | 'upcoming' | 'recent';

interface State { loading: boolean; error: string | null; list: Match[]; }
type Action =
  | { type: 'fetch' }
  | { type: 'success'; list: Match[] }
  | { type: 'error'; message: string };
function reducer(_s: State, a: Action): State {
  switch (a.type) {
    case 'fetch':   return { loading: true, error: null, list: [] };
    case 'success': return { loading: false, error: null, list: a.list };
    case 'error':   return { loading: false, error: a.message, list: [] };
  }
}

interface DateGroup {
  label: string;
  date: Date;
  matches: Match[];
}

function groupByDate(matches: Match[]): DateGroup[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const groups = new Map<string, DateGroup>();
  const noDate: Match[] = [];

  for (const m of matches) {
    if (!m.datetime_utc) { noDate.push(m); continue; }
    const d = new Date(m.datetime_utc);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((dayStart.getTime() - today.getTime()) / 86400000);

    let label: string;
    if (diffDays === 0)       label = 'Today';
    else if (diffDays === 1)  label = 'Tomorrow';
    else if (diffDays === -1) label = 'Yesterday';
    else if (diffDays >= -6 && diffDays <= -2) label = `${Math.abs(diffDays)} days ago`;
    else if (diffDays >= 2 && diffDays <= 6)   label = d.toLocaleDateString(undefined, { weekday: 'long' });
    else                      label = d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

    const key = `${label}|${dayStart.toISOString()}`;
    if (!groups.has(key)) groups.set(key, { label, date: dayStart, matches: [] });
    groups.get(key)!.matches.push(m);
  }

  const result = Array.from(groups.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  if (noDate.length) {
    result.push({ label: 'Unscheduled', date: new Date(8640000000000000), matches: noDate });
  }
  return result;
}

interface Props {
  eventId: number;
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
  onMatchSelect: (id: number) => void;
}

export default function MatchesTab({
  eventId, teamLogos, teamShortNames, onMatchSelect,
}: Props) {
  const [state, dispatch] = useReducer(reducer, { loading: true, error: null, list: [] });
  const [scope, setScope] = useState<Scope>('all');
  const [stage, setStage] = useState<string>('All');
  const [team, setTeam] = useState<string>('All');

  useEffect(() => {
    dispatch({ type: 'fetch' });
    getMatches({ event: eventId, page_size: 500 })
      .then((res) => dispatch({ type: 'success', list: res.data.results }))
      .catch(() => dispatch({ type: 'error', message: 'Failed to load matches' }));
  }, [eventId]);

  const stageOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of state.list) if (m.tab) set.add(m.tab);
    return ['All', ...Array.from(set)];
  }, [state.list]);

  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of state.list) {
      set.add(m.team1);
      set.add(m.team2);
    }
    return ['All', ...Array.from(set).sort()];
  }, [state.list]);

  const filtered = useMemo(() => {
    return state.list.filter((m) => {
      if (stage !== 'All' && m.tab !== stage) return false;
      if (team !== 'All' && m.team1 !== team && m.team2 !== team) return false;
      if (scope === 'upcoming' && m.winner !== null) return false;
      if (scope === 'recent' && m.winner === null) return false;
      return true;
    });
  }, [state.list, scope, stage, team]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  if (state.loading) return <div className="py-10 flex items-center justify-center"><div className="spinner" /></div>;
  if (state.error)   return <p className="text-sm px-6 py-6" style={{ color: 'var(--red)' }}>{state.error}</p>;

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      {/* Filter bar */}
      <div
        className="card card-soft-shadow flex flex-wrap items-center"
        style={{ padding: '10px 14px', gap: 12 }}
      >
        <div className="chip-group">
          {([
            { k: 'all',      label: 'All' },
            { k: 'upcoming', label: 'Upcoming' },
            { k: 'recent',   label: 'Recent' },
          ] as const).map((s) => (
            <button
              key={s.k}
              type="button"
              onClick={() => setScope(s.k)}
              className={`chip${scope === s.k ? ' active' : ''}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <select
          className="field-select"
          value={stage}
          onChange={(e) => setStage(e.target.value)}
        >
          {stageOptions.map((s) => (
            <option key={s} value={s}>{s === 'All' ? 'All stages' : s}</option>
          ))}
        </select>

        <select
          className="field-select"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
        >
          {teamOptions.map((t) => (
            <option key={t} value={t}>
              {t === 'All' ? 'All teams' : (teamShortNames[t] || t)}
            </option>
          ))}
        </select>

        <div
          className="ml-auto tabular-nums text-(--text-dim)"
          style={{ fontSize: 12 }}
        >
          {filtered.length} {filtered.length === 1 ? 'match' : 'matches'}
        </div>
      </div>

      {/* Date groups */}
      {groups.length === 0 ? (
        <div
          className="card text-center text-(--text-dim)"
          style={{ padding: 60, fontSize: 13 }}
        >
          No matches for this filter.
        </div>
      ) : (
        groups.map((g) => (
          <DateGroupSection
            key={`${g.label}-${g.date.toISOString()}`}
            group={g}
            teamLogos={teamLogos}
            teamShortNames={teamShortNames}
            onMatchSelect={onMatchSelect}
          />
        ))
      )}
    </div>
  );
}

function DateGroupSection({
  group, teamLogos, teamShortNames, onMatchSelect,
}: {
  group: DateGroup;
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
  onMatchSelect: (id: number) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isToday = group.date.getTime() === today.getTime();
  const showDate = group.date.getTime() < 8640000000000000;

  return (
    <section>
      <div className="flex items-baseline" style={{ gap: 12, marginBottom: 12 }}>
        <h2
          className="font-display"
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: isToday ? 'var(--accent-2)' : 'var(--text-h)',
            letterSpacing: '-0.02em',
          }}
        >
          {group.label}
        </h2>
        {showDate && (
          <span
            className="tabular-nums text-(--text-dim)"
            style={{ fontSize: 11 }}
          >
            {group.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        )}
        <span
          className="ml-auto text-(--text-dim)"
          style={{ fontSize: 11 }}
        >
          {group.matches.length} {group.matches.length === 1 ? 'match' : 'matches'}
        </span>
      </div>

      <div className="card card-soft-shadow overflow-hidden">
        {group.matches.map((m, i) => (
          <MatchListItem
            key={m.id}
            m={m}
            isLast={i === group.matches.length - 1}
            teamLogos={teamLogos}
            teamShortNames={teamShortNames}
            onClick={() => onMatchSelect(m.id)}
          />
        ))}
      </div>
    </section>
  );
}

function MatchListItem({
  m, isLast, teamLogos, teamShortNames, onClick,
}: {
  m: Match;
  isLast: boolean;
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
  onClick: () => void;
}) {
  const played = m.winner !== null;
  const t1Win = m.winner === 1;
  const t2Win = m.winner === 2;
  const dt = m.datetime_utc ? new Date(m.datetime_utc) : null;
  const time = dt ? dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—';

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full grid items-center transition-colors hover:bg-(--surface-sub) text-left"
      style={{
        padding: '14px 20px',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        gridTemplateColumns: '74px minmax(0, 1fr) auto 110px',
        gap: 16,
      }}
    >
      {/* Time */}
      <div
        className="tabular-nums font-medium"
        style={{ fontSize: 12.5, color: 'var(--text-dim)' }}
      >
        {time}
      </div>

      {/* Matchup */}
      <div className="flex items-center min-w-0" style={{ gap: 14 }}>
        <div
          className="flex items-center flex-1 min-w-0"
          style={{ gap: 10, opacity: played && !t1Win ? 0.62 : 1 }}
        >
          <TeamMark short={teamShortNames[m.team1] || m.team1} logo={teamLogos[m.team1]} size={28} />
          <div className="min-w-0 flex items-center" style={{ gap: 6 }}>
            <span
              className={`text-sm truncate ${t1Win ? 'font-bold text-(--text-h)' : 'font-medium text-(--text-h)'}`}
            >
              {teamShortNames[m.team1] || m.team1}
            </span>
            {t1Win && <Badge tone="green">W</Badge>}
          </div>
        </div>

        <div
          className="tabular-nums font-bold flex items-center justify-center"
          style={{
            fontSize: 17,
            letterSpacing: '-0.02em',
            minWidth: 64,
            padding: '4px 10px',
            borderRadius: 7,
            background: played ? 'var(--surface-sub)' : 'transparent',
            color: played ? 'var(--text-h)' : 'var(--text-faint)',
          }}
        >
          {played ? (
            <>
              {m.team1_score} <span className="text-(--text-faint) font-normal mx-1">–</span> {m.team2_score}
            </>
          ) : (
            <span className="text-xs font-semibold tracking-wider">vs</span>
          )}
        </div>

        <div
          className="flex items-center flex-1 min-w-0 flex-row-reverse"
          style={{ gap: 10, opacity: played && !t2Win ? 0.62 : 1 }}
        >
          <TeamMark short={teamShortNames[m.team2] || m.team2} logo={teamLogos[m.team2]} size={28} />
          <div className="min-w-0 text-right flex items-center justify-end" style={{ gap: 6 }}>
            {t2Win && <Badge tone="green">W</Badge>}
            <span
              className={`text-sm truncate ${t2Win ? 'font-bold text-(--text-h)' : 'font-medium text-(--text-h)'}`}
            >
              {teamShortNames[m.team2] || m.team2}
            </span>
          </div>
        </div>
      </div>

      {/* Stage / BO */}
      <div className="flex items-center gap-2 justify-end text-xs">
        {m.tab && (
          <Badge tone={m.tab.toLowerCase().includes('final') ? 'accent' : m.tab.toLowerCase().includes('playoff') ? 'amber' : 'neutral'}>
            {m.tab.length > 12 ? m.tab.slice(0, 10) + '…' : m.tab}
          </Badge>
        )}
        <span className="font-semibold tracking-wide text-(--text-dim)">BO{m.best_of}</span>
      </div>

      {/* Meta line */}
      <div
        className="text-right tabular-nums"
        style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500 }}
      >
        {played
          ? `${(teamShortNames[m.winner === 1 ? m.team1 : m.team2] || (m.winner === 1 ? m.team1 : m.team2))} wins`
          : '—'}
      </div>
    </button>
  );
}
