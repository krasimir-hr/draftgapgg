import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getLeagues } from '../api/core';
import { usePaginatedList } from '../hooks/useApi';
import type { League } from '../types/models';
import Spinner from '../components/Spinner';
import Pagination from '../components/Pagination';
import { slugify } from '../utils/slugs';

function LeagueIcon({ league }: { league: League }) {
  if (league.logo) {
    return (
      <img
        src={league.logo}
        alt={league.short_name ?? league.name}
        className="logo-themed w-12 h-12 rounded-xl object-contain shrink-0"
      />
    );
  }
  const label = league.short_name ?? league.name;
  return (
    <div
      className="w-12 h-12 rounded-xl flex items-center justify-center text-base font-bold text-white shrink-0"
      style={{ background: 'var(--accent)' }}
    >
      {label.charAt(0).toUpperCase()}
    </div>
  );
}

export default function LeaguesPage() {
  const [page, setPage] = useState(1);
  const fetcher = useCallback((p: number) => getLeagues({ page: p }), []);
  const { data: leagues, count, loading, error } = usePaginatedList<League>(fetcher, page);

  const totalPages = Math.ceil(count / 50);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-baseline gap-3 mb-8">
        <h1 className="text-2xl font-bold text-(--text-h)">Leagues</h1>
        {count > 0 && <span className="text-sm text-(--text-dim)">{count} total</span>}
      </div>

      {loading && <Spinner />}
      {error && <p className="text-sm text-red-400 py-8 text-center">{error}</p>}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {leagues.map((league) => (
              <Link
                key={league.id}
                to={`/leagues/${slugify(league.short_name ?? league.name)}`}
                className="card card-link flex items-center gap-4 px-5 py-4"
              >
                <LeagueIcon league={league} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-(--text-h)">{league.name}</p>
                  {league.short_name && league.short_name !== league.name && (
                    <p className="text-xs text-(--text-dim)">{league.short_name}</p>
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
