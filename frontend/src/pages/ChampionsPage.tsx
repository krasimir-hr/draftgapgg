import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getChampions } from '../api/lol';
import { usePaginatedList } from '../hooks/useApi';
import type { Champion } from '../types/models';
import Spinner from '../components/Spinner';
import Pagination from '../components/Pagination';

export default function ChampionsPage() {
  const [page, setPage] = useState(1);
  const fetcher = useCallback((p: number) => getChampions(p), []);
  const { data: champions, count, loading, error } = usePaginatedList<Champion>(fetcher, page);

  const totalPages = Math.ceil(count / 50);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-baseline gap-3 mb-8">
        <h1 className="text-2xl font-bold text-(--text-h)">Champions</h1>
        {count > 0 && <span className="text-sm text-(--text-dim)">{count} total</span>}
      </div>

      {loading && <Spinner />}
      {error && <p className="text-sm text-red-400 py-8 text-center">{error}</p>}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-8 gap-2">
            {champions.map((c) => (
              <Link
                key={c.id}
                to={`/champions/${c.id}`}
                className="card card-link flex flex-col items-center p-2.5 text-center"
              >
                <img src={c.icon_url} alt={c.name} className="w-12 h-12 rounded-md mb-1.5" loading="lazy" />
                <span className="text-xs font-medium text-(--text-h) leading-tight">{c.name}</span>
                <span className="text-[10px] text-(--text-dim) mt-0.5 leading-tight">{c.tags[0]}</span>
              </Link>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
