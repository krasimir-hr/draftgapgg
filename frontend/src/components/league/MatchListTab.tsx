import { useEffect, useReducer } from 'react';
import { getMatches } from '../../api/core';
import type { Match } from '../../types/models';

function groupByTab(matches: Match[]): { tab: string; matches: Match[] }[] {
  const map: Record<string, Match[]> = {};
  for (const m of matches) { (map[m.tab || 'Other'] ??= []).push(m); }
  return Object.entries(map).map(([tab, matches]) => ({ tab, matches }));
}

interface State { loading: boolean; error: string | null; list: Match[]; }
type Action = { type: 'fetch' } | { type: 'success'; list: Match[] } | { type: 'error'; message: string };
function reducer(_s: State, a: Action): State {
  switch (a.type) {
    case 'fetch':   return { loading: true, error: null, list: [] };
    case 'success': return { loading: false, error: null, list: a.list };
    case 'error':   return { loading: false, error: a.message, list: [] };
  }
}

interface Props {
  eventId: number;
  isResult: boolean;
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
  placementByTeam: Record<string, number>;
  onMatchSelect: (id: number) => void;
}

export default function MatchListTab({ eventId, isResult, teamLogos, teamShortNames, placementByTeam, onMatchSelect }: Props) {
  const [state, dispatch] = useReducer(reducer, { loading: false, error: null, list: [] });

  useEffect(() => {
    dispatch({ type: 'fetch' });
    getMatches({ event: eventId, has_result: isResult ? 'true' : 'false', page_size: 500 })
      .then((res) => dispatch({ type: 'success', list: res.data.results }))
      .catch(() => dispatch({ type: 'error', message: 'Failed to load matches' }));
  }, [eventId, isResult]);

  const groups = (() => {
    const g = groupByTab(state.list);
    if (isResult) {
      return g.sort((a, b) => {
        const latestA = a.matches.map(m => m.datetime_utc ?? '').sort().at(-1) ?? '';
        const latestB = b.matches.map(m => m.datetime_utc ?? '').sort().at(-1) ?? '';
        return latestB.localeCompare(latestA);
      });
    }
    return g.sort((a, b) => {
      const earliestA = a.matches.map(m => m.datetime_utc ?? '').sort()[0] ?? '';
      const earliestB = b.matches.map(m => m.datetime_utc ?? '').sort()[0] ?? '';
      return earliestA.localeCompare(earliestB);
    });
  })();

  if (state.loading) return <div className="py-8 flex items-center justify-center"><div className="spinner" /></div>;
  if (state.error)   return <p className="text-sm text-red-400 py-6 px-6">{state.error}</p>;
  if (state.list.length === 0) return (
    <p className="text-sm text-(--text-dim) py-6 px-6">{isResult ? 'No results yet.' : 'No upcoming matches.'}</p>
  );

  return (
    <>
      {groups.map((group, gi) => (
        <div key={group.tab} className={gi > 0 ? 'border-t border-(--border)' : ''}>
          <div className="px-6 py-2 bg-(--surface-sub)">
            <span className="text-xs font-semibold text-(--text-dim) uppercase tracking-wide">{group.tab}</span>
          </div>
          {group.matches.map((m, i) => (
            <button
              key={m.id}
              onClick={() => onMatchSelect(m.id)}
              className={`w-full h-15 grid grid-cols-[1fr_auto_1fr_auto] items-center gap-x-4 px-12 hover:bg-(--surface-hover) transition-colors ${i > 0 ? 'border-t border-(--border)' : ''}`}
            >
              <div className="flex flex-col items-start text-[10px] text-(--text-dim) tabular-nums leading-tight">
                {m.datetime_utc ? (
                  <>
                    <span className="whitespace-nowrap">{new Date(m.datetime_utc).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    <span className="whitespace-nowrap">{new Date(m.datetime_utc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                  </>
                ) : <span>TBD</span>}
              </div>

              <div className="grid grid-cols-[1rem_2.5rem_2.25rem_2.5rem_2.25rem_2.5rem_1rem] items-center gap-x-3">
                <span className="text-[10px] text-(--text-dim) opacity-70 tabular-nums text-right">{placementByTeam[m.team1] ?? ''}</span>
                <span className="text-sm font-bold truncate text-right text-(--text-h)">{teamShortNames[m.team1] || m.team1}</span>
                {teamLogos[m.team1] ? (
                  <div className="w-9 h-9 shrink-0 flex items-center justify-center overflow-hidden"><img src={teamLogos[m.team1]!} alt={m.team1} className="max-w-full max-h-full object-contain" /></div>
                ) : (
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: 'var(--accent)' }}>{m.team1.charAt(0)}</div>
                )}
                {isResult ? (
                  <div className="flex items-center justify-center gap-0.5">
                    <span className="text-sm font-bold text-(--text-h) tabular-nums">{m.team1_score}</span>
                    <span className="text-sm font-bold text-(--text-h) px-1">-</span>
                    <span className="text-sm font-bold text-(--text-h) tabular-nums">{m.team2_score}</span>
                  </div>
                ) : (
                  <span className="text-xs text-(--text-dim) text-center">vs</span>
                )}
                {teamLogos[m.team2] ? (
                  <div className="w-9 h-9 shrink-0 flex items-center justify-center overflow-hidden"><img src={teamLogos[m.team2]!} alt={m.team2} className="max-w-full max-h-full object-contain" /></div>
                ) : (
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: 'var(--accent)' }}>{m.team2.charAt(0)}</div>
                )}
                <span className="text-sm font-bold truncate text-(--text-h)">{teamShortNames[m.team2] || m.team2}</span>
                <span className="text-[10px] text-(--text-dim) opacity-70 tabular-nums">{placementByTeam[m.team2] ?? ''}</span>
              </div>

              <div className="flex flex-col items-end text-[10px] text-(--text-dim) leading-tight">
                <span className="whitespace-nowrap">BO{m.best_of}</span>
                {m.tab && <span className="whitespace-nowrap">{m.tab}</span>}
              </div>

              <span className="text-xs text-(--text-dim)">→</span>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}
