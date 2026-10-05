import { useMemo } from 'react';
import { useNavigate, useLoaderData, useSearchParams, type LoaderFunctionArgs } from 'react-router-dom';
import { getMatches, getOrganizations } from '../api/core';
import type { Match } from '../types/models';
import Pagination from '../components/Pagination';
import EsportsLayout from '../components/EsportsLayout';
import PageHeader from '../components/PageHeader';
import { TeamMark } from '../components/league/shared';
import { useDrawer } from '../contexts/DrawerContext';

interface Props {
  status?: 'finished' | 'upcoming';
}

export interface MatchesLoaderData {
  matches: Match[];
  count: number;
  page: number;
}

// Route loader factory for the match list; reads `?page=` from the URL.
export function matchesLoader(status?: 'finished' | 'upcoming') {
  return async ({ request }: LoaderFunctionArgs): Promise<MatchesLoaderData> => {
    const page = Number(new URL(request.url).searchParams.get('page')) || 1;
    const [res, orgs] = await Promise.all([
      getMatches({ page, ...(status === 'finished' ? { has_result: 'true' } : status === 'upcoming' ? { has_result: 'false' } : {}) }),
      getOrganizations(1, 500).then(r => r.data.results).catch(() => []),
    ]);
    const byName = new Map(orgs.map(org => [org.name.toLowerCase(), org]));
    const matches = res.data.results.map(m => {
      const left = byName.get(m.team1.toLowerCase());
      const right = byName.get(m.team2.toLowerCase());
      return { ...m, team1_logo: m.team1_logo || left?.logo, team2_logo: m.team2_logo || right?.logo,
        team1_short: m.team1_short || left?.short_name, team2_short: m.team2_short || right?.short_name };
    });
    return { matches, count: res.data.count, page };
  };
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
      className="match-feed-row w-full grid items-center transition-colors hover:bg-(--surface-sub) text-left"
      style={{
        padding: '14px 20px',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        gridTemplateColumns: '74px minmax(0, 1fr) auto',
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

      {/* Matchup */}
      <div className="dg-feed-pair grid items-center gap-3 min-w-0">
        <div
          className="flex items-center gap-3 min-w-0 justify-end"
          style={{ opacity: played && !t1Win ? 0.8 : 1 }}
        >
          <span
            className={`text-sm truncate ${t1Win ? 'font-bold text-(--text-h)' : 'font-medium text-(--text-h)'}`}
            title={m.team1}
          >
            <span className="dg-team-full">{m.team1}</span><span className="dg-team-short">{m.team1_short || m.team1}</span>
          </span>
          <TeamMark short={m.team1_short || m.team1} logo={m.team1_logo} size={32} />
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
          className="flex items-center gap-3 min-w-0"
          style={{ opacity: played && !t2Win ? 0.8 : 1 }}
        >
          <TeamMark short={m.team2_short || m.team2} logo={m.team2_logo} size={32} />
          <span
            className={`text-sm truncate ${t2Win ? 'font-bold text-(--text-h)' : 'font-medium text-(--text-h)'}`}
            title={m.team2}
          >
            <span className="dg-team-full">{m.team2}</span><span className="dg-team-short">{m.team2_short || m.team2}</span>
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
            fontSize: 17,
            fontWeight: 600,
            color: isToday ? 'var(--accent-2)' : 'var(--text-h)',
            letterSpacing: '-0.02em',
          }}
        >
          {group.date.getTime() < 8640000000000000 ? (isToday ? 'Today' : group.date.toLocaleDateString('en-GB', {weekday:'short',day:'numeric',month:'long'})) : 'Unscheduled'}
        </h2>
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
  const [, setSearchParams] = useSearchParams();
  const { matches, count, page } = useLoaderData() as MatchesLoaderData;
  const scope: Scope = scopeFromStatus(status);
  const totalPages = Math.ceil(count / 50);

  const groups = useMemo(() => {
    const grouped = groupByDate(matches);
    if (scope !== 'recent') return grouped;
    grouped.sort((a,b) => a.label === 'Unscheduled' || b.label === 'Unscheduled' ? Number(a.label === 'Unscheduled') - Number(b.label === 'Unscheduled') : b.date.getTime() - a.date.getTime());
    for (const group of grouped) group.matches.sort((a,b) => (b.datetime_utc || '').localeCompare(a.datetime_utc || ''));
    return grouped;
  }, [matches, scope]);

  function setScope(s: Scope) {
    const next = SCOPE_TO_STATUS[s];
    if (next === 'finished') navigate('/matches/finished');
    else if (next === 'upcoming') navigate('/matches/upcoming');
    else navigate('/matches');
  }

  function setPage(p: number) {
    setSearchParams(p > 1 ? { page: String(p) } : {});
  }

  return (
    <EsportsLayout>
      {/* Hero header */}
      <PageHeader eyebrow="League of Legends · Match centre" title="Matches" description="Follow upcoming matchups and recent results. Open a match to explore every game.">
        <span className="dg-directory-count">{count} matches</span>
      </PageHeader>

      {/* Filter bar */}
      <div
        className="dg-match-feed-filters mb-6 flex flex-wrap items-center gap-3"
        style={{ padding: 0 }}
      >
        <div className="chip-group">
          {([
            { k: 'all', label: 'All' },
            { k: 'upcoming', label: 'Upcoming' },
            { k: 'recent', label: 'Results' },
          ] as const).map((s) => (
            <button
              key={s.k}
              type="button"
              onClick={() => setScope(s.k)}
              className={`chip${scope === s.k ? ' active' : ''}`}
              aria-pressed={scope === s.k}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

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
    </EsportsLayout>
  );
}
