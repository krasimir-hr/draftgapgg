import { useEffect, useReducer } from 'react';
import { Link } from 'react-router-dom';
import { getOverview } from '../api/core';
import type { Overview, Match, OverviewTopChampion, OverviewTopPlayer } from '../types/models';

/* ── state machine ── */

type State =
  | { status: 'loading' }
  | { status: 'ok'; data: Overview }
  | { status: 'error'; message: string };

type Action =
  | { type: 'fetch' }
  | { type: 'success'; data: Overview }
  | { type: 'error'; message: string };

function reducer(_: State, action: Action): State {
  if (action.type === 'fetch') return { status: 'loading' };
  if (action.type === 'success') return { status: 'ok', data: action.data };
  return { status: 'error', message: action.message };
}

/* ── helpers ── */

function fmtDatetime(dt: string | null): string {
  if (!dt) return 'TBD';
  const d = new Date(dt);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH = diffMs / 3_600_000;
  if (diffH < 0) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (diffH < 1) return `in ${Math.max(1, Math.round(diffH * 60))} min`;
  if (diffH < 24) return `in ${Math.round(diffH)}h`;
  const diffD = Math.round(diffH / 24);
  if (diffD === 1) return 'tomorrow';
  if (diffD <= 6) return `in ${diffD}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function roleShort(role: string): string {
  const map: Record<string, string> = {
    Top: 'TOP', Jungle: 'JGL', Mid: 'MID', Bot: 'BOT', Support: 'SUP',
  };
  return map[role] ?? role.toUpperCase().slice(0, 3);
}

/* ── sub-components ── */

function CardShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card flex flex-col">
      <div className="px-5 py-4 border-b border-(--border)">
        <h2 className="text-sm font-semibold text-(--text-h) tracking-tight">{title}</h2>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function MatchRow({ m, showScore }: { m: Match; showScore: boolean }) {
  const winner = m.winner === 1 ? m.team1 : m.winner === 2 ? m.team2 : null;
  return (
    <Link
      to={`/matches/${m.id}`}
      className="flex items-center gap-3 px-5 py-3 hover:bg-(--surface-sub) transition-colors border-b border-(--border) last:border-0"
    >
      <div className="flex-1 min-w-0">
        {showScore ? (
          <p className="text-sm font-medium text-(--text-h) tabular-nums">
            <span className={m.winner === 1 ? 'font-semibold' : 'text-(--text)'}>{m.team1}</span>
            <span className="mx-1.5 text-(--text-dim) text-xs font-bold">
              {m.team1_score}–{m.team2_score}
            </span>
            <span className={m.winner === 2 ? 'font-semibold' : 'text-(--text)'}>{m.team2}</span>
          </p>
        ) : (
          <p className="text-sm font-medium text-(--text-h)">
            {m.team1}
            <span className="mx-1.5 text-(--text-dim) text-xs">vs</span>
            {m.team2}
          </p>
        )}
        <p className="text-xs text-(--text-dim) mt-0.5">
          BO{m.best_of}{m.tab ? ` · ${m.tab}` : ''}
          {winner && ` · ${winner} wins`}
        </p>
      </div>
      <span className="text-xs text-(--text-dim) shrink-0 tabular-nums">
        {showScore
          ? m.datetime_utc
            ? new Date(m.datetime_utc).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            : 'TBD'
          : fmtDatetime(m.datetime_utc)}
      </span>
    </Link>
  );
}

function ChampRow({ c, rank }: { c: OverviewTopChampion; rank: number }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-(--border) last:border-0">
      <span className="w-4 text-xs text-(--text-dim) tabular-nums text-right shrink-0">{rank}</span>
      <img src={c.icon_url} alt={c.name} className="w-8 h-8 rounded-md object-cover shrink-0" />
      <span className="flex-1 min-w-0 text-sm font-medium text-(--text-h) truncate">{c.name}</span>
      <div className="flex gap-4 shrink-0 text-xs tabular-nums text-(--text-dim)">
        <span><span className="text-(--text-h) font-medium">{c.picks}</span> picks</span>
        {c.win_rate !== null && (
          <span
            className={`font-medium ${c.win_rate >= 55 ? 'text-(--green)' : c.win_rate <= 45 ? 'text-red-400' : 'text-(--text-h)'}`}
          >
            {c.win_rate}%
          </span>
        )}
      </div>
    </div>
  );
}

function PlayerRow({ p, rank }: { p: OverviewTopPlayer; rank: number }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-(--border) last:border-0">
      <span className="w-4 text-xs text-(--text-dim) tabular-nums text-right shrink-0">{rank}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-(--text-h) truncate">{p.name}</p>
        <p className="text-xs text-(--text-dim)">
          {p.team} · {roleShort(p.role)}
        </p>
      </div>
      <div className="flex gap-4 shrink-0 text-xs tabular-nums text-right">
        <div>
          <p className="text-(--text-dim)">KDA</p>
          <p className="text-(--text-h) font-semibold">{p.kda}</p>
        </div>
        <div>
          <p className="text-(--text-dim)">K/D/A</p>
          <p className="text-(--text-h) font-medium">
            {p.avg_kills}/{p.avg_deaths}/{p.avg_assists}
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="px-5 py-10 text-center text-sm text-(--text-dim)">{label}</div>
  );
}

/* ── main page ── */

export default function HomePage() {
  const [state, dispatch] = useReducer(reducer, { status: 'loading' });

  useEffect(() => {
    dispatch({ type: 'fetch' });
    getOverview()
      .then(res => dispatch({ type: 'success', data: res.data }))
      .catch((e: unknown) => dispatch({ type: 'error', message: String(e) }));
  }, []);

  const loading = state.status === 'loading';
  const data = state.status === 'ok' ? state.data : null;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-baseline gap-3 mb-8">
        <h1 className="text-2xl font-bold text-(--text-h)">Overview</h1>
      </div>

      {state.status === 'error' && (
        <p className="text-sm text-red-400 py-8 text-center">{state.message}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Upcoming Matches */}
        <CardShell title="Upcoming Matches">
          {loading && <div className="px-5 py-10 flex justify-center"><div className="spinner" /></div>}
          {data && (
            data.upcoming_matches.length > 0
              ? data.upcoming_matches.map(m => <MatchRow key={m.id} m={m} showScore={false} />)
              : <EmptyState label="No upcoming matches" />
          )}
        </CardShell>

        {/* Recent Results */}
        <CardShell title="Recent Results">
          {loading && <div className="px-5 py-10 flex justify-center"><div className="spinner" /></div>}
          {data && (
            data.recent_results.length > 0
              ? data.recent_results.map(m => <MatchRow key={m.id} m={m} showScore={true} />)
              : <EmptyState label="No results yet" />
          )}
        </CardShell>

        {/* Top Champions */}
        <CardShell title="Most Picked Champions">
          {loading && <div className="px-5 py-10 flex justify-center"><div className="spinner" /></div>}
          {data && (
            data.top_champions.length > 0
              ? data.top_champions.map((c, i) => <ChampRow key={c.id} c={c} rank={i + 1} />)
              : <EmptyState label="No champion data" />
          )}
        </CardShell>

        {/* Top Players */}
        <CardShell title="Best KDA Players">
          {loading && <div className="px-5 py-10 flex justify-center"><div className="spinner" /></div>}
          {data && (
            data.top_players.length > 0
              ? data.top_players.map((p, i) => <PlayerRow key={p.name} p={p} rank={i + 1} />)
              : <EmptyState label="No player data" />
          )}
        </CardShell>
      </div>
    </div>
  );
}
