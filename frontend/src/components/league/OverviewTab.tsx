import { useEffect, useReducer } from 'react';
import { getMatches, getEventPlayers, getEventChampions } from '../../api/core';
import type { Match, EventPlayerStats, EventChampionStats } from '../../types/models';
import { ROLE_ABBR } from './shared';

interface TeamFormEntry { team: string; form: ('W' | 'L')[]; wins: number; }
interface OverviewData {
  upcoming: Match[];
  results: Match[];
  players: EventPlayerStats[];
  champions: EventChampionStats[];
  form: TeamFormEntry[];
}
interface State { loading: boolean; error: string | null; data: OverviewData | null; }
type Action = { type: 'fetch' } | { type: 'success'; data: OverviewData } | { type: 'error'; message: string };
function reducer(_s: State, a: Action): State {
  switch (a.type) {
    case 'fetch':   return { loading: true, error: null, data: null };
    case 'success': return { loading: false, error: null, data: a.data };
    case 'error':   return { loading: false, error: a.message, data: null };
  }
}

interface Props {
  eventId: number;
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
  onMatchSelect: (id: number) => void;
}

export default function OverviewTab({ eventId, teamLogos, teamShortNames, onMatchSelect }: Props) {
  const [state, dispatch] = useReducer(reducer, { loading: true, error: null, data: null });

  useEffect(() => {
    dispatch({ type: 'fetch' });
    const now = new Date();
    Promise.all([
      getMatches({ event: eventId, has_result: 'false', page_size: 20 }),
      getMatches({ event: eventId, has_result: 'true',  page_size: 50 }),
      getEventPlayers(eventId),
      getEventChampions(eventId),
    ])
      .then(([upRes, resRes, playersRes, champsRes]) => {
        const upcoming = upRes.data.results
          .filter(m => m.datetime_utc && new Date(m.datetime_utc) > now)
          .sort((a, b) => (a.datetime_utc ?? '').localeCompare(b.datetime_utc ?? ''))
          .slice(0, 5);

        const teamMatches: Record<string, { won: boolean; date: string }[]> = {};
        for (const m of resRes.data.results) {
          if (m.winner === null) continue;
          const t1Won = m.winner === 1;
          (teamMatches[m.team1] ??= []).push({ won: t1Won,  date: m.datetime_utc ?? '' });
          (teamMatches[m.team2] ??= []).push({ won: !t1Won, date: m.datetime_utc ?? '' });
        }
        const form: TeamFormEntry[] = Object.entries(teamMatches)
          .map(([team, matches]) => {
            const last5 = [...matches].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
            const f = last5.map(m => (m.won ? 'W' : 'L') as 'W' | 'L');
            return { team, form: f, wins: f.filter(r => r === 'W').length };
          })
          .sort((a, b) => b.wins - a.wins)
          .slice(0, 5);

        dispatch({
          type: 'success',
          data: {
            upcoming,
            results: resRes.data.results.slice(0, 5),
            players: playersRes.data,
            champions: champsRes.data,
            form,
          },
        });
      })
      .catch(() => dispatch({ type: 'error', message: 'Failed to load overview' }));
  }, [eventId]);

  if (state.loading) return <div className="py-10 flex items-center justify-center"><div className="spinner" /></div>;
  if (state.error)   return <p className="text-sm text-red-400 py-6 px-6">{state.error}</p>;
  if (!state.data)   return null;

  const { upcoming, results, form, champions, players } = state.data;

  const topChamps = champions.slice(0, 5).map(c => ({
    ...c,
    picks: Object.values(c.picks_by_role).reduce((s, n) => s + n, 0),
    wins:  Object.values(c.wins_by_role).reduce((s, n) => s + n, 0),
  }));

  const topPlayers = [...players]
    .sort((a, b) => {
      const kdaA = (a.avg_kills + a.avg_assists) / Math.max(a.avg_deaths, 0.1);
      const kdaB = (b.avg_kills + b.avg_assists) / Math.max(b.avg_deaths, 0.1);
      return kdaB - kdaA;
    })
    .slice(0, 5);

  function MatchRow({ m, i, showScore }: { m: Match; i: number; showScore: boolean }) {
    return (
      <button
        onClick={() => onMatchSelect(m.id)}
        className={`w-full h-15 grid grid-cols-[1fr_auto_1fr] items-center gap-x-4 px-4 hover:bg-(--surface-hover) transition-colors ${i > 0 ? 'border-t border-(--border)' : ''}`}
      >
        <div className="flex flex-col items-start text-[10px] text-(--text-dim) tabular-nums leading-tight">
          {m.datetime_utc ? (
            <>
              <span className="whitespace-nowrap">{new Date(m.datetime_utc).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              <span className="whitespace-nowrap">{new Date(m.datetime_utc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
            </>
          ) : <span>TBD</span>}
        </div>
        <div className="grid grid-cols-[2.25rem_2.25rem_2.5rem_2.25rem_2.25rem] items-center gap-x-3">
          <span className={`text-xs font-semibold truncate text-right ${showScore && m.winner === 1 ? 'text-(--text-h)' : showScore ? 'text-(--text-dim)' : 'text-(--text-h)'}`}>
            {teamShortNames[m.team1] || m.team1}
          </span>
          {teamLogos[m.team1] ? (
            <div className="w-9 h-9 shrink-0 flex items-center justify-center overflow-hidden">
              <img src={teamLogos[m.team1]!} alt={m.team1} className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: 'var(--accent)' }}>{m.team1.charAt(0)}</div>
          )}
          {showScore ? (
            <div className="flex items-center justify-center gap-0.5">
              <span className="text-sm font-bold text-(--text-h) tabular-nums">{m.team1_score}</span>
              <span className="text-sm font-bold text-(--text-h) px-1">-</span>
              <span className="text-sm font-bold text-(--text-h) tabular-nums">{m.team2_score}</span>
            </div>
          ) : (
            <span className="text-xs text-(--text-dim) text-center">vs</span>
          )}
          {teamLogos[m.team2] ? (
            <div className="w-9 h-9 shrink-0 flex items-center justify-center overflow-hidden">
              <img src={teamLogos[m.team2]!} alt={m.team2} className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: 'var(--accent)' }}>{m.team2.charAt(0)}</div>
          )}
          <span className={`text-xs font-semibold truncate ${showScore && m.winner === 2 ? 'text-(--text-h)' : showScore ? 'text-(--text-dim)' : 'text-(--text-h)'}`}>
            {teamShortNames[m.team2] || m.team2}
          </span>
        </div>
        <div className="flex flex-col items-end text-[10px] text-(--text-dim) leading-tight">
          <span className="whitespace-nowrap">BO{m.best_of}</span>
          {m.tab && <span className="whitespace-nowrap">{m.tab}</span>}
        </div>
      </button>
    );
  }

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div className="border border-(--border) rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-(--surface-sub) border-b border-(--border)">
          <span className="text-xs font-semibold text-(--text-dim) uppercase tracking-wide">{title}</span>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-3 md:grid-rows-2 gap-4">

      <Section title="Upcoming Matches">
        {upcoming.length === 0
          ? <p className="text-sm text-(--text-dim) px-4 py-6 text-center">No upcoming matches</p>
          : upcoming.map((m, i) => <MatchRow key={m.id} m={m} i={i} showScore={false} />)}
      </Section>

      <Section title="Recent Results">
        {results.length === 0
          ? <p className="text-sm text-(--text-dim) px-4 py-6 text-center">No results yet</p>
          : results.map((m, i) => <MatchRow key={m.id} m={m} i={i} showScore={true} />)}
      </Section>

      <Section title="Recent Form">
        {form.length === 0
          ? <p className="text-sm text-(--text-dim) px-4 py-6 text-center">No data</p>
          : form.map((entry, i) => (
            <div key={entry.team} className={`h-15 flex items-center gap-3 px-4 ${i > 0 ? 'border-t border-(--border)' : ''}`}>
              <span className="w-4 text-xs text-(--text-dim) tabular-nums text-right shrink-0">{i + 1}</span>
              {teamLogos[entry.team] ? (
                <img src={teamLogos[entry.team]!} alt={entry.team} className="w-6 h-6 object-contain shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: 'var(--accent)' }}>{entry.team.charAt(0)}</div>
              )}
              <span className="flex-1 text-sm font-semibold text-(--text-h) truncate">{entry.team}</span>
              <span className="text-sm font-bold font-mono shrink-0">
                {entry.form.map((r, fi) => (
                  <span key={fi} className={r === 'W' ? 'text-(--green)' : 'text-red-400'}>{r}</span>
                ))}
              </span>
            </div>
          ))}
      </Section>

      <Section title="Most Picked Champions">
        {topChamps.length === 0
          ? <p className="text-sm text-(--text-dim) px-4 py-6 text-center">No champion data</p>
          : topChamps.map((c, i) => {
            const winRate = c.picks > 0 ? Math.round(c.wins / c.picks * 1000) / 10 : null;
            return (
              <div key={c.id} className={`h-15 flex items-center gap-3 px-4 ${i > 0 ? 'border-t border-(--border)' : ''}`}>
                <span className="w-4 text-xs text-(--text-dim) tabular-nums text-right shrink-0">{i + 1}</span>
                <img src={c.icon_url} alt={c.name} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-(--text-h) truncate">{c.name}</p>
                  <p className="text-xs text-(--text-dim)">{c.picks} picks · {c.bans} bans</p>
                </div>
                <div className="text-right shrink-0 text-xs tabular-nums">
                  <p className={`font-semibold ${winRate !== null && winRate >= 55 ? 'text-(--green)' : winRate !== null && winRate <= 45 ? 'text-red-400' : 'text-(--text-h)'}`}>
                    {winRate !== null ? `${winRate}%` : '—'}
                  </p>
                  <p className="text-(--text-dim)">win rate</p>
                </div>
              </div>
            );
          })}
      </Section>

      <Section title="Best KDA Players">
        {topPlayers.length === 0
          ? <p className="text-sm text-(--text-dim) px-4 py-6 text-center">No player data</p>
          : topPlayers.map((p, i) => {
            const kda = ((p.avg_kills + p.avg_assists) / Math.max(p.avg_deaths, 0.1)).toFixed(2);
            return (
              <div key={p.name} className={`h-15 flex items-center gap-3 px-4 ${i > 0 ? 'border-t border-(--border)' : ''}`}>
                <span className="w-4 text-xs text-(--text-dim) tabular-nums text-right shrink-0">{i + 1}</span>
                {p.image ? (
                  <img src={p.image} alt={p.name} className="w-9 h-9 rounded-full object-cover object-top shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: 'var(--accent)' }}>{p.name.charAt(0).toUpperCase()}</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-(--text-h) truncate">{p.name}</p>
                  <div className="flex items-center gap-1">
                    {teamLogos[p.team] && <img src={teamLogos[p.team]!} alt="" className="w-3.5 h-3.5 object-contain shrink-0" />}
                    <span className="text-xs text-(--text-dim)">{teamShortNames[p.team] || p.team} · {ROLE_ABBR[p.role] ?? p.role}</span>
                  </div>
                </div>
                <div className="text-right shrink-0 text-xs tabular-nums">
                  <p className="font-semibold text-(--text-h)">{kda} KDA</p>
                  <p className="text-(--text-dim)">{p.avg_kills}/{p.avg_deaths}/{p.avg_assists}</p>
                </div>
              </div>
            );
          })}
      </Section>

    </div>
  );
}
