import { useParams, Link } from 'react-router-dom';
import { useState, useCallback } from 'react';
import { useDetail, usePaginatedList } from '../hooks/useApi';
import { getEvent, getMatches } from '../api/core';
import type { Event, Match, PaginatedResponse } from '../types/models';
import type { AxiosResponse } from 'axios';
import Spinner from '../components/Spinner';
import Pagination from '../components/Pagination';

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = Number(id);

  const { data: event, loading: eventLoading, error: eventError } = useDetail<Event>(getEvent, eventId);

  const [page, setPage] = useState(1);
  const matchFetcher = useCallback(
    (p: number) => getMatches({ event: eventId, page: p }) as Promise<AxiosResponse<PaginatedResponse<Match>>>,
    [eventId],
  );
  const { data: matches, count, loading: matchesLoading, error: matchesError } = usePaginatedList<Match>(matchFetcher, page);

  const totalPages = Math.ceil(count / 50);

  if (eventLoading) return <Spinner />;
  if (eventError || !event) return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <p className="text-sm text-red-400">{eventError ?? 'Not found'}</p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="card p-6 mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-(--text-h)">{event.name}</h1>
              {event.is_active && <span className="badge badge-green">Active</span>}
            </div>
            <p className="text-sm text-(--text)">
              {event.league.short_name ?? event.league.name}
              {event.year ? ` · ${event.year}` : ''}
              {event.start_date && event.end_date
                ? ` · ${event.start_date} – ${event.end_date}`
                : event.start_date
                ? ` · ${event.start_date}`
                : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-baseline gap-3 mb-4">
        <h2 className="text-base font-semibold text-(--text-h)">Matches</h2>
        {count > 0 && <span className="text-sm text-(--text-dim)">{count} total</span>}
      </div>

      {matchesLoading && <Spinner />}
      {matchesError && <p className="text-sm text-red-400 py-4">{matchesError}</p>}

      {!matchesLoading && !matchesError && (
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
                    <span className="text-(--text-dim) font-normal">vs</span>{' '}
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
