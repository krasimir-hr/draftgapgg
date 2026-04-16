import { useState, useCallback } from 'react';
import { getEvents } from '../api/core';
import { usePaginatedList } from '../hooks/useApi';
import type { Event } from '../types/models';
import { Link } from 'react-router-dom';

export default function EventsPage() {
  const [page, setPage] = useState(1);
  const fetcher = useCallback((p: number) => getEvents({ page: p }), []);
  const { data: events, count, loading, error } = usePaginatedList<Event>(fetcher, page);

  if (loading) return <p className="p-8 text-center">Loading events…</p>;
  if (error) return <p className="p-8 text-red-500">{error}</p>;

  const totalPages = Math.ceil(count / 50);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Events ({count})</h1>

      <div className="space-y-3">
        {events.map((e) => (
          <Link
            key={e.id}
            to={`/events/${e.id}`}
            className="block border border-[var(--border)] rounded-lg p-4 hover:shadow-md transition"
          >
            <div className="flex justify-between items-center">
              <div>
                <h2 className="font-semibold text-lg text-[var(--text-h)]">{e.name}</h2>
                <p className="text-sm text-[var(--text)]">
                  {e.league.short_name ?? e.league.name}
                  {e.year ? ` · ${e.year}` : ''}
                </p>
              </div>
              {e.is_active && (
                <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">Active</span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 rounded border disabled:opacity-40">Prev</button>
          <span className="px-3 py-1">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1 rounded border disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
