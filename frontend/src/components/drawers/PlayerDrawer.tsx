import { useEffect, useReducer } from 'react';
import { getPlayerProfile } from '../../api/core';
import type {
  PlayerProfile,
  PlayerProfileChampion,
  PlayerProfileGame,
  PlayerProfileStats,
} from '../../types/models';
import { useDrawer } from '../../contexts/DrawerContext';
import { RoleChip } from '../league/shared';
import { ChampionIcon } from '../ChampionIcon';

const COUNTRY_CODES: Record<string, string> = {
  'Argentina': 'AR', 'Australia': 'AU', 'Belgium': 'BE', 'Brazil': 'BR',
  'Bulgaria': 'BG', 'Canada': 'CA', 'Chile': 'CL', 'China': 'CN',
  'Colombia': 'CO', 'Costa Rica': 'CR', 'Croatia': 'HR', 'Czech Republic': 'CZ',
  'Denmark': 'DK', 'El Salvador': 'SV', 'France': 'FR', 'Germany': 'DE',
  'Greece': 'GR', 'Hong Kong': 'HK', 'Iran': 'IR', 'Italy': 'IT',
  'Japan': 'JP', 'Lithuania': 'LT', 'Malaysia': 'MY', 'Mexico': 'MX',
  'Mongolia': 'MN', 'New Zealand': 'NZ', 'Norway': 'NO', 'Peru': 'PE',
  'Philippines': 'PH', 'Poland': 'PL', 'Portugal': 'PT', 'Romania': 'RO',
  'Serbia': 'RS', 'Singapore': 'SG', 'Slovenia': 'SI', 'South Korea': 'KR',
  'Spain': 'ES', 'Sweden': 'SE', 'Taiwan': 'TW', 'Turkey': 'TR',
  'Ukraine': 'UA', 'United Kingdom': 'GB', 'United States': 'US',
  'Uruguay': 'UY', 'Venezuela': 'VE', 'Vietnam': 'VN',
};

function flagEmoji(nationality: string | null): string {
  if (!nationality) return '';
  const code = COUNTRY_CODES[nationality];
  if (!code) return '';
  return [...code].map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))).join('');
}

interface State {
  loading: boolean;
  error: string | null;
  data: PlayerProfile | null;
}
type Action =
  | { type: 'fetch' }
  | { type: 'success'; data: PlayerProfile }
  | { type: 'error'; message: string };
function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'fetch':   return { ...s, loading: true, error: null };
    case 'success': return { loading: false, error: null, data: a.data };
    case 'error':   return { ...s, loading: false, error: a.message };
  }
}

function WinRateBar({ wr, width = 70 }: { wr: number; width?: number }) {
  return (
    <div className="inline-flex items-center gap-2">
      <div
        style={{
          width,
          height: 5,
          borderRadius: 999,
          background: 'var(--surface-sub)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${Math.min(100, Math.max(0, wr))}%`,
            background: wr >= 55 ? 'var(--green)' : wr <= 45 ? 'var(--red)' : 'var(--accent)',
            opacity: 0.75,
          }}
        />
      </div>
      <span
        className="tabular-nums"
        style={{ fontSize: 11.5, color: 'var(--text-h)', fontWeight: 600, minWidth: 32, textAlign: 'right' }}
      >
        {wr.toFixed(0)}%
      </span>
    </div>
  );
}

interface Props { name: string; }

