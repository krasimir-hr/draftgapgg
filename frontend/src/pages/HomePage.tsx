import { useEffect, useReducer } from 'react';
import { getOverview } from '../api/core';
import type { Overview, Match, OverviewTopChampion, OverviewTopPlayer } from '../types/models';
import { useDrawer } from '../contexts/DrawerContext';
import { ChampionIcon } from '../components/ChampionIcon';

/* state machine */

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

/* helpers */

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

/* sub-components */

function CardShell({ title, children, meta }: { title: string; children: React.ReactNode; meta?: string }) {
  return (
    <div className="card card-soft-shadow flex flex-col">
      <div className="px-5 py-4 border-b border-(--border) flex items-baseline gap-2">
        <h2 className="font-sans text-sm font-semibold text-(--text-h) tracking-tight">{title}</h2>
        {meta && <span className="text-xs text-(--text-dim)">· {meta}</span>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function MatchRow({ m, showScore }: { m: Match; showScore: boolean }) {
  const { openMatch } = useDrawer();
  const t1Win = m.winner === 1;
  const t2Win = m.winner === 2;
  return (
    <button
      type="button"
      onClick={() => openMatch(m.id)}
      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-(--surface-sub) transition-colors border-b border-(--border) last:border-0 text-left"
    >
      <div className="flex-1 min-w-0">
        {showScore ? (
          <p className="text-sm text-(--text-h) tabular-nums">
            <span className={t1Win ? 'font-semibold text-(--text-h)' : 'text-(--text-dim)'}>{m.team1}</span>
            <span className="mx-2 text-(--text-dim) text-xs font-bold">
              {m.team1_score}<span className="text-(--text-faint) font-normal">–</span>{m.team2_score}
            </span>
            <span className={t2Win ? 'font-semibold text-(--text-h)' : 'text-(--text-dim)'}>{m.team2}</span>
          </p>
        ) : (
          <p className="text-sm font-medium text-(--text-h)">
            {m.team1}
            <span className="mx-2 text-(--text-faint) text-xs">vs</span>
            {m.team2}
          </p>
        )}
        <p className="text-xs text-(--text-dim) mt-1 tracking-wide">
          BO{m.best_of}{m.tab ? ` · ${m.tab}` : ''}
        </p>
      </div>
      <span className="text-xs text-(--text-dim) shrink-0 tabular-nums">
        {showScore
          ? m.datetime_utc
            ? new Date(m.datetime_utc).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            : 'TBD'
          : fmtDatetime(m.datetime_utc)}
      </span>
    </button>
  );
}

function ChampRow({ c, rank }: { c: OverviewTopChampion; rank: number }) {
  const wr = c.win_rate;
  const wrColor = wr === null ? 'text-(--text-h)'
    : wr >= 55 ? 'text-(--green)'
    : wr <= 45 ? 'text-(--red)'
    : 'text-(--text-h)';
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-(--border) last:border-0 hover:bg-(--surface-sub) transition-colors">
      <span className="w-5 text-xs text-(--text-dim) tabular-nums text-right shrink-0 font-semibold">{rank}</span>
      <ChampionIcon src={c.icon_url} alt={c.name} size={32} />
      <span className="flex-1 min-w-0 text-sm font-semibold text-(--text-h) truncate">{c.name}</span>
      <div className="flex gap-4 shrink-0 text-xs tabular-nums text-(--text-dim)">
        <span><span className="text-(--text-h) font-semibold">{c.picks}</span> picks</span>
        {wr !== null && (
          <span className={`font-semibold ${wrColor}`}>{wr.toFixed(1)}%</span>
        )}
      </div>
    </div>
  );
}

function PlayerRow({ p, rank }: { p: OverviewTopPlayer; rank: number }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-(--border) last:border-0 hover:bg-(--surface-sub) transition-colors">
      <span className="w-5 text-xs text-(--text-dim) tabular-nums text-right shrink-0 font-semibold">{rank}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-(--text-h) truncate">{p.name}</p>
        <p className="text-xs text-(--text-dim) mt-0.5">
          {p.team} · {roleShort(p.role)}
        </p>
      </div>
      <div className="flex gap-5 shrink-0 text-xs tabular-nums text-right">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-(--text-dim)">KDA</p>
          <p className="text-(--text-h) font-semibold mt-0.5 font-display text-base leading-none">{p.kda}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-(--text-dim)">K/D/A</p>
          <p className="text-(--text) font-medium mt-0.5">
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

/* main page */

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
      <header className="mb-8">
        <div className="eyebrow mb-2">Pro League · Overview</div>
        <h1 className="h-display" style={{ fontSize: 44 }}>Overview</h1>
        <p className="mt-3 text-(--text)" style={{ fontSize: 15.5, maxWidth: 580, lineHeight: 1.55 }}>
          Match results, picks, and player form across the leagues you follow. Tap any card to dig deeper.
        </p>
      </header>

      {state.status === 'error' && (
        <p className="text-sm text-(--red) py-8 text-center">{state.message}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Upcoming Matches */}
        <CardShell title="Upcoming matches">
          {loading && <div className="px-5 py-10 flex justify-center"><div className="spinner" /></div>}
          {data && (
            data.upcoming_matches.length > 0
              ? data.upcoming_matches.map(m => <MatchRow key={m.id} m={m} showScore={false} />)
              : <EmptyState label="No upcoming matches" />
          )}
        </CardShell>

        {/* Recent Results */}
        <CardShell title="Recent results">
          {loading && <div className="px-5 py-10 flex justify-center"><div className="spinner" /></div>}
          {data && (
            data.recent_results.length > 0
              ? data.recent_results.map(m => <MatchRow key={m.id} m={m} showScore={true} />)
              : <EmptyState label="No results yet" />
          )}
        </CardShell>

        {/* Top Champions */}
        <CardShell title="Most picked champions" meta="Patch 16.10">
          {loading && <div className="px-5 py-10 flex justify-center"><div className="spinner" /></div>}
          {data && (
            data.top_champions.length > 0
              ? data.top_champions.map((c, i) => <ChampRow key={c.id} c={c} rank={i + 1} />)
              : <EmptyState label="No champion data yet." />
          )}
        </CardShell>

        {/* Top Players */}
        <CardShell title="Best KDA players">
          {loading && <div className="px-5 py-10 flex justify-center"><div className="spinner" /></div>}
          {data && (
            data.top_players.length > 0
              ? data.top_players.map((p, i) => <PlayerRow key={p.name} p={p} rank={i + 1} />)
              : <EmptyState label="No player data yet." />
          )}
        </CardShell>
      </div>
    </div>
  );
}
