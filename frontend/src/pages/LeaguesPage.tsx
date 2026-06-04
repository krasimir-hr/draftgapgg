import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getLeagues } from '../api/core';
import { usePaginatedList } from '../hooks/useApi';
import type { League } from '../types/models';
import Spinner from '../components/Spinner';
import Pagination from '../components/Pagination';
import { slugify } from '../utils/slugs';

const LEAGUE_COLOR: Record<string, string> = {
  LCK:   '#a78bfa',
  LPL:   '#dc2626',
  LEC:   '#3b82f6',
  LCS:   '#06b6d4',
  CBLoL: '#10b981',
  LCP:   '#f59e0b',
};

function LeagueIcon({ league }: { league: League }) {
  const label = league.short_name ?? league.name;
  const color = LEAGUE_COLOR[label] ?? 'var(--accent)';
  if (league.logo) {
    return (
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 48, height: 48, borderRadius: 10, background: color }}
      >
        <img
          src={league.logo}
          alt={label}
          className="logo-themed"
          style={{ width: 28, height: 28, objectFit: 'contain' }}
        />
      </div>
    );
  }
  return (
    <div
      className="flex items-center justify-center shrink-0 text-white font-bold"
      style={{
        width: 48, height: 48, borderRadius: 10, background: color,
        fontFamily: 'var(--font-sans)', fontSize: 14, letterSpacing: '-0.02em',
      }}
    >
      {label}
    </div>
  );
}

export default function LeaguesPage() {
  const [page, setPage] = useState(1);
  const fetcher = useCallback((p: number) => getLeagues({ page: p }), []);
  const { data: leagues, count, loading, error } = usePaginatedList<League>(fetcher, page);

  const totalPages = Math.ceil(count / 50);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <header className="mb-8">
        <div className="eyebrow mb-2">Pro League · Directory</div>
        <h1 className="h-display" style={{ fontSize: 44 }}>Leagues</h1>
        <p className="mt-3 text-(--text)" style={{ fontSize: 15.5, maxWidth: 560, lineHeight: 1.55 }}>
          {count > 0 ? <><b className="text-(--text-h) font-semibold">{count}</b> leagues tracked.</> : 'Browse the leagues we cover.'} Pick one to see standings, schedules, and player leaders.
        </p>
      </header>

      {loading && <Spinner />}
      {error && <p className="text-sm text-(--red) py-8 text-center">{error}</p>}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {leagues.map((league) => (
              <Link
                key={league.id}
                to={`/leagues/${slugify(league.short_name ?? league.name)}`}
                className="card card-link card-soft-shadow flex items-center gap-4 px-5 py-4"
              >
                <LeagueIcon league={league} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-(--text-h)">{league.name}</p>
                  {league.short_name && league.short_name !== league.name && (
                    <p className="text-xs text-(--text-dim) mt-0.5 tracking-wide uppercase">{league.short_name}</p>
                  )}
                </div>
                <span className="text-(--text-dim) text-sm shrink-0">→</span>
              </Link>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
