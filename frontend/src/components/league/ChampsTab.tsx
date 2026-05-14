import { useCallback, useEffect, useReducer, useState } from 'react';
import { getEventChampions } from '../../api/core';
import type { EventChampionStats } from '../../types/models';
import { RoleFilterBar, SortIcon } from './shared';
import type { RoleFilter } from './shared';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';

interface State { loading: boolean; error: string | null; list: EventChampionStats[]; }
type Action = { type: 'fetch' } | { type: 'success'; list: EventChampionStats[] } | { type: 'error'; message: string };
function reducer(_s: State, a: Action): State {
  switch (a.type) {
    case 'fetch':   return { loading: true, error: null, list: [] };
    case 'success': return { loading: false, error: null, list: a.list };
    case 'error':   return { loading: false, error: a.message, list: [] };
  }
}

interface Props { eventId: number; }

export default function ChampsTab({ eventId }: Props) {
  const [state, dispatch] = useReducer(reducer, { loading: false, error: null, list: [] });
  const [selectedRole, setSelectedRole] = useState<RoleFilter>('All');
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'picks', dir: 'desc' });

  const fetchData = useCallback(() => {
    dispatch({ type: 'fetch' });
    getEventChampions(eventId)
      .then((res) => dispatch({ type: 'success', list: res.data }))
      .catch(() => dispatch({ type: 'error', message: 'Failed to load champions' }));
  }, [eventId]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useRefetchOnFocus(fetchData);

  function handleSort(col: string) {
    setSort(prev => ({ col, dir: prev.col === col ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc' }));
  }

  const rows = (() => {
    const base = selectedRole === 'All'
      ? state.list
      : state.list
          .filter(c => (c.picks_by_role[selectedRole] ?? 0) > 0)
          .slice()
          .sort((a, b) => (b.picks_by_role[selectedRole] ?? 0) - (a.picks_by_role[selectedRole] ?? 0));
    const withStats = base.map((c) => {
      const picks = selectedRole === 'All'
        ? Object.values(c.picks_by_role).reduce((s, n) => s + n, 0)
        : (c.picks_by_role[selectedRole] ?? 0);
      const wins = selectedRole === 'All'
        ? Object.values(c.wins_by_role).reduce((s, n) => s + n, 0)
        : (c.wins_by_role[selectedRole] ?? 0);
      return { ...c, picks, winRate: picks > 0 ? Math.round(wins / picks * 1000) / 10 : null };
    });
    const d = sort.dir === 'desc' ? -1 : 1;
    return [...withStats].sort((a, b) => {
      switch (sort.col) {
        case 'name':     return d * a.name.localeCompare(b.name);
        case 'picks':    return d * (a.picks - b.picks);
        case 'bans':     return d * (a.bans - b.bans);
        case 'win_rate': {
          if (a.winRate == null && b.winRate == null) return 0;
          if (a.winRate == null) return 1;
          if (b.winRate == null) return -1;
          return d * (a.winRate - b.winRate);
        }
        default: return 0;
      }
    }).map((c, i) => ({ ...c, rank: i + 1 }));
  })();

  if (state.loading) return <div className="py-8 flex items-center justify-center"><div className="spinner" /></div>;
  if (state.error)   return <p className="text-sm text-red-400 py-6 px-6">{state.error}</p>;

  return (
    <>
      <RoleFilterBar selected={selectedRole} onChange={setSelectedRole} />
      {rows.length === 0 ? (
        <p className="text-sm text-(--text-dim) py-6 px-6">No champion data yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--border)">
              <th className="text-left px-6 py-3 text-xs font-semibold text-(--text-dim) uppercase tracking-wide w-10">#</th>
              <th onClick={() => handleSort('name')} className="text-left px-4 py-3 text-xs font-semibold text-(--text-dim) uppercase tracking-wide cursor-pointer select-none hover:text-(--text-h) transition-colors">Champion<SortIcon active={sort.col === 'name'} dir={sort.dir} /></th>
              <th onClick={() => handleSort('picks')} className="text-center px-4 py-3 text-xs font-semibold text-(--text-dim) uppercase tracking-wide cursor-pointer select-none hover:text-(--text-h) transition-colors">Picks<SortIcon active={sort.col === 'picks'} dir={sort.dir} /></th>
              <th onClick={() => handleSort('bans')} className="text-center px-4 py-3 text-xs font-semibold text-(--text-dim) uppercase tracking-wide cursor-pointer select-none hover:text-(--text-h) transition-colors">Bans<SortIcon active={sort.col === 'bans'} dir={sort.dir} /></th>
              <th onClick={() => handleSort('win_rate')} className="text-center px-6 py-3 text-xs font-semibold text-(--text-dim) uppercase tracking-wide cursor-pointer select-none hover:text-(--text-h) transition-colors">Win%<SortIcon active={sort.col === 'win_rate'} dir={sort.dir} /></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={c.id} className={`hover:bg-(--surface-hover) transition-colors ${i > 0 ? 'border-t border-(--border)' : ''}`}>
                <td className="px-6 py-2.5 text-(--text-dim) tabular-nums text-xs">{c.rank}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <img src={c.icon_url} alt={c.name} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                    <span className="font-semibold text-(--text-h)">{c.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-center tabular-nums text-(--text-h) font-medium">{c.picks}</td>
                <td className="px-4 py-2.5 text-center tabular-nums text-(--text-dim)">{c.bans}</td>
                <td className="px-6 py-2.5 text-center tabular-nums font-medium" style={{
                  color: c.winRate == null ? 'var(--text-dim)'
                    : c.winRate >= 55 ? 'var(--green)'
                    : c.winRate <= 45 ? 'var(--red, #f87171)'
                    : 'var(--text)',
                }}>
                  {c.winRate != null ? `${c.winRate.toFixed(1)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
