import { useState, useCallback, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { getMatches } from '../api/core';
import { usePaginatedList } from '../hooks/useApi';
import type { Match } from '../types/models';
import Spinner from '../components/Spinner';
import Pagination from '../components/Pagination';

interface Props {
  status?: 'finished' | 'upcoming';
}

export default function MatchesPage({ status }: Props) {
  const [page, setPage] = useState(1);

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

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-baseline gap-3 mb-6">
        <h1 className="text-2xl font-bold text-(--text-h)">Matches</h1>
        {count > 0 && <span className="text-sm text-(--text-dim)">{count} total</span>}
      </div>

      <div className="flex gap-1 mb-6">
        {([
          { label: 'All',      to: '/matches'          },
          { label: 'Finished', to: '/matches/finished' },
          { label: 'Upcoming', to: '/matches/upcoming' },
        ] as const).map(({ label, to }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-(--accent-muted) text-(--accent-2)'
                  : 'text-(--text-dim) hover:text-(--text-h) hover:bg-(--surface-sub)'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </div>

      {loading && <Spinner />}
      {error && <p className="text-sm text-red-400 py-8 text-center">{error}</p>}

      {!loading && !error && (
        <>
          <div className="space-y-2">
            {matches.map((m) => (
              <Link
                key={m.id}
                to={`/matches/${m.id}`}
                className="card card-link flex items-center gap-4 px-5 py-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-(--text-h) mb-0.5">
                    {m.team1}{' '}
                    <span className="text-(--text-dim) font-normal text-xs">vs</span>{' '}
                    {m.team2}
                  </p>
                  <p className="text-xs text-(--text-dim)">
                    Bo{m.best_of}
                    {m.tab ? ` · ${m.tab}` : ''}
                    {m.winner ? ` · ${m.winner === 1 ? m.team1 : m.team2} wins` : ''}
                  </p>
                </div>
                <span className="text-xs text-(--text-dim) shrink-0 tabular-nums">
                  {m.datetime_utc ? new Date(m.datetime_utc).toLocaleDateString() : 'TBD'}
                </span>
              </Link>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
