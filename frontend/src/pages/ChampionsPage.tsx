import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getChampions } from '../api/lol';
import { usePaginatedList } from '../hooks/useApi';
import type { Champion } from '../types/models';

export default function ChampionsPage() {
  const [page, setPage] = useState(1);
  const fetcher = useCallback((p: number) => getChampions(p), []);
  const { data: champions, count, loading, error } = usePaginatedList<Champion>(fetcher, page);

  if (loading) return <p className="p-8 text-center">Loading champions…</p>;
  if (error) return <p className="p-8 text-red-500">{error}</p>;

  const totalPages = Math.ceil(count / 50);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Champions ({count})</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
        {champions.map((c) => (
          <Link
            key={c.id}
            to={`/champions/${c.id}`}
            className="flex flex-col items-center rounded-lg border border-[var(--border)] p-2 hover:shadow-md transition"
          >
            <img src={c.icon_url} alt={c.name} className="w-16 h-16 rounded" loading="lazy" />
            <span className="mt-1 text-sm font-medium text-[var(--text-h)]">{c.name}</span>
            <span className="text-xs text-[var(--text)]">{c.tags.join(', ')}</span>
          </Link>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 rounded border disabled:opacity-40">
            Prev
          </button>
          <span className="px-3 py-1">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1 rounded border disabled:opacity-40">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