export default function PlayerDrawer({ name }: Props) {
  const { openTeam } = useDrawer();
  const [state, dispatch] = useReducer(reducer, { loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'fetch' });
    getPlayerProfile(name, {})
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
        <p className="text-sm" style={{ color: 'var(--red)' }}>{state.error ?? 'Player not found'}</p>
      </div>
    );
  }

  const { player, current_team, current_role, stats, best_champions, recent_games } = state.data;
  const flag = flagEmoji(player.nationality);
  const portraitSrc = player.image || player.leaguepedia_image;
  const teamColor = current_team?.color || 'var(--accent)';

  return (
    <>
      {/* Header */}
      <div
        style={{
          position: 'relative',
          padding: '24px 28px 20px',
          background: `linear-gradient(180deg, color-mix(in srgb, ${teamColor} 14%, transparent) 0%, transparent 100%)`,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          className="font-semibold uppercase text-(--text-dim)"
          style={{ fontSize: 10.5, letterSpacing: '0.12em', marginBottom: 6 }}
        >
          Player profile
        </div>

        <div className="flex items-center gap-4" style={{ marginBottom: 14 }}>
          <div
            className="shrink-0 overflow-hidden"
            style={{
              width: 64, height: 64, borderRadius: 10,
              boxSizing: 'border-box',
              border: '1px solid var(--accent-border)',
              boxShadow: 'var(--shadow-md)',
              background: 'linear-gradient(160deg, #1e1830 0%, #0e0c18 100%)',
            }}
          >
            {portraitSrc ? (
              <img src={portraitSrc} alt={player.name} className="w-full h-full object-cover object-top" />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-2xl font-bold text-white"
                style={{ background: 'var(--accent)' }}
              >
                {player.name.charAt(0)}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h1
              className="font-display flex items-baseline gap-2.5"
              style={{
                fontSize: 36,
                fontWeight: 700,
                color: 'var(--text-h)',
                letterSpacing: '-0.025em',
                lineHeight: 1,
              }}
            >
              <span className="truncate">{player.name}</span>
              {flag && <span style={{ fontSize: 22, lineHeight: 1 }}>{flag}</span>}
            </h1>
            {player.real_name && (
              <div className="text-(--text)" style={{ fontSize: 13, marginTop: 4 }}>{player.real_name}</div>
            )}
            <div className="flex items-center gap-2.5" style={{ marginTop: 8 }}>
              {current_role && <RoleChip role={current_role} />}
              {player.nationality && (
                <span className="text-(--text-dim)" style={{ fontSize: 11.5 }}>· {player.nationality}</span>
              )}
              {player.age && (
                <span className="text-(--text-dim)" style={{ fontSize: 11.5 }}>· Age {player.age}</span>
              )}
            </div>
          </div>
        </div>

        {current_team && (
          <button
            type="button"
            onClick={() => openTeam(current_team.name)}
            className="w-full flex items-center gap-3 transition-colors hover:bg-(--surface-hover)"
            style={{
              padding: '10px 12px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              textAlign: 'left',
            }}
          >
            {current_team.logo ? (
              <div className="w-9 h-9 shrink-0 flex items-center justify-center overflow-hidden">
                <img src={current_team.logo} alt={current_team.name} className="max-w-full max-h-full object-contain" />
              </div>
            ) : (
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ background: current_team.color || 'var(--accent)' }}
              >
                {current_team.short_name.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div
                className="font-semibold uppercase text-(--text-dim)"
                style={{ fontSize: 9.5, letterSpacing: '0.1em' }}
              >
                Current team
              </div>
              <div className="text-(--text-h) font-semibold truncate" style={{ fontSize: 14, marginTop: 1 }}>
                {current_team.name}
              </div>
            </div>
            <span style={{ color: 'var(--accent-2)', fontSize: 11.5, fontWeight: 600 }}>View team →</span>
          </button>
        )}
      </div>

      {/* Stat grid */}
      <div style={{ padding: '20px 24px 4px' }}>
        <h3 className="drawer-section-label">Performance</h3>
        <StatGrid stats={stats} />
      </div>

      {/* Champions */}
      {best_champions.length > 0 && (
        <div style={{ padding: '14px 24px 8px' }}>
          <h3 className="drawer-section-label">Champions played</h3>
          <div
            style={{
              marginTop: 10,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            {best_champions.slice(0, 6).map((c, i) => (
              <ChampionRow key={c.id} c={c} last={i === Math.min(best_champions.length, 6) - 1} />
            ))}
          </div>
        </div>
      )}

      {/* Recent games */}
      {recent_games.length > 0 && (
        <div style={{ padding: '14px 24px 24px' }}>
          <h3 className="drawer-section-label">Recent games</h3>
          <div
            style={{
              marginTop: 10,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            {recent_games.slice(0, 8).map((g, i) => (
              <GameRow key={g.game_id} g={g} last={i === Math.min(recent_games.length, 8) - 1} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function StatGrid({ stats }: { stats: PlayerProfileStats }) {
  const cells: { label: string; value: string; sub?: string; color?: string }[] = [
    { label: 'Games', value: String(stats.games) },
    {
      label: 'Win rate',
      value: stats.win_rate != null ? `${stats.win_rate.toFixed(1)}%` : '—',
      sub: `${stats.wins}W ${stats.losses}L`,
      color:
        stats.win_rate != null && stats.win_rate >= 55 ? 'var(--green)'
        : stats.win_rate != null && stats.win_rate <= 45 ? 'var(--red)'
        : undefined,
    },
    { label: 'KDA', value: stats.kda.toFixed(2), sub: `${stats.avg_kills}/${stats.avg_deaths}/${stats.avg_assists}` },
    { label: 'CS/min', value: stats.avg_cs_per_min != null ? stats.avg_cs_per_min.toFixed(2) : '—' },
    { label: 'Avg gold', value: `${(stats.avg_gold / 1000).toFixed(1)}k` },
    { label: 'Avg dmg', value: `${(stats.avg_damage / 1000).toFixed(1)}k` },
    { label: 'Avg CS', value: String(stats.avg_cs) },
    { label: 'Avg kills', value: stats.avg_kills.toFixed(1) },
  ];

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 1,
        marginTop: 10,
        background: 'var(--border)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      {cells.map((s) => (
        <div key={s.label} style={{ background: 'var(--surface)', padding: '12px 14px' }}>
          <div
            className="text-(--text-dim) uppercase font-semibold"
            style={{ fontSize: 9, letterSpacing: '0.08em', marginBottom: 3 }}
          >
            {s.label}
          </div>
          <div
            className="font-sans tabular-nums"
            style={{
              fontSize: 17, fontWeight: 700,
              color: s.color || 'var(--text-h)',
              lineHeight: 1.1,
            }}
          >
            {s.value}
          </div>
          {s.sub && (
            <div
              className="text-(--text-dim) tabular-nums"
              style={{ fontSize: 10, marginTop: 2 }}
            >
              {s.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ChampionRow({ c, last }: { c: PlayerProfileChampion; last: boolean }) {
  return (
    <div
      className="grid items-center"
      style={{
        gridTemplateColumns: '36px 1fr 50px 110px 60px',
        gap: 10,
        padding: '10px 14px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        fontSize: 12.5,
      }}
    >
      <ChampionIcon src={c.icon_url} alt={c.name} size={32} />
      <div className="font-semibold text-(--text-h) truncate">{c.name}</div>
      <div className="text-(--text) tabular-nums text-right">{c.games}g</div>
      <div className="flex justify-end"><WinRateBar wr={c.win_rate} width={70} /></div>
      <div
        className="tabular-nums text-right font-semibold"
        style={{ color: c.kda >= 4 ? 'var(--green)' : 'var(--text-h)' }}
      >
        {c.kda.toFixed(2)}
      </div>
    </div>
  );
}

function GameRow({ g, last }: { g: PlayerProfileGame; last: boolean }) {
  const { openMatch } = useDrawer();
  const won = g.won === true;
  const lost = g.won === false;
  const stripe = won ? 'var(--green)' : lost ? 'var(--red)' : 'var(--border)';
  const date = g.datetime
    ? new Date(g.datetime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '—';

  return (
    <button
      type="button"
      onClick={() => openMatch(g.match_id)}
      className="w-full flex items-center gap-3 transition-colors hover:bg-(--surface-sub)"
      style={{
        padding: '9px 14px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        textAlign: 'left',
        fontSize: 12.5,
      }}
    >
      <div className="w-0.5 shrink-0" style={{ height: 28, borderRadius: 999, background: stripe }} />
      {g.champion_icon ? (
        <ChampionIcon src={g.champion_icon} alt={g.champion ?? ''} size={28} />
      ) : (
        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--surface-sub)', flexShrink: 0 }} />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-(--text-h) font-semibold truncate" style={{ fontSize: 12.5 }}>
          {g.champion ?? '—'}
          <span className="text-(--text-dim) font-normal ml-2" style={{ fontSize: 10.5 }}>vs {g.opponent}</span>
        </div>
        <div className="text-(--text-dim)" style={{ fontSize: 10.5 }}>{date} · {g.event}</div>
      </div>
      <div className="text-(--text-h) tabular-nums shrink-0 font-semibold" style={{ fontSize: 12.5 }}>
        {g.kills}/<span style={{ color: 'var(--red)' }}>{g.deaths}</span>/{g.assists}
      </div>
    </button>
  );
}
