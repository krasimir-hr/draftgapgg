import { useLoaderData, useSearchParams, type LoaderFunctionArgs } from 'react-router-dom';
import { getEvent, getMatches } from '../api/core';
import type { Event, Match } from '../types/models';
import Pagination from '../components/Pagination';
import EsportsLayout from '../components/EsportsLayout';
import { useDrawer } from '../contexts/DrawerContext';

export interface EventDetailLoaderData {
  event: Event;
  matches: Match[];
  count: number;
  page: number;
}

export async function eventDetailLoader({ params, request }: LoaderFunctionArgs): Promise<EventDetailLoaderData> {
  const eventId = Number(params.id);
  const page = Number(new URL(request.url).searchParams.get('page')) || 1;
  const [event, matchesRes] = await Promise.all([
    getEvent(eventId).then((r) => r.data), // throws → route errorElement
    getMatches({ event: eventId, page }),
  ]);
  return { event, matches: matchesRes.data.results, count: matchesRes.data.count, page };
}

export default function EventDetailPage() {
  const { event, matches, count, page } = useLoaderData() as EventDetailLoaderData;
  const [, setSearchParams] = useSearchParams();
  const { openMatch } = useDrawer();

  const totalPages = Math.ceil(count / 50);

  function setPage(p: number) {
    setSearchParams(p > 1 ? { page: String(p) } : {});
  }

  return (
    <EsportsLayout>
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
        <h2 className="section-label">Matches</h2>
        {count > 0 && <span className="text-sm text-(--text-dim)">{count} total</span>}
      </div>

      <div className="space-y-2">
        {matches.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => openMatch(m.id)}
            className="w-full card card-link flex items-center gap-4 px-5 py-4 text-left"
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
          </button>
        ))}
      </div>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </EsportsLayout>
  );
}
