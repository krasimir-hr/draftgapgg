import { useParams, Link } from 'react-router-dom';
import { useState, useCallback } from 'react';
import { useDetail, usePaginatedList } from '../hooks/useApi';
import { getEvents, getMatches } from '../api/core';
import type { Event, Match } from '../types/models';
import type { AxiosResponse } from 'axios';
import type { PaginatedResponse } from '../types/models';

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = Number(id);

  // Fetch single event by wrapping getEvents with an event filter
  const eventFetcher = useCallback(
    (_id: number) =>
      getEvents({ page: 1 }).then((res) => {
        const event = res.data.results.find((e) => e.id === _id);
        if (!event) throw new Error('Event not found');
        return { data: event } as AxiosResponse<Event>;
      }),
    [],
  );

  const { data: event, loading: eventLoading, error: eventError } = useDetail<Event>(eventFetcher, eventId);

  const [page, setPage] = useState(1);
  const matchFetcher = useCallback(
    (p: number) => getMatches({ event: eventId, page: p }) as Promise<AxiosResponse<PaginatedResponse<Match>>>,
    [eventId],
  );
  const { data: matches, count, loading: matchesLoading, error: matchesError } = usePaginatedList<Match>(matchFetcher, page);

  if (eventLoading) return <p className="p-8 text-center">Loading event…</p>;
  if (eventError || !event) return <p className="p-8 text-red-500">{eventError ?? 'Not found'}</p>;

  const totalPages = Math.ceil(count / 50);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-1">{event.name}</h1>
      <p className="text-[var(--text)] mb-6">
        {event.league.short_name ?? event.league.name}
        {event.year ? ` · ${event.year}` : ''}
        {event.start_date ? ` · ${event.start_date}` : ''}
        {event.is_active ? ' · Active' : ''}
      </p>

      <h2 className="text-xl font-semibold mb-3">Matches</h2>

      {matchesLoading && <p className="text-center">Loading matches…</p>}
      {matchesError && <p className="text-red-500">{matchesError}</p>}

      <div className="space-y-3">
        {matches.map((m) => (
          <Link
            key={m.id}
            to={`/matches/${m.id}`}
            className="block border border-[var(--border)] rounded-lg p-4 hover:shadow-md transition"
          >
            <div className="flex justify-between items-center">
              <span className="font-semibold text-[var(--text-h)]">{m.team1} vs {m.team2}</span>
              <span className="text-xs text-[var(--text)]">
                {m.datetime_utc ? new Date(m.datetime_utc).toLocaleDateString() : 'TBD'}
              </span>
            </div>
            <p className="text-sm text-[var(--text)] mt-1">
              Bo{m.best_of} · {m.tab}{m.winner ? ` · Winner: Team ${m.winner}` : ''}
            </p>
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
