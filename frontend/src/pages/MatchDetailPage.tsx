import { useParams } from 'react-router-dom';
import { useDetail } from '../hooks/useApi';
import { getMatch } from '../api/core';
import { getGame } from '../api/core';
import type { MatchDetail, GameDetail } from '../types/models';
import { useState, useEffect } from 'react';

function GameCard({ gameId }: { gameId: number }) {
  const [game, setGame] = useState<GameDetail | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || game) return;
    getGame(gameId).then((res) => setGame(res.data));
  }, [open, gameId, game]);

  return (
    <div className="border border-[var(--border)] rounded-lg">
      <button
        className="w-full text-left p-4 font-medium flex justify-between items-center"
        onClick={() => setOpen(!open)}
      >
        <span>Game {game?.game_number ?? '…'}</span>
        <span className="text-sm text-[var(--text)]">{open ? '▲' : '▼'}</span>
      </button>

      {open && game && (
        <div className="p-4 pt-0 space-y-4">
          {/* Draft */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-semibold mb-1">{game.team1} picks</p>
              <p>{game.team1_picks.map((c) => c.name).join(', ') || '—'}</p>
              <p className="mt-1 font-semibold">Bans</p>
              <p>{game.team1_bans.map((c) => c.name).join(', ') || '—'}</p>
            </div>
            <div>
              <p className="font-semibold mb-1">{game.team2} picks</p>
              <p>{game.team2_picks.map((c) => c.name).join(', ') || '—'}</p>
              <p className="mt-1 font-semibold">Bans</p>
              <p>{game.team2_bans.map((c) => c.name).join(', ') || '—'}</p>
            </div>
          </div>

          {/* Scoreboard */}
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-[var(--border)]">
                <th className="py-1">Player</th>
                <th>Champion</th>
                <th>KDA</th>
                <th>CS</th>
                <th>Gold</th>
                <th>Dmg</th>
              </tr>
            </thead>
            <tbody>
              {game.performances.map((p) => (
                <tr key={p.id} className="border-b border-[var(--border)]">
                  <td className="py-1">{p.name} <span className="text-xs text-[var(--text)]">({p.role})</span></td>
                  <td>{p.champion?.name ?? '?'}</td>
                  <td>{p.kills}/{p.deaths}/{p.assists}</td>
                  <td>{p.cs}</td>
                  <td>{(p.gold / 1000).toFixed(1)}k</td>
                  <td>{(p.damage_to_champions / 1000).toFixed(1)}k</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: match, loading, error } = useDetail<MatchDetail>(getMatch, Number(id));

  if (loading) return <p className="p-8 text-center">Loading…</p>;
  if (error || !match) return <p className="p-8 text-red-500">{error ?? 'Not found'}</p>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">{match.team1} vs {match.team2}</h1>
      <p className="text-[var(--text)] mb-6">
        {match.event.name} · Bo{match.best_of}
        {match.winner ? ` · Winner: Team ${match.winner}` : ''}
      </p>

      <div className="space-y-3">
        {match.games.map((g) => (
          <GameCard key={g.id} gameId={g.id} />
        ))}
      </div>
    </div>
  );
}
