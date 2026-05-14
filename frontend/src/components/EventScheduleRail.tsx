import { useEffect, useMemo, useReducer, useRef } from 'react';
import { getMatches } from '../api/core';
import type { Match } from '../types/models';

interface State { loading: boolean; matches: Match[]; }
type Action =
  | { type: 'fetch' }
  | { type: 'success'; matches: Match[] }
  | { type: 'error' };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'fetch':   return { ...s, loading: true };
    case 'success': return { loading: false, matches: a.matches };
    case 'error':   return { ...s, loading: false };
  }
}

interface Props {
  eventId: number;
  currentMatchId: number | null;
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
  onMatchSelect: (id: number) => void;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const h = d.getHours();
  const min = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const t = min === 0 ? `${h12}${ampm}` : `${h12}:${String(min).padStart(2, '0')}${ampm}`;
  return `${dd}/${mm} ${t}`;
}

export default function EventScheduleRail({
  eventId, currentMatchId, teamLogos, onMatchSelect,
}: Props) {
  const [state, dispatch] = useReducer(reducer, { loading: true, matches: [] });
  const currentRowRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    dispatch({ type: 'fetch' });
    getMatches({ event: eventId, page_size: 200 })
      .then(res => {
        const matches = [...res.data.results].sort(
          (a, b) => (a.datetime_utc ?? '').localeCompare(b.datetime_utc ?? ''),
        );
        dispatch({ type: 'success', matches });
      })
      .catch(() => dispatch({ type: 'error' }));
  }, [eventId]);

  const groups = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of state.matches) {
      const key = m.tab || 'Matches';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return [...map.entries()];
  }, [state.matches]);

  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, [currentMatchId, state.loading]);

  function TeamLogo({ team }: { team: string }) {
    return teamLogos[team] ? (
      <img src={teamLogos[team]!} alt={team} className="w-7 h-7 object-contain shrink-0" />
    ) : (
      <div className="w-7 h-7 rounded flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ background: 'var(--accent)' }}>
        {team.charAt(0)}
      </div>
    );
  }

  function Row({ m }: { m: Match }) {
    const isCurrent = m.id === currentMatchId;
    const played = m.winner !== null;
    const t1Win = played && m.winner === 1;
    const t2Win = played && m.winner === 2;
    const dateTime = formatDateTime(m.datetime_utc);

    return (
      <button
        ref={isCurrent ? currentRowRef : undefined}
        onClick={() => onMatchSelect(m.id)}
        title={`${m.team1} vs ${m.team2}`}
        className={`group w-full rounded-lg text-left transition-all duration-150 ease-out cursor-pointer ${
          isCurrent
            ? 'bg-(--accent-muted) ring-1 ring-(--accent)'
            : 'bg-(--surface-sub) hover:bg-(--surface-hover) hover:-translate-y-px'
        }`}
        style={isCurrent ? {} : { boxShadow: '0 1px 0 0 color-mix(in srgb, var(--border) 60%, transparent)' }}
      >
        <div className="px-3 py-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-[10px] leading-none tabular-nums">
            <span className={isCurrent ? 'text-(--accent-2) font-medium' : 'text-(--text-dim)'}>{dateTime}</span>
            <span className="text-[9px] font-semibold tracking-wider text-(--text-dim) opacity-60">BO{m.best_of}</span>
          </div>
          <div className="flex items-center justify-between gap-1">
            <TeamLogo team={m.team1} />
            {played ? (
              <div className="flex items-baseline gap-1 tabular-nums">
                <span className={`text-base font-bold ${t1Win ? 'text-(--text-h)' : 'text-(--text-dim) opacity-60'}`}>{m.team1_score}</span>
                <span className="text-xs text-(--text-dim) opacity-40">–</span>
                <span className={`text-base font-bold ${t2Win ? 'text-(--text-h)' : 'text-(--text-dim) opacity-60'}`}>{m.team2_score}</span>
              </div>
            ) : (
              <span className="text-[10px] font-semibold text-(--text-dim) uppercase tracking-widest opacity-60">vs</span>
            )}
            <TeamLogo team={m.team2} />
          </div>
        </div>
      </button>
    );
  }

  if (state.loading) {
    return (
      <div className="border border-(--border) rounded-xl overflow-hidden bg-(--surface) flex items-center justify-center py-8">
        <div className="spinner" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="border border-(--border) rounded-xl overflow-hidden bg-(--surface)">
        <p className="text-[10px] text-(--text-dim) px-2 py-4 text-center">No matches</p>
      </div>
    );
  }

  return (
    <div className="border border-(--border) rounded-xl overflow-y-auto bg-(--surface) h-full">
      {groups.map(([stage, matches], gi) => (
        <div key={stage}>
          <div
            className={`flex items-center gap-2 px-3 py-2 sticky top-0 z-10 backdrop-blur-sm ${gi > 0 ? 'border-t border-(--border)' : ''}`}
            style={{ background: 'color-mix(in srgb, var(--surface) 92%, transparent)' }}
          >
            <span className="h-1 w-1 rounded-full bg-(--accent) shrink-0" />
            <span className="text-[10px] font-semibold text-(--text-h) uppercase tracking-wider truncate">{stage}</span>
            <span className="ml-auto text-[9px] text-(--text-dim) tabular-nums opacity-60">{matches.length}</span>
          </div>
          <div className="px-2 py-2.5 flex flex-col gap-2.5">
            {matches.map(m => <Row key={m.id} m={m} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
