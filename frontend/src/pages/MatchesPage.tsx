import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getMatches } from '../api/core';
import { usePaginatedList } from '../hooks/useApi';
import type { Match } from '../types/models';

export default function MatchesPage() {
  const [page, setPage] = useState(1);
  const fetcher = useCallback((p: number) => getMatches({ page: p }), []);
  const { data: matches, count, loading, error } = usePaginatedList<Match>(fetcher, page);

  if (loading) return <p className="p-8 text-center">Loading matches…</p>;
  if (error) return <p className="p-8 text-red-500">{error}</p>;

  const totalPages = Math.ceil(count / 50);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Matches ({count})</h1>

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
