import { Link, useLoaderData, useSearchParams, type LoaderFunctionArgs } from 'react-router-dom';
import { getEvents } from '../api/core';
import type { Event } from '../types/models';
import Pagination from '../components/Pagination';
import EsportsLayout from '../components/EsportsLayout';

export interface EventsLoaderData {
  events: Event[];
  count: number;
  page: number;
}

export async function eventsLoader({ request }: LoaderFunctionArgs): Promise<EventsLoaderData> {
  const page = Number(new URL(request.url).searchParams.get('page')) || 1;
  const res = await getEvents({ page });
  return { events: res.data.results, count: res.data.count, page };
}

export default function EventsPage() {
  const { events, count, page } = useLoaderData() as EventsLoaderData;
  const [, setSearchParams] = useSearchParams();
  const totalPages = Math.ceil(count / 50);

  function setPage(p: number) {
    setSearchParams(p > 1 ? { page: String(p) } : {});
  }

  return (
    <EsportsLayout>
      <div className="flex items-baseline gap-3 mb-8">
        <h1 className="text-2xl font-bold text-(--text-h)">Events</h1>
        {count > 0 && <span className="text-sm text-(--text-dim)">{count} total</span>}
      </div>

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
    </EsportsLayout>
  );
}
