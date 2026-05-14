import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getEvents } from '../api/core';
import { usePaginatedList } from '../hooks/useApi';
import type { Event } from '../types/models';
import Spinner from '../components/Spinner';
import Pagination from '../components/Pagination';

export default function EventsPage() {
  const [page, setPage] = useState(1);
  const fetcher = useCallback((p: number) => getEvents({ page: p }), []);
  const { data: events, count, loading, error } = usePaginatedList<Event>(fetcher, page);

  const totalPages = Math.ceil(count / 50);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-baseline gap-3 mb-8">
        <h1 className="text-2xl font-bold text-(--text-h)">Events</h1>
        {count > 0 && <span className="text-sm text-(--text-dim)">{count} total</span>}
      </div>

      {loading && <Spinner />}
      {error && <p className="text-sm text-red-400 py-8 text-center">{error}</p>}

      {!loading && !error && (
        <>
          <div className="space-y-2">
            {events.map((e) => (
              <Link
                key={e.id}
                to={`/events/${e.id}`}
                className="card card-link flex items-center gap-4 px-5 py-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-(--text-h)">{e.name}</span>
                    {e.is_active && <span className="badge badge-green">Active</span>}
                  </div>
                  <p className="text-xs text-(--text-dim)">
                    {e.league.short_name ?? e.league.name}
                    {e.year ? ` · ${e.year}` : ''}
                    {e.start_date ? ` · ${e.start_date}` : ''}
                  </p>
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
