import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMatches } from '../api/core';
import { usePaginatedList } from '../hooks/useApi';
import type { Match } from '../types/models';
import Spinner from '../components/Spinner';
import Pagination from '../components/Pagination';
import { useDrawer } from '../contexts/DrawerContext';

interface Props {
  status?: 'finished' | 'upcoming';
}

type Scope = 'all' | 'upcoming' | 'recent';

const SCOPE_TO_STATUS: Record<Scope, Props['status']> = {
  all: undefined,
  upcoming: 'upcoming',
  recent: 'finished',
};

function scopeFromStatus(s?: 'finished' | 'upcoming'): Scope {
  if (s === 'finished') return 'recent';
  if (s === 'upcoming') return 'upcoming';
  return 'all';
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

  for (const m of matches) {
    if (!m.datetime_utc) continue;
    const d = new Date(m.datetime_utc);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((dayStart.getTime() - today.getTime()) / 86400000);

    let label: string;
    if (diffDays === 0) label = 'Today';
    else if (diffDays === 1) label = 'Tomorrow';
    else if (diffDays === -1) label = 'Yesterday';
    else if (diffDays >= -6 && diffDays <= -2) label = `${Math.abs(diffDays)} days ago`;
    else if (diffDays >= 2 && diffDays <= 6) label = d.toLocaleDateString(undefined, { weekday: 'long' });
    else label = d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

    const key = `${label}|${dayStart.toISOString()}`;
    if (!groups.has(key)) groups.set(key, { label, date: dayStart, matches: [] });
    groups.get(key)!.matches.push(m);
  }

  // No-datetime matches go in a "Unscheduled" bucket
  const noDate = matches.filter((m) => !m.datetime_utc);
  if (noDate.length) {
    groups.set('Unscheduled|z', { label: 'Unscheduled', date: new Date(8640000000000000), matches: noDate });
  }

  return Array.from(groups.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

function MatchRow({ m, isLast }: { m: Match; isLast: boolean }) {
  const { openMatch } = useDrawer();
  const played = m.winner !== null;
  const t1Win = m.winner === 1;
  const t2Win = m.winner === 2;
  const time = m.datetime_utc
    ? new Date(m.datetime_utc).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : '—';

  return (
    <button
      type="button"
      onClick={() => openMatch(m.id)}
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
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="flex items-center gap-2 flex-1 min-w-0"
          style={{ opacity: played && !t1Win ? 0.62 : 1 }}
        >
          <span
            className={`text-sm truncate ${t1Win ? 'font-bold text-(--text-h)' : 'font-medium text-(--text-h)'}`}
          >
            {m.team1}
          </span>
          {t1Win && <span className="badge badge-green">W</span>}
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
          className="flex items-center gap-2 flex-1 min-w-0 justify-end"
          style={{ opacity: played && !t2Win ? 0.62 : 1 }}
        >
          {t2Win && <span className="badge badge-green">W</span>}
          <span
            className={`text-sm truncate ${t2Win ? 'font-bold text-(--text-h)' : 'font-medium text-(--text-h)'}`}
          >
            {m.team2}
          </span>
        </div>
      </div>

      {/* Stage / BO */}
      <div className="flex items-center gap-2 justify-end text-xs">
        {m.tab && <span className="badge badge-neutral">{m.tab.slice(0, 8)}</span>}
        <span className="font-semibold tracking-wide text-(--text-dim)">BO{m.best_of}</span>
      </div>

      {/* Meta line */}
      <div
        className="text-right tabular-nums"
        style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500 }}
      >
        {played
          ? `${m.winner === 1 ? m.team1 : m.team2} wins`
          : 'Squad locked at start'}
      </div>
    </button>
  );
}

function DateGroupSection({ group }: { group: DateGroup }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isToday = group.date.getTime() === today.getTime();

  return (
    <section>
      <div className="flex items-baseline gap-3 mb-3">
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
        <span className="text-xs text-(--text-dim) tabular-nums">
          {group.date.getTime() < 8640000000000000
            ? group.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
            : ''}
        </span>
        <span className="text-xs text-(--text-dim) ml-auto">
          {group.matches.length} {group.matches.length === 1 ? 'match' : 'matches'}
        </span>
      </div>

      <div className="card card-soft-shadow overflow-hidden">
        {group.matches.map((m, i) => (
          <MatchRow key={m.id} m={m} isLast={i === group.matches.length - 1} />
        ))}
      </div>
    </section>
  );
}

export default function MatchesPage({ status }: Props) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const scope: Scope = scopeFromStatus(status);

  useEffect(() => { setPage(1); }, [status]);

  const fetcher = useCallback(
    (p: number) => getMatches({
      page: p,
      ...(status === 'finished' ? { has_result: 'true' } : status === 'upcoming' ? { has_result: 'false' } : {}),
    }),
    [status],
  );

  const { data: matches, count, loading, error } = usePaginatedList<Match>(fetcher, page);
  const totalPages = Math.ceil(count / 50);

  const groups = useMemo(() => groupByDate(matches), [matches]);

  function setScope(s: Scope) {
    const next = SCOPE_TO_STATUS[s];
    if (next === 'finished') navigate('/matches/finished');
    else if (next === 'upcoming') navigate('/matches/upcoming');
    else navigate('/matches');
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Hero header */}
      <header className="mb-6">
        <div className="eyebrow mb-2">Pro League · Schedule</div>
        <h1 className="h-display" style={{ fontSize: 44 }}>Matches</h1>
        <p className="mt-3 text-(--text)" style={{ fontSize: 15.5, maxWidth: 560, lineHeight: 1.55 }}>
          The full match feed. {count > 0 && <><b className="text-(--text-h) font-semibold">{count}</b> total. </>}
          Click any match for picks, bans, and game-by-game stats.
        </p>
      </header>

      {/* Filter bar */}
      <div
        className="card card-soft-shadow mb-6 flex flex-wrap items-center gap-3"
        style={{ padding: '10px 14px' }}
      >
        <div className="chip-group">
          {([
            { k: 'all', label: 'All' },
            { k: 'upcoming', label: 'Upcoming' },
            { k: 'recent', label: 'Recent' },
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
        <div className="ml-auto text-xs text-(--text-dim) tabular-nums">
          {count} {count === 1 ? 'match' : 'matches'}
        </div>
      </div>

      {loading && <Spinner />}
      {error && <p className="text-sm text-(--red) py-8 text-center">{error}</p>}

      {!loading && !error && (
        <>
          <div className="flex flex-col" style={{ gap: 24 }}>
            {groups.length > 0 ? (
              groups.map((g) => <DateGroupSection key={g.label + g.date.toISOString()} group={g} />)
            ) : (
              <div
                className="card text-center text-sm text-(--text-dim)"
                style={{ padding: 60 }}
              >
                No matches for this filter.
              </div>
            )}
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
