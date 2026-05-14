import { Link, useParams } from 'react-router-dom';
import { useDetail } from '../hooks/useApi';
import { getMatch, getGame, getEventRosters } from '../api/core';
import type { MatchDetail, GameDetail } from '../types/models';
import { useState, useEffect } from 'react';
import Spinner from '../components/Spinner';

function TeamLogo({ name, logo, size = 'md' }: { name: string; logo?: string | null; size?: 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'w-14 h-14' : 'w-9 h-9';
  if (logo) {
    return (
      <div className={`${dim} shrink-0 flex items-center justify-center overflow-hidden`}>
        <img src={logo} alt={name} className="max-w-full max-h-full object-contain" />
      </div>
    );
  }
  return (
    <div
      className={`${dim} rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0`}
      style={{ background: 'var(--accent)' }}
    >
      {name.charAt(0)}
    </div>
  );
}

function GameCard({ gameId, gameNumber }: { gameId: number; gameNumber: number }) {
  const [game, setGame] = useState<GameDetail | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || game) return;
    setLoading(true);
    getGame(gameId).then((res) => {
      setGame(res.data);
      setLoading(false);
    });
  }, [open, gameId, game]);

  const winner = game?.winner;
  const t1Won = winner === 1;
  const t2Won = winner === 2;

  return (
    <div className="border-b border-(--border) last:border-0 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-(--surface-sub) transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-(--text-h)">
            Game {game?.game_number ?? gameNumber}
          </span>
          {game?.gamelength && (
            <span className="text-xs text-(--text-dim) tabular-nums">{game.gamelength}</span>
          )}
          {winner && game && (
            <span className="badge badge-green">
              {t1Won ? game.team1 : game.team2} wins
            </span>
          )}
        </div>
        <span className="text-xs text-(--text-dim)">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-(--border)">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="spinner" />
            </div>
          )}

          {game && (
            <div className="p-5 space-y-5">
              {/* Draft */}
              <div className="grid grid-cols-2 gap-3">
                <div
                  className="rounded-lg p-4"
                  style={{ background: t1Won ? 'var(--green-muted)' : 'var(--surface-sub)' }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-(--text-dim) mb-2">
                    {game.team1} · Blue
                  </p>
                  <div className="space-y-2">
                    <div>
                      <p className="text-[10px] text-(--text-dim) mb-0.5">Picks</p>
                      <p className="text-xs text-(--text-h)">{game.team1_picks.map(c => c.name).join(', ') || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-(--text-dim) mb-0.5">Bans</p>
                      <p className="text-xs text-(--text)">{game.team1_bans.map(c => c.name).join(', ') || '—'}</p>
                    </div>
                  </div>
                </div>
                <div
                  className="rounded-lg p-4"
                  style={{ background: t2Won ? 'var(--green-muted)' : 'var(--surface-sub)' }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-(--text-dim) mb-2">
                    {game.team2} · Red
                  </p>
                  <div className="space-y-2">
                    <div>
                      <p className="text-[10px] text-(--text-dim) mb-0.5">Picks</p>
                      <p className="text-xs text-(--text-h)">{game.team2_picks.map(c => c.name).join(', ') || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-(--text-dim) mb-0.5">Bans</p>
                      <p className="text-xs text-(--text)">{game.team2_bans.map(c => c.name).join(', ') || '—'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Scoreboard */}
              {game.performances.length > 0 && (() => {
                const sides = [
                  { name: game.team1, players: game.performances.filter(p => p.side === 1) },
                  { name: game.team2, players: game.performances.filter(p => p.side === 2) },
                ];
                return (
                  <div>
                    <div className="h-px bg-(--border) mb-4" />
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="text-(--text-dim)">
                          <th className="text-left pb-2 font-medium">Player</th>
                          <th className="text-left pb-2 font-medium">Champion</th>
                          <th className="text-right pb-2 font-medium">K/D/A</th>
                          <th className="text-right pb-2 font-medium">CS</th>
                          <th className="text-right pb-2 font-medium">Gold</th>
                          <th className="text-right pb-2 font-medium">Dmg</th>
                        </tr>
                      </thead>
                      {sides.map(({ name, players }) => (
                        <tbody key={name}>
                          <tr>
                            <td colSpan={6} className="pt-3 pb-1">
                              <span className="text-[10px] font-semibold uppercase tracking-widest text-(--text-dim)">
                                {name}
                              </span>
                            </td>
                          </tr>
                          {players.map((p) => (
                            <tr key={p.id} className="border-b border-(--border) last:border-0">
                              <td className="py-1.5 pr-2">
                                <span className="font-medium text-(--text-h)">{p.name}</span>
                                <span className="text-(--text-dim) ml-1">({p.role})</span>
                              </td>
                              <td className="py-1.5 pr-2 text-(--text)">{p.champion?.name ?? '—'}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums font-medium text-(--text-h)">
                                {p.kills}/{p.deaths}/{p.assists}
                              </td>
                              <td className="py-1.5 pr-2 text-right tabular-nums text-(--text)">{p.cs}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums text-(--text)">
                                {(p.gold / 1000).toFixed(1)}k
                              </td>
                              <td className="py-1.5 text-right tabular-nums text-(--text)">
                                {(p.damage_to_champions / 1000).toFixed(1)}k
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      ))}
                    </table>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: match, loading, error } = useDetail<MatchDetail>(getMatch, Number(id));
  const [teamLogos, setTeamLogos] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!match) return;
    getEventRosters(match.event.id).then((res) => {
      const logos: Record<string, string | null> = {};
      for (const r of res.data.results) {
        if (!r.name) continue;
        logos[r.name] = r.org?.logo ?? null;
      }
      setTeamLogos(logos);
    }).catch(() => {});
  }, [match?.event.id]);

  if (loading) return <Spinner />;
  if (error || !match) return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <p className="text-sm text-red-400">{error ?? 'Not found'}</p>
    </div>
  );

  const played = match.winner !== null;
  const date = match.datetime_utc
    ? new Date(match.datetime_utc).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  const league = match.event.league;

  const metaParts = [
    match.event.name,
    `Bo${match.best_of}`,
    match.tab || null,
    date,
    match.patch ? `Patch ${match.patch}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">

      {/* ── Header card ── */}
      <div className="card overflow-hidden mb-4">

        {/* Score row */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 px-10 py-6">

          {/* Team 1 */}
          <Link
            to={`/teams/${encodeURIComponent(match.team1)}`}
            className="flex items-center gap-4 hover:opacity-80 transition-opacity"
          >
            <TeamLogo name={match.team1} logo={teamLogos[match.team1]} size="lg" />
            <span className="text-2xl font-bold text-(--text-h)">{match.team1}</span>
          </Link>

          {/* Score / vs */}
          <div className="flex items-center gap-4 justify-center min-w-24">
            {played ? (
              <>
                <span className={`text-4xl font-bold tabular-nums ${match.winner === 1 ? 'text-(--text-h)' : 'text-(--text-dim)'}`}>
                  {match.team1_score}
                </span>
                <span className="text-xl text-(--text-dim) font-light">—</span>
                <span className={`text-4xl font-bold tabular-nums ${match.winner === 2 ? 'text-(--text-h)' : 'text-(--text-dim)'}`}>
                  {match.team2_score}
                </span>
              </>
            ) : (
              <span className="text-sm font-medium text-(--text-dim) tracking-widest uppercase">vs</span>
            )}
          </div>

          {/* Team 2 */}
          <Link
            to={`/teams/${encodeURIComponent(match.team2)}`}
            className="flex items-center gap-4 justify-end flex-row-reverse hover:opacity-80 transition-opacity"
          >
            <TeamLogo name={match.team2} logo={teamLogos[match.team2]} size="lg" />
            <span className="text-2xl font-bold text-(--text-h)">{match.team2}</span>
          </Link>
        </div>

        {/* Meta strip */}
        <div className="border-t border-(--border) px-10 py-3 flex items-center gap-2">
          {league.logo && (
            <img src={league.logo} alt={league.short_name ?? league.name} className="logo-themed w-4 h-4 object-contain shrink-0" />
          )}
          {metaParts.map((part, i) => (
            <span key={i} className={`text-xs ${i === 0 ? 'text-(--text)' : 'text-(--text-dim)'}`}>
              {i > 0 && <span className="mr-2 opacity-40">·</span>}
              {part}
            </span>
          ))}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-(--border) flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-(--text-h)">Games</h2>
          <span className="text-xs text-(--text-dim)">({match.games.length})</span>
        </div>
        {match.games.map((g) => (
          <GameCard key={g.id} gameId={g.id} gameNumber={g.game_number} />
        ))}
      </div>

    </div>
  );
}
