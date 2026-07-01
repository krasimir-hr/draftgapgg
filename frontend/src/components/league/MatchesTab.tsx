import { useMemo, useState } from 'react';
import type { Match } from '../../types/models';
import { TeamMark } from './shared';

type Scope = 'upcoming' | 'recent';

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
  matches: Match[];
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
  onMatchSelect: (id: number) => void;
}

export default function MatchesTab({
  matches, teamLogos, teamShortNames, onMatchSelect,
}: Props) {
  const [scope, setScope] = useState<Scope>(() =>
    matches.some((m) => m.winner === null) ? 'upcoming' : 'recent'
  );
  const [stage, setStage] = useState<string>('All');
  const [team, setTeam] = useState<string>('All');

  const stageOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) if (m.tab) set.add(m.tab);
    return ['All', ...Array.from(set)];
  }, [matches]);

  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) {
      set.add(m.team1);
      set.add(m.team2);
    }
    return ['All', ...Array.from(set).sort()];
  }, [matches]);

  const filtered = useMemo(() => {
    return matches.filter((m) => {
      if (stage !== 'All' && m.tab !== stage) return false;
      if (team !== 'All' && m.team1 !== team && m.team2 !== team) return false;
      if (scope === 'upcoming' && m.winner !== null) return false;
      if (scope === 'recent' && m.winner === null) return false;
      return true;
    });
  }, [matches, scope, stage, team]);

  const groups = useMemo(() => {
    const gs = groupByDate(filtered);
    if (scope === 'recent') {
      gs.reverse();
      for (const g of gs) {
        g.matches.sort((a, b) => (b.datetime_utc ?? '').localeCompare(a.datetime_utc ?? ''));
      }
    }
    return gs;
  }, [filtered, scope]);

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      {/* Filter bar */}
      <div
        className="card card-soft-shadow flex flex-wrap items-center"
        style={{ padding: '10px 14px', gap: 12 }}
      >
        <div className="chip-group">
          {([
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
        gridTemplateColumns: '74px minmax(0, 1fr) auto',
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
          style={{ gap: 10, opacity: played && !t1Win ? 0.55 : 1 }}
        >
          <TeamMark short={teamShortNames[m.team1] || m.team1} logo={teamLogos[m.team1]} size={28} />
          <span
            className={`text-sm truncate ${t1Win ? 'font-bold text-(--text-h)' : 'font-medium text-(--text-h)'}`}
          >
            {teamShortNames[m.team1] || m.team1}
          </span>
        </div>

        {played ? (
          <div className="flex items-center tabular-nums" style={{ gap: 2 }}>
            <span
              className="font-display"
              style={{
                fontSize: 20,
                fontWeight: t1Win ? 700 : 400,
                color: t1Win ? 'var(--text-h)' : 'var(--text-dim)',
                letterSpacing: '-0.03em',
                minWidth: 18,
                textAlign: 'right',
              }}
            >
              {m.team1_score}
            </span>
            <span style={{ color: 'var(--text-faint)', fontSize: 14, fontWeight: 300, margin: '0 5px' }}>–</span>
            <span
              className="font-display"
              style={{
                fontSize: 20,
                fontWeight: t2Win ? 700 : 400,
                color: t2Win ? 'var(--text-h)' : 'var(--text-dim)',
                letterSpacing: '-0.03em',
                minWidth: 18,
                textAlign: 'left',
              }}
            >
              {m.team2_score}
            </span>
          </div>
        ) : (
          <span
            className="font-semibold tracking-wider"
            style={{ fontSize: 11, color: 'var(--text-faint)', minWidth: 42, textAlign: 'center' }}
          >
            vs
          </span>
        )}

        <div
          className="flex items-center flex-1 min-w-0 flex-row-reverse"
          style={{ gap: 10, opacity: played && !t2Win ? 0.55 : 1 }}
        >
          <TeamMark short={teamShortNames[m.team2] || m.team2} logo={teamLogos[m.team2]} size={28} />
          <span
            className={`text-sm truncate text-right ${t2Win ? 'font-bold text-(--text-h)' : 'font-medium text-(--text-h)'}`}
          >
            {teamShortNames[m.team2] || m.team2}
          </span>
        </div>
      </div>

      {/* League + BO */}
      <div className="flex items-center gap-3 justify-end">
        <span className="inline-flex items-center" style={{ gap: 5 }}>
          {m.league_logo && (
            <img src={m.league_logo} alt="" className="logo-themed" style={{ width: 13, height: 13, objectFit: 'contain', opacity: 0.6 }} />
          )}
          {m.league_short_name && (
            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {m.league_short_name}
            </span>
          )}
        </span>
        <span className="font-semibold tracking-wide text-(--text-dim)" style={{ fontSize: 11 }}>BO{m.best_of}</span>
      </div>
    </button>
  );
}
