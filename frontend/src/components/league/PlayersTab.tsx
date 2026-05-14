import { useCallback, useEffect, useReducer, useState } from 'react';
import { getEventPlayers } from '../../api/core';
import type { EventPlayerStats } from '../../types/models';
import { ROLE_ABBR, RoleFilterBar, SortIcon } from './shared';
import type { RoleFilter } from './shared';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';

interface State { loading: boolean; error: string | null; list: EventPlayerStats[]; }
type Action = { type: 'fetch' } | { type: 'success'; list: EventPlayerStats[] } | { type: 'error'; message: string };
function reducer(_s: State, a: Action): State {
  switch (a.type) {
    case 'fetch':   return { loading: true, error: null, list: [] };
    case 'success': return { loading: false, error: null, list: a.list };
    case 'error':   return { loading: false, error: a.message, list: [] };
  }
}

interface Props {
  eventId: number;
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
}

export default function PlayersTab({ eventId, teamLogos, teamShortNames }: Props) {
  const [state, dispatch] = useReducer(reducer, { loading: false, error: null, list: [] });
  const [selectedRole, setSelectedRole] = useState<RoleFilter>('All');
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'games_played', dir: 'desc' });

  const fetchData = useCallback(() => {
    dispatch({ type: 'fetch' });
    getEventPlayers(eventId)
      .then((res) => dispatch({ type: 'success', list: res.data }))
      .catch(() => dispatch({ type: 'error', message: 'Failed to load players' }));
  }, [eventId]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useRefetchOnFocus(fetchData);

  function handleSort(col: string) {
    setSort(prev => ({ col, dir: prev.col === col ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc' }));
  }

  const rows = (() => {
    const base = selectedRole === 'All'
      ? state.list
      : state.list.filter(p => p.role === selectedRole);
    const d = sort.dir === 'desc' ? -1 : 1;
    return [...base].sort((a, b) => {
      switch (sort.col) {
        case 'name':           return d * a.name.localeCompare(b.name);
        case 'games_played':   return d * (a.games_played - b.games_played);
        case 'avg_kills':      return d * (a.avg_kills - b.avg_kills);
        case 'avg_deaths':     return d * (a.avg_deaths - b.avg_deaths);
        case 'avg_assists':    return d * (a.avg_assists - b.avg_assists);
        case 'avg_cs_per_min': {
          if (a.avg_cs_per_min == null && b.avg_cs_per_min == null) return 0;
          if (a.avg_cs_per_min == null) return 1;
          if (b.avg_cs_per_min == null) return -1;
          return d * (a.avg_cs_per_min - b.avg_cs_per_min);
        }
        default: return 0;
      }
    }).map((p, i) => ({ ...p, rank: i + 1 }));
  })();

  if (state.loading) return <div className="py-8 flex items-center justify-center"><div className="spinner" /></div>;
  if (state.error)   return <p className="text-sm text-red-400 py-6 px-6">{state.error}</p>;

  return (
    <>
      <RoleFilterBar selected={selectedRole} onChange={setSelectedRole} />
      {rows.length === 0 ? (
        <p className="text-sm text-(--text-dim) py-6 px-6">No player data yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--border)">
              <th className="text-left px-6 py-3 text-xs font-semibold text-(--text-dim) uppercase tracking-wide w-10">#</th>
              <th onClick={() => handleSort('name')} className="text-left px-4 py-3 text-xs font-semibold text-(--text-dim) uppercase tracking-wide cursor-pointer select-none hover:text-(--text-h) transition-colors">Player<SortIcon active={sort.col === 'name'} dir={sort.dir} /></th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-(--text-dim) uppercase tracking-wide">Role</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-(--text-dim) uppercase tracking-wide">Team</th>
              <th onClick={() => handleSort('games_played')} className="text-center px-3 py-3 text-xs font-semibold text-(--text-dim) uppercase tracking-wide cursor-pointer select-none hover:text-(--text-h) transition-colors">GP<SortIcon active={sort.col === 'games_played'} dir={sort.dir} /></th>
              <th onClick={() => handleSort('avg_kills')} className="text-center px-3 py-3 text-xs font-semibold text-(--text-dim) uppercase tracking-wide cursor-pointer select-none hover:text-(--text-h) transition-colors">K<SortIcon active={sort.col === 'avg_kills'} dir={sort.dir} /></th>
              <th onClick={() => handleSort('avg_deaths')} className="text-center px-3 py-3 text-xs font-semibold text-(--text-dim) uppercase tracking-wide cursor-pointer select-none hover:text-(--text-h) transition-colors">D<SortIcon active={sort.col === 'avg_deaths'} dir={sort.dir} /></th>
              <th onClick={() => handleSort('avg_assists')} className="text-center px-3 py-3 text-xs font-semibold text-(--text-dim) uppercase tracking-wide cursor-pointer select-none hover:text-(--text-h) transition-colors">A<SortIcon active={sort.col === 'avg_assists'} dir={sort.dir} /></th>
              <th onClick={() => handleSort('avg_cs_per_min')} className="text-center px-4 py-3 text-xs font-semibold text-(--text-dim) uppercase tracking-wide cursor-pointer select-none hover:text-(--text-h) transition-colors">CS/min<SortIcon active={sort.col === 'avg_cs_per_min'} dir={sort.dir} /></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.name} className={`hover:bg-(--surface-hover) transition-colors ${i > 0 ? 'border-t border-(--border)' : ''}`}>
                <td className="px-6 py-3 text-(--text-dim) tabular-nums text-xs">{p.rank}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    {p.image ? (
                      <img src={p.image} alt={p.name} className="w-8 h-8 rounded-full object-cover object-top shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: 'var(--accent)' }}>
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="font-semibold text-(--text-h) whitespace-nowrap">{p.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-semibold text-(--text-dim) uppercase tracking-wide">{ROLE_ABBR[p.role] ?? p.role}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {teamLogos[p.team] ? (
                      <img src={teamLogos[p.team]!} alt={p.team} className="w-5 h-5 object-contain shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ background: 'var(--accent)' }}>
                        {p.team.charAt(0)}
                      </div>
                    )}
                    <span className="text-(--text) whitespace-nowrap">{teamShortNames[p.team] || p.team}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-center text-(--text) tabular-nums">{p.games_played}</td>
                <td className="px-3 py-3 text-center tabular-nums font-medium" style={{ color: 'var(--green)' }}>{p.avg_kills.toFixed(1)}</td>
                <td className="px-3 py-3 text-center text-red-400 tabular-nums font-medium">{p.avg_deaths.toFixed(1)}</td>
                <td className="px-3 py-3 text-center text-(--text) tabular-nums">{p.avg_assists.toFixed(1)}</td>
                <td className="px-4 py-3 text-center text-(--text-dim) tabular-nums">
                  {p.avg_cs_per_min != null ? p.avg_cs_per_min.toFixed(2) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
