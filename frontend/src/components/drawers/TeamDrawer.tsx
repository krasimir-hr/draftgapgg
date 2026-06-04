import { useEffect, useReducer } from 'react';
import { getTeamProfile } from '../../api/core';
import type {
  TeamProfile,
  TeamProfileChampion,
  TeamProfileMatch,
  TeamProfilePlayer,
  TeamProfileStats,
} from '../../types/models';
import { useDrawer } from '../../contexts/DrawerContext';
import { ChampionIcon } from '../ChampionIcon';
import { RoleChip } from '../league/shared';

interface State {
  loading: boolean;
  error: string | null;
  data: TeamProfile | null;
}
type Action =
  | { type: 'fetch' }
  | { type: 'success'; data: TeamProfile }
  | { type: 'error'; message: string };
function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'fetch':   return { ...s, loading: true, error: null };
    case 'success': return { loading: false, error: null, data: a.data };
    case 'error':   return { ...s, loading: false, error: a.message };
  }
}

interface Props { name: string; }

export default function TeamDrawer({ name }: Props) {
  const { openPlayer, openMatch } = useDrawer();
  const [state, dispatch] = useReducer(reducer, { loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'fetch' });
    getTeamProfile(name, {})
      .then((res) => { if (!cancelled) dispatch({ type: 'success', data: res.data }); })
      .catch((err) => { if (!cancelled) dispatch({ type: 'error', message: String(err) }); });
    return () => { cancelled = true; };
  }, [name]);

  if (state.loading) {
    return <div className="flex items-center justify-center" style={{ padding: 80 }}><div className="spinner" /></div>;
  }
  if (state.error || !state.data) {
    return (
      <div style={{ padding: '40px 28px' }}>
        <p className="text-sm" style={{ color: 'var(--red)' }}>{state.error ?? 'Team not found'}</p>
      </div>
    );
  }

  const { team, current_event, current_roster, stats, top_players, top_champions, recent_matches } = state.data;
  const teamColor = team.color || 'var(--accent)';
  const played = recent_matches.filter(m => m.won !== null);
  const upcoming = recent_matches.filter(m => m.won === null)
    .sort((a, b) => (a.datetime ?? '').localeCompare(b.datetime ?? ''));
  const lastFive = played.slice(0, 5).map(m => m.won ? 'W' : 'L');

  // Build roster list — merge starters with their per-player stats
  const rosterStarters = current_roster.filter(r => r.is_starter && r.role !== 'Coach');
  const playerStats = new Map<string, TeamProfilePlayer>(top_players.map(p => [p.name, p]));

  return (
    <>
      {/* Header */}
      <div
        style={{
          position: 'relative',
          padding: '24px 28px 22px',
          background: `linear-gradient(180deg, color-mix(in srgb, ${teamColor} 18%, transparent) 0%, transparent 100%)`,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          className="font-semibold uppercase text-(--text-dim)"
          style={{ fontSize: 10.5, letterSpacing: '0.12em', marginBottom: 8 }}
        >
          {current_event ? `${current_event.league}${current_event.year ? ` · ${current_event.year}` : ''}` : 'Team profile'}
        </div>

        <div className="flex items-center gap-4" style={{ marginBottom: 16 }}>
          <div
            className="shrink-0 flex items-center justify-center overflow-hidden"
            style={{
              width: 72,
              height: 72,
              borderRadius: 14,
              background: team.logo ? 'var(--surface)' : teamColor,
              border: team.logo ? '1px solid var(--border)' : 'none',
            }}
          >
            {team.logo ? (
              <img src={team.logo} alt={team.name} className="max-w-full max-h-full object-contain" style={{ padding: 8 }} />
            ) : (
              <span
                className="text-white font-bold"
                style={{ fontFamily: 'var(--font-sans)', fontSize: 22, letterSpacing: '-0.03em' }}
              >
                {team.short_name.slice(0, 3)}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h1
              className="font-display truncate"
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: 'var(--text-h)',
                letterSpacing: '-0.025em',
                lineHeight: 1,
              }}
            >
              {team.name}
            </h1>
            <div className="flex items-center gap-2.5 flex-wrap" style={{ marginTop: 8 }}>
              <span
                className="font-display tabular-nums"
                style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-h)' }}
              >
                {stats.match_wins}<span style={{ color: 'var(--text-dim)' }}>–</span>{stats.match_losses}
              </span>
              {team.region && <span className="badge badge-accent">{team.region}</span>}
              {lastFive.length > 0 && (
                <span className="inline-flex gap-1">
                  {lastFive.map((c, i) => (
                    <span
                      key={i}
                      className="form-chip"
                      style={{
                        background: c === 'W' ? 'var(--green-muted)' : 'var(--red-muted)',
                        color: c === 'W' ? 'var(--green)' : 'var(--red)',
                      }}
                    >
                      {c}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick stats grid */}
        <QuickStatsGrid stats={stats} />
      </div>

      {/* Roster */}
      {rosterStarters.length > 0 && (
        <div style={{ padding: '22px 24px 8px' }}>
          <h3 className="drawer-section-label">Roster · {rosterStarters.length} players</h3>
          <div
            style={{
              marginTop: 12,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            {rosterStarters.map((p, i) => {
              const ps = playerStats.get(p.name);
              return (
                <button
                  type="button"
                  key={`${p.player_id}-${p.role}`}
                  onClick={() => openPlayer(p.name)}
                  className="w-full transition-colors hover:bg-(--surface-sub)"
                  style={{
                    padding: '11px 16px',
                    borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                    display: 'grid',
                    gridTemplateColumns: '36px minmax(0, 1fr) auto',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'left',
                  }}
                >
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.name}
                      className="rounded object-cover object-top"
                      style={{ width: 36, height: 36 }}
                    />
                  ) : (
                    <div
                      className="rounded flex items-center justify-center text-white font-bold"
                      style={{ width: 36, height: 36, background: teamColor, fontSize: 14 }}
                    >
                      {p.name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-(--text-h) font-semibold" style={{ fontSize: 13.5 }}>
                      {p.name}
                    </div>
                    <div className="flex items-center gap-1.5" style={{ marginTop: 3 }}>
                      <RoleChip role={p.role} size="sm" />
                      {p.nationality && (
                        <span className="text-(--text-dim)" style={{ fontSize: 11 }}>{p.nationality}</span>
                      )}
                    </div>
                  </div>
                  {ps && (
                    <div className="tabular-nums text-(--text-dim) text-right" style={{ fontSize: 11 }}>
                      <div>KDA <b className="text-(--text-h)">{ps.kda.toFixed(2)}</b></div>
                      <div style={{ marginTop: 2 }}>
                        {ps.avg_kills}/{ps.avg_deaths}/{ps.avg_assists}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Statistics */}
      <div style={{ padding: '14px 24px 8px' }}>
        <h3 className="drawer-section-label">Statistics · {stats.games} games</h3>
        <div
          style={{
            marginTop: 12,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '14px 16px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px 24px',
          }}
        >
          <StatLine label="Game win rate" value={stats.game_win_rate != null ? `${stats.game_win_rate}%` : '—'} />
          <StatLine label="Avg game length" value={stats.avg_game_length ?? '—'} />
          <StatLine label="Avg kills" value={stats.avg_kills_for.toFixed(1)} />
          <StatLine label="Avg kills against" value={stats.avg_kills_against.toFixed(1)} />
          <StatLine label="Dragons / game" value={stats.avg_dragons.toFixed(1)} />
          <StatLine label="Barons / game" value={stats.avg_barons.toFixed(1)} />
          <StatLine label="Towers / game" value={stats.avg_towers.toFixed(1)} />
          <StatLine label="Total games" value={String(stats.games)} />
        </div>
      </div>

      {/* Top champions */}
      {top_champions.length > 0 && (
        <div style={{ padding: '14px 24px 8px' }}>
          <h3 className="drawer-section-label">Most picked champions</h3>
          <div
            style={{
              marginTop: 12,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            {top_champions.slice(0, 5).map((c, i) => (
              <ChampionRow key={c.id} c={c} last={i === Math.min(top_champions.length, 5) - 1} />
            ))}
          </div>
        </div>
      )}

      {/* Recent matches */}
      {played.length > 0 && (
        <div style={{ padding: '14px 24px 8px' }}>
          <h3 className="drawer-section-label">Recent matches</h3>
          <div
            style={{
              marginTop: 12,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            {played.slice(0, 5).map((m, i) => (
              <MatchRowRecent
                key={m.match_id}
                m={m}
                last={i === Math.min(played.length, 5) - 1}
                onOpen={() => openMatch(m.match_id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div style={{ padding: '14px 24px 24px' }}>
          <h3 className="drawer-section-label">Upcoming</h3>
          <div
            style={{
              marginTop: 12,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            {upcoming.slice(0, 5).map((m, i) => (
              <MatchRowUpcoming
                key={m.match_id}
                m={m}
                last={i === Math.min(upcoming.length, 5) - 1}
                onOpen={() => openMatch(m.match_id)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function QuickStatsGrid({ stats }: { stats: TeamProfileStats }) {
  const wr = stats.match_win_rate;
  const wrColor = wr == null ? undefined : wr >= 55 ? 'var(--green)' : wr <= 45 ? 'var(--red)' : undefined;
  const cells = [
    { label: 'Win rate', value: wr != null ? `${wr.toFixed(1)}%` : '—', color: wrColor },
    { label: 'Avg kills', value: stats.avg_kills_for.toFixed(1) },
    { label: 'Game WR', value: stats.game_win_rate != null ? `${stats.game_win_rate}%` : '—' },
    { label: 'Avg time', value: stats.avg_game_length ?? '—' },
  ];
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 1,
        background: 'var(--border)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      {cells.map((s) => (
        <div key={s.label} style={{ background: 'var(--surface)', padding: '11px 13px' }}>
          <div
            className="text-(--text-dim) uppercase font-semibold"
            style={{ fontSize: 9, letterSpacing: '0.08em', marginBottom: 3 }}
          >
            {s.label}
          </div>
          <div
            className="font-sans tabular-nums"
            style={{ fontSize: 16, fontWeight: 700, color: s.color || 'var(--text-h)', lineHeight: 1.1 }}
          >
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-(--text-dim)" style={{ fontSize: 12 }}>{label}</span>
      <span
        className="text-(--text-h) font-bold tabular-nums"
        style={{ fontSize: 14 }}
      >
        {value}
      </span>
    </div>
  );
}

function ChampionRow({ c, last }: { c: TeamProfileChampion; last: boolean }) {
  return (
    <div
      className="grid items-center"
      style={{
        gridTemplateColumns: '36px 1fr 50px 60px',
        gap: 10,
        padding: '10px 14px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        fontSize: 12.5,
      }}
    >
      <ChampionIcon src={c.icon_url} alt={c.name} size={32} />
      <div className="font-semibold text-(--text-h) truncate">{c.name}</div>
      <div className="text-(--text) tabular-nums text-right">{c.picks}p</div>
      <div
        className="tabular-nums text-right font-semibold"
        style={{
          color: c.win_rate != null && c.win_rate >= 55 ? 'var(--green)'
            : c.win_rate != null && c.win_rate <= 45 ? 'var(--red)'
            : 'var(--text-h)',
        }}
      >
        {c.win_rate != null ? `${c.win_rate.toFixed(0)}%` : '—'}
      </div>
    </div>
  );
}

function MatchRowRecent({ m, last, onOpen }: { m: TeamProfileMatch; last: boolean; onOpen: () => void }) {
  const won = m.won === true;
  const date = m.datetime
    ? new Date(m.datetime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '—';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full grid items-center transition-colors hover:bg-(--surface-sub)"
      style={{
        padding: '10px 14px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        gridTemplateColumns: '32px auto 1fr auto auto',
        gap: 10,
        textAlign: 'left',
        fontSize: 12.5,
      }}
    >
      <span
        className="text-center tabular-nums font-bold uppercase"
        style={{
          fontSize: 10,
          color: won ? 'var(--green)' : 'var(--red)',
          background: won ? 'var(--green-muted)' : 'var(--red-muted)',
          padding: '2px 6px',
          borderRadius: 4,
          letterSpacing: '0.04em',
        }}
      >
        {won ? 'W' : 'L'}
      </span>
      <span className="text-(--text-dim)" style={{ fontSize: 11 }}>vs</span>
      <div className="flex items-center gap-2 min-w-0">
        {m.opponent_logo && (
          <img src={m.opponent_logo} alt={m.opponent} className="w-5 h-5 object-contain shrink-0" />
        )}
        <span className="text-(--text-h) font-semibold truncate">{m.opponent}</span>
      </div>
      <span
        className="tabular-nums font-bold text-(--text-h)"
        style={{ fontSize: 13, letterSpacing: '-0.005em' }}
      >
        {m.team_score}<span className="text-(--text-faint)">–</span>{m.opponent_score}
      </span>
      <span className="text-(--text-dim) tabular-nums" style={{ fontSize: 10.5 }}>{date}</span>
    </button>
  );
}

function MatchRowUpcoming({ m, last, onOpen }: { m: TeamProfileMatch; last: boolean; onOpen: () => void }) {
  const time = m.datetime
    ? new Date(m.datetime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' +
      new Date(m.datetime).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : 'TBD';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center gap-3 transition-colors hover:bg-(--surface-sub)"
      style={{
        padding: '10px 14px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        textAlign: 'left',
        fontSize: 12.5,
      }}
    >
      <span
        className="text-(--text-dim) tabular-nums shrink-0"
        style={{ fontSize: 11, minWidth: 110 }}
      >
        {time}
      </span>
      <span className="text-(--text-dim)" style={{ fontSize: 11 }}>vs</span>
      {m.opponent_logo && <img src={m.opponent_logo} alt={m.opponent} className="w-5 h-5 object-contain shrink-0" />}
      <span className="text-(--text-h) font-semibold flex-1 min-w-0 truncate">{m.opponent}</span>
      <span
        className="text-(--text-dim) font-bold uppercase shrink-0"
        style={{ fontSize: 10, letterSpacing: '0.06em' }}
      >
        BO{m.best_of}
      </span>
    </button>
  );
}
