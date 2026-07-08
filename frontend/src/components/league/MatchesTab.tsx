import { useMemo, useState } from 'react';
import type { Match } from '../../types/models';
import { TeamMark, pickerBtnStyle } from './shared';
import { Select } from '../ui/Select';

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
    else if (diffDays > 0)    label = `In ${diffDays} days`;
    else                      label = `${Math.abs(diffDays)} days ago`;

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
    <div className="flex flex-col" style={{ gap: 22 }}>
      {/* Filter bar — matches the Players tab: flat surface, segmented scope
          picker with a purple active state, pipe divider, selects on the right. */}
      <div
        className="card card-soft-shadow flex items-center flex-wrap"
        style={{ padding: '8px 14px', background: 'var(--surface)', border: 'none', gap: 8 }}
      >
        {/* Scope: Upcoming / Recent */}
        <div className="flex items-center" style={{ gap: 4 }}>
          {([
            { k: 'upcoming', label: 'Upcoming' },
            { k: 'recent',   label: 'Recent' },
          ] as const).map((s) => (
            <button
              key={s.k}
              type="button"
              onClick={() => setScope(s.k)}
              className="transition-all"
              style={pickerBtnStyle(scope === s.k)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Stage / team filters */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          <Select
            ariaLabel="Stage"
            style={{ height: 30 }}
            value={stage}
            options={stageOptions.map((s) => ({ value: s, label: s === 'All' ? 'All stages' : s }))}
            onChange={setStage}
            align="right"
          />

          <Select
            ariaLabel="Team"
            style={{ height: 30 }}
            value={team}
            options={teamOptions.map((t) => ({
              value: t,
              label: t === 'All' ? 'All teams' : teamShortNames[t] || t,
            }))}
            onChange={setTeam}
            align="right"
          />
        </div>
      </div>

      {/* Date groups */}
      {groups.length === 0 ? (
        <div
          className="text-center text-(--text-dim)"
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
      <div
        className="flex items-center"
        style={{ gap: 10, paddingLeft: 4, paddingBottom: 9, borderBottom: '1px solid var(--border)' }}
      >
        <h2
          className="font-display"
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: isToday ? 'var(--accent-2)' : 'var(--text-dim)',
          }}
        >
          {group.label}
        </h2>
        {showDate && (
          <span
            className="tabular-nums text-(--text-faint)"
            style={{ fontSize: 11, fontWeight: 500 }}
          >
            {group.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>

      <div>
        {group.matches.map((m) => (
          <MatchListItem
            key={m.id}
            m={m}
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
  m, teamLogos, teamShortNames, onClick,
}: {
  m: Match;
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
  onClick: () => void;
}) {
  const played = m.winner !== null;
  const t1Win = m.winner === 1;
  const t2Win = m.winner === 2;
  const dt = m.datetime_utc ? new Date(m.datetime_utc) : null;
  const time = dt ? dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—';
  const name1 = teamShortNames[m.team1] || m.team1;
  const name2 = teamShortNames[m.team2] || m.team2;

  return (
    <button
      type="button"
      onClick={onClick}
      className="match-feed-row w-full grid items-center text-left"
      style={{
        padding: '13px 20px',
        gridTemplateColumns: '74px minmax(0, 1fr) 128px',
        gap: 16,
      }}
    >
      {/* Time */}
      <div
        className="match-feed-time tabular-nums font-medium"
        style={{ fontSize: 12.5, color: 'var(--text-dim)' }}
      >
        {time}
      </div>

      {/* Matchup — clustered around a centered score so the eye reads the
          pairing as one unit instead of scanning edge to edge. */}
      <div
        className="grid items-center"
        style={{
          gridTemplateColumns: '1fr auto 1fr',
          gap: 16,
          maxWidth: 480,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {/* Team 1 — name then logo, pushed toward the score */}
        <div
          className="flex items-center justify-end min-w-0"
          style={{ gap: 10, opacity: played && !t1Win ? 0.5 : 1 }}
        >
          <span
            className={`text-sm truncate text-right ${t1Win ? 'font-bold' : 'font-medium'} text-(--text-h)`}
          >
            {name1}
          </span>
          <TeamMark short={name1} logo={teamLogos[m.team1]} size={30} />
        </div>

        {/* Score / vs */}
        {played ? (
          <div className="flex items-center tabular-nums shrink-0" style={{ gap: 3 }}>
            <span
              className="font-display"
              style={{
                fontSize: 21,
                fontWeight: t1Win ? 700 : 400,
                color: t1Win ? 'var(--text-h)' : 'var(--text-faint)',
                letterSpacing: '-0.03em',
                minWidth: 15,
                textAlign: 'right',
              }}
            >
              {m.team1_score}
            </span>
            <span style={{ color: 'var(--text-faint)', fontSize: 13, fontWeight: 300 }}>–</span>
            <span
              className="font-display"
              style={{
                fontSize: 21,
                fontWeight: t2Win ? 700 : 400,
                color: t2Win ? 'var(--text-h)' : 'var(--text-faint)',
                letterSpacing: '-0.03em',
                minWidth: 15,
                textAlign: 'left',
              }}
            >
              {m.team2_score}
            </span>
          </div>
        ) : (
          <span
            className="font-semibold tracking-wider shrink-0"
            style={{ fontSize: 10.5, color: 'var(--text-faint)', textAlign: 'center' }}
          >
            VS
          </span>
        )}

        {/* Team 2 — logo then name, pushed toward the score */}
        <div
          className="flex items-center justify-start min-w-0"
          style={{ gap: 10, opacity: played && !t2Win ? 0.5 : 1 }}
        >
          <TeamMark short={name2} logo={teamLogos[m.team2]} size={30} />
          <span
            className={`text-sm truncate ${t2Win ? 'font-bold' : 'font-medium'} text-(--text-h)`}
          >
            {name2}
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
        <span className="match-feed-bo font-semibold tracking-wide text-(--text-dim)" style={{ fontSize: 11 }}>BO{m.best_of}</span>
      </div>
    </button>
  );
}
