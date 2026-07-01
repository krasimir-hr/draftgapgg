import { useLoaderData, useParams, useSearchParams, redirect, type LoaderFunctionArgs } from 'react-router-dom';
import { useState } from 'react';
import { getTeamProfile } from '../api/core';
import type {
  TeamProfile,
  TeamProfileChampion,
  TeamProfileMatch,
  TeamProfilePlayer,
  TeamProfileRosterPlayer,
  TeamProfileStats,
} from '../types/models';
import { useDrawer } from '../contexts/DrawerContext';
import { RoleIcon } from '../components/league/shared';
import { ChampionIcon } from '../components/ChampionIcon';
import EsportsLayout from '../components/EsportsLayout';
import { SideRail } from '../components/Sidebar';

export async function teamLoader({ params, request }: LoaderFunctionArgs): Promise<TeamProfile> {
  const url = new URL(request.url);
  const year = url.searchParams.get('year');
  const event = url.searchParams.get('event');

  const apiParams: Record<string, string> = {};
  if (year) apiParams.year = year;
  if (event) apiParams.event = event;

  const data = (await getTeamProfile(params.name!, apiParams)).data;

  if (!year && data.available_years.length > 0) {
    const latest = String(Math.max(...data.available_years));
    url.searchParams.set('year', latest);
    throw redirect(url.toString());
  }

  return data;
}

type Tab = 'Overview' | 'Roster' | 'Champions' | 'Matches';

/* ─── shared primitives ─────────────────────────────────────── */

const SECTION = 'text-(--text-dim) uppercase font-semibold';
const sectionStyle = { fontSize: 10.5, letterSpacing: '0.1em' } as const;

/** Country name → ISO-3166 alpha-2, for turning nationalities into flag emoji. */
const COUNTRY_ISO: Record<string, string> = {
  'South Korea': 'KR', 'Brazil': 'BR', 'China': 'CN', 'Argentina': 'AR', 'Taiwan': 'TW',
  'Vietnam': 'VN', 'France': 'FR', 'Sweden': 'SE', 'Greece': 'GR', 'United States': 'US',
  'Australia': 'AU', 'Hong Kong': 'HK', 'Portugal': 'PT', 'Singapore': 'SG', 'Belgium': 'BE',
  'Slovenia': 'SI', 'Germany': 'DE', 'Denmark': 'DK', 'Canada': 'CA', 'Poland': 'PL',
  'Colombia': 'CO', 'Peru': 'PE', 'Turkey': 'TR', 'Chile': 'CL', 'Venezuela': 'VE',
  'Spain': 'ES', 'United Kingdom': 'GB', 'Netherlands': 'NL', 'Norway': 'NO', 'Finland': 'FI',
  'Japan': 'JP', 'Philippines': 'PH', 'Thailand': 'TH', 'Malaysia': 'MY', 'Indonesia': 'ID',
  'Russia': 'RU', 'Ukraine': 'UA', 'Mexico': 'MX', 'Italy': 'IT', 'Romania': 'RO',
  'Czech Republic': 'CZ', 'Czechia': 'CZ', 'Bulgaria': 'BG', 'Croatia': 'HR', 'Serbia': 'RS',
  'Hungary': 'HU', 'Austria': 'AT', 'Switzerland': 'CH', 'Ireland': 'IE', 'New Zealand': 'NZ',
};

/** Small flag chip from a nationality name; falls back to the raw text if unmapped. */
function Flag({ nationality }: { nationality: string }) {
  const iso = COUNTRY_ISO[nationality];
  const emoji = iso ? iso.replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0))) : null;
  return (
    <span className="inline-flex items-center gap-1 text-(--text-dim)" title={nationality} style={{ fontSize: 10.5 }}>
      {emoji ? <span style={{ fontSize: 13, lineHeight: 1 }}>{emoji}</span> : null}
      {iso ?? nationality}
    </span>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, ...style }}>
      {children}
    </div>
  );
}

/** Slim monochrome progress track. Single muted accent fill — no win/loss tinting. */
function Meter({ pct, width = '100%' }: { pct: number; width?: number | string }) {
  return (
    <div style={{ width, height: 4, borderRadius: 99, background: 'var(--surface-sub)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`, background: 'var(--accent)', opacity: 0.55 }} />
    </div>
  );
}

/** Minimal ring, accent only, value centred. */
function Ring({ pct, size = 64, stroke = 5, children }: { pct: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const cx = size / 2;
  const r = cx - stroke / 2 - 1;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(1, Math.max(0, pct / 100)) * circ;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ display: 'block' }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--surface-sub)" strokeWidth={stroke} />
        <circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke="var(--accent)" strokeWidth={stroke}
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`} opacity={0.85}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        {children}
      </div>
    </div>
  );
}

/** Small W/L tag — the only place colour carries meaning. */
function ResultTag({ won }: { won: boolean | null }) {
  if (won === null) return <span className="text-(--text-dim) font-semibold" style={{ fontSize: 11 }}>—</span>;
  const c = won ? 'var(--green)' : 'var(--red)';
  const bg = won ? 'var(--green-muted)' : 'var(--red-muted)';
  return (
    <span className="font-bold inline-flex items-center justify-center" style={{ width: 18, height: 18, borderRadius: 5, fontSize: 10.5, color: c, background: bg }}>
      {won ? 'W' : 'L'}
    </span>
  );
}

/* ─── Overview ─────────────────────────────────────────────── */

function Headline({ stats }: { stats: TeamProfileStats }) {
  const wr = stats.match_win_rate ?? 0;
  return (
    <Card style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', alignItems: 'center' }}>
      {/* Match win rate ring */}
      <div className="flex items-center gap-3" style={{ padding: '18px 22px', borderRight: '1px solid var(--border)' }}>
        <Ring pct={wr} size={62} stroke={5}>
          <span className="tabular-nums font-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-h)' }}>
            {stats.match_win_rate != null ? `${wr.toFixed(0)}%` : '—'}
          </span>
        </Ring>
        <div>
          <div className={SECTION} style={sectionStyle}>Match win rate</div>
          <div className="tabular-nums" style={{ fontSize: 12.5, color: 'var(--text)', marginTop: 4 }}>
            {stats.match_wins}<span className="text-(--text-faint)">W</span> · {stats.match_losses}<span className="text-(--text-faint)">L</span>
          </div>
        </div>
      </div>

      <HeadlineCell
        label="Game win rate"
        value={stats.game_win_rate != null ? `${stats.game_win_rate.toFixed(0)}%` : '—'}
        sub={`${stats.game_wins}W ${stats.game_losses}L`}
      />
      <HeadlineCell label="Games" value={String(stats.games)} sub="this selection" border />
      <HeadlineCell label="Avg game time" value={stats.avg_game_length ?? '—'} sub={`${stats.matches} matches`} border />
    </Card>
  );
}

function HeadlineCell({ label, value, sub, border }: { label: string; value: string; sub: string; border?: boolean }) {
  return (
    <div style={{ padding: '18px 22px', borderLeft: border ? '1px solid var(--border)' : undefined }}>
      <div className={SECTION} style={sectionStyle}>{label}</div>
      <div className="tabular-nums font-display" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-h)', lineHeight: 1, margin: '6px 0 4px' }}>{value}</div>
      <div className="text-(--text-dim) tabular-nums" style={{ fontSize: 11 }}>{sub}</div>
    </div>
  );
}

function PerformanceList({ stats }: { stats: TeamProfileStats }) {
  const killDiff = stats.avg_kills_for - stats.avg_kills_against;
  const rows: { label: string; value: string }[] = [
    { label: 'Match record', value: `${stats.match_wins}–${stats.match_losses}` },
    { label: 'Game record', value: `${stats.game_wins}–${stats.game_losses}` },
    { label: 'Kills per game', value: stats.avg_kills_for.toFixed(1) },
    { label: 'Kills conceded per game', value: stats.avg_kills_against.toFixed(1) },
    { label: 'Kill differential', value: `${killDiff >= 0 ? '+' : ''}${killDiff.toFixed(1)}` },
    { label: 'Average game length', value: stats.avg_game_length ?? '—' },
  ];

  return (
    <div>
      <h3 className="section-label" style={{ marginBottom: 10 }}>Season performance</h3>
      <Card>
        {rows.map((r, i) => (
          <div
            key={r.label}
            className="flex items-center justify-between"
            style={{ padding: '12px 16px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
          >
            <span className="text-(--text)" style={{ fontSize: 12.5 }}>{r.label}</span>
            <span className="tabular-nums font-semibold text-(--text-h)" style={{ fontSize: 13 }}>{r.value}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Objectives({ stats }: { stats: TeamProfileStats }) {
  const cells: { label: string; value: string }[] = [
    { label: 'Dragons / game', value: stats.avg_dragons.toFixed(1) },
    { label: 'Barons / game', value: stats.avg_barons.toFixed(1) },
    { label: 'Towers / game', value: stats.avg_towers.toFixed(1) },
  ];
  return (
    <div>
      <h3 className="section-label" style={{ marginBottom: 10 }}>Objectives</h3>
      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}
      >
        {cells.map((c) => (
          <div key={c.label} style={{ background: 'var(--surface)', padding: '14px 16px' }}>
            <div className={SECTION} style={{ fontSize: 9.5, letterSpacing: '0.08em', marginBottom: 4 }}>{c.label}</div>
            <div className="font-display tabular-nums" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-h)', lineHeight: 1.1 }}>{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Players ───────────────────────────────────────────────── */

function PlayerRoster({ players, teamColor, logo }: { players: TeamProfilePlayer[]; teamColor: string; logo: string | null }) {
  const { openPlayer } = useDrawer();
  return (
    <div style={{ marginTop: 22 }}>
      <h3 className="section-label" style={{ marginBottom: 10 }}>Players</h3>
      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(184px, 1fr))', gap: 12 }}
      >
        {players.map((p) => (
          <PlayerCard key={`${p.name}-${p.role}`} p={p} teamColor={teamColor} logo={logo} onClick={() => openPlayer(p.name)} />
        ))}
      </div>
    </div>
  );
}

function PlayerCard({ p, teamColor, logo, onClick }: { p: TeamProfilePlayer; teamColor: string; logo: string | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card card-link relative overflow-hidden text-left"
      style={{ padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}
    >
      {/* Fleeting team logo — large, faint watermark bleeding off the corner. */}
      {logo ? (
        <img
          src={logo}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className="pointer-events-none select-none object-contain"
          style={{ position: 'absolute', right: -26, bottom: -26, width: 132, height: 132, opacity: 0.07 }}
        />
      ) : (
        <span
          aria-hidden
          className="pointer-events-none select-none font-bold"
          style={{ position: 'absolute', right: -8, bottom: -22, fontSize: 76, lineHeight: 1, color: teamColor, opacity: 0.06, fontFamily: 'var(--font-sans)', letterSpacing: '-0.04em' }}
        >
          {p.name.slice(0, 2)}
        </span>
      )}

      <div style={{ position: 'relative' }}>
        {p.image ? (
          <img src={p.image} alt={p.name} width={52} height={52} loading="lazy" decoding="async" className="rounded-lg object-cover object-top" style={{ width: 52, height: 52, border: '1px solid var(--border)' }} />
        ) : (
          <div className="rounded-lg flex items-center justify-center text-white font-bold" style={{ width: 52, height: 52, background: teamColor, fontSize: 19 }}>
            {p.name.charAt(0)}
          </div>
        )}

        <div className="font-semibold text-(--text-h) truncate" style={{ fontSize: 15, marginTop: 12 }}>{p.name}</div>

        <div className="flex items-center gap-2" style={{ marginTop: 5 }}>
          <span className="inline-flex items-center gap-1 text-(--text-dim)" style={{ fontSize: 11 }}>
            <RoleIcon role={p.role} size={13} color="var(--text-dim)" />
            {p.role}
          </span>
          {p.nationality && (
            <>
              <span className="text-(--text-faint)">·</span>
              <Flag nationality={p.nationality} />
            </>
          )}
        </div>

        <div className="flex items-center justify-between" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div>
            <div className={SECTION} style={{ fontSize: 9, letterSpacing: '0.07em' }}>KDA</div>
            <div className="tabular-nums font-semibold text-(--text-h)" style={{ fontSize: 14, marginTop: 1 }}>{p.kda.toFixed(2)}</div>
          </div>
          <div className="text-right">
            <div className={SECTION} style={{ fontSize: 9, letterSpacing: '0.07em' }}>Win rate</div>
            <div className="tabular-nums font-semibold text-(--text-h)" style={{ fontSize: 14, marginTop: 1 }}>
              {p.win_rate != null ? `${p.win_rate.toFixed(0)}%` : '—'}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

/* ─── Champions ─────────────────────────────────────────────── */

function ChampionPool({ champions }: { champions: TeamProfileChampion[] }) {
  return (
    <div>
      <h3 className="section-label" style={{ marginBottom: 10 }}>Most picked champions</h3>
      <Card style={{ overflow: 'hidden' }}>
        <div
          className="grid items-center text-(--text-dim) uppercase font-semibold"
          style={{ gridTemplateColumns: '40px 1fr 56px 56px 150px 56px', gap: 14, padding: '9px 16px', fontSize: 9.5, letterSpacing: '0.07em', borderBottom: '1px solid var(--border)' }}
        >
          <span />
          <span>Champion</span>
          <span className="text-right">Picks</span>
          <span className="text-right">Bans</span>
          <span>Win rate</span>
          <span className="text-right">KDA</span>
        </div>
        {champions.map((c, i) => (
          <ChampionPoolRow key={c.id} c={c} last={i === champions.length - 1} />
        ))}
      </Card>
    </div>
  );
}

function ChampionPoolRow({ c, last }: { c: TeamProfileChampion; last: boolean }) {
  return (
    <div
      className="grid items-center"
      style={{ gridTemplateColumns: '40px 1fr 56px 56px 150px 56px', gap: 14, padding: '11px 16px', borderBottom: last ? 'none' : '1px solid var(--border)' }}
    >
      <ChampionIcon src={c.icon_url} alt={c.name} size={36} />
      <div className="min-w-0">
        <div className="font-semibold text-(--text-h) truncate" style={{ fontSize: 13 }}>{c.name}</div>
        <div className="text-(--text-dim) tabular-nums" style={{ fontSize: 10.5, marginTop: 1 }}>
          {c.picks} {c.picks === 1 ? 'pick' : 'picks'}
        </div>
      </div>
      <div className="text-right tabular-nums text-(--text)" style={{ fontSize: 12.5 }}>{c.picks}</div>
      <div className="text-right tabular-nums text-(--text-dim)" style={{ fontSize: 12.5 }}>{c.bans}</div>
      <div className="flex items-center gap-2.5">
        <Meter pct={c.win_rate ?? 0} />
        <span className="tabular-nums font-semibold text-(--text-h)" style={{ fontSize: 12, minWidth: 30, textAlign: 'right' }}>
          {c.win_rate != null ? `${c.win_rate.toFixed(0)}%` : '—'}
        </span>
      </div>
      <div className="text-right tabular-nums font-semibold text-(--text-h)" style={{ fontSize: 13 }}>
        {c.kda != null ? c.kda.toFixed(2) : '—'}
      </div>
    </div>
  );
}

/* ─── Right siderail ────────────────────────────────────────── */

function UpcomingRailRow({ m, isLast, onClick }: { m: TeamProfileMatch; isLast: boolean; onClick: () => void }) {
  const dt = m.datetime ? new Date(m.datetime) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="match-rail-row w-full flex items-center gap-2.5"
      style={{ padding: '9px 14px', borderBottom: isLast ? 'none' : '1px solid var(--border)', textAlign: 'left' }}
    >
      {m.opponent_logo ? (
        <img src={m.opponent_logo} alt={m.opponent} width={24} height={24} loading="lazy" decoding="async" className="object-contain shrink-0" style={{ width: 24, height: 24 }} />
      ) : (
        <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--surface-sub)', flexShrink: 0 }} />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-(--text-h) font-semibold truncate" style={{ fontSize: 12 }}>vs {m.opponent}</div>
        <div className="text-(--text-dim) truncate" style={{ fontSize: 10, marginTop: 1 }}>
          {dt ? dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'TBD'} · BO{m.best_of}
        </div>
      </div>
    </button>
  );
}

function RecentRailRow({ m, isLast, onClick }: { m: TeamProfileMatch; isLast: boolean; onClick: () => void }) {
  const date = m.datetime ? new Date(m.datetime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
  return (
    <button
      type="button"
      onClick={onClick}
      className="match-rail-row w-full flex items-center gap-2.5"
      style={{ padding: '9px 14px', borderBottom: isLast ? 'none' : '1px solid var(--border)', textAlign: 'left' }}
    >
      <ResultTag won={m.won} />
      {m.opponent_logo ? (
        <img src={m.opponent_logo} alt={m.opponent} width={24} height={24} loading="lazy" decoding="async" className="object-contain shrink-0" style={{ width: 24, height: 24 }} />
      ) : (
        <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--surface-sub)', flexShrink: 0 }} />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-(--text-h) font-semibold truncate" style={{ fontSize: 12 }}>vs {m.opponent}</div>
        <div className="text-(--text-dim) truncate" style={{ fontSize: 10, marginTop: 1 }}>{date}</div>
      </div>
      <div className="tabular-nums font-semibold text-(--text-h) shrink-0" style={{ fontSize: 12.5 }}>
        {m.team_score}<span className="text-(--text-faint)">–</span>{m.opponent_score}
      </div>
    </button>
  );
}

function TeamRail({ upcoming, recent }: { upcoming: TeamProfileMatch[]; recent: TeamProfileMatch[] }) {
  const { openMatch } = useDrawer();
  const recentItems = recent.slice(0, 8);

  return (
    <>
      <SideRail title="Upcoming matches">
        {upcoming.length === 0 ? (
          <div className="text-(--text-dim) text-center" style={{ padding: '12px 14px', fontSize: 12.5 }}>No upcoming matches</div>
        ) : (
          upcoming.map((m, i) => (
            <UpcomingRailRow key={m.match_id} m={m} isLast={i === upcoming.length - 1} onClick={() => openMatch(m.match_id)} />
          ))
        )}
      </SideRail>

      <SideRail title="Recent results">
        {recentItems.length === 0 ? (
          <div className="text-(--text-dim) text-center" style={{ padding: '12px 14px', fontSize: 12.5 }}>No recent matches</div>
        ) : (
          recentItems.map((m, i) => (
            <RecentRailRow key={m.match_id} m={m} isLast={i === recentItems.length - 1} onClick={() => openMatch(m.match_id)} />
          ))
        )}
      </SideRail>
    </>
  );
}

/* ─── Roster tab ────────────────────────────────────────────── */

function RosterTab({ roster, players, teamColor }: { roster: TeamProfileRosterPlayer[]; players: TeamProfilePlayer[]; teamColor: string }) {
  const { openPlayer } = useDrawer();
  const playerStats = new Map<string, TeamProfilePlayer>(players.map((p) => [p.name, p]));
  const starters = roster.filter((r) => r.role !== 'Coach');

  if (starters.length === 0) {
    return <p className="text-(--text-dim)" style={{ marginTop: 10, fontSize: 13 }}>No roster on record.</p>;
  }

  return (
    <Card style={{ overflow: 'hidden', marginTop: 10 }}>
      {starters.map((r, i) => {
        const ps = playerStats.get(r.name);
        return (
          <button
            type="button"
            key={`${r.player_id}-${r.role}`}
            onClick={() => openPlayer(r.name)}
            className="grid items-center w-full text-left transition-colors hover:bg-(--surface-sub)"
            style={{ gridTemplateColumns: '44px 1fr auto', gap: 14, padding: '12px 16px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
          >
            {r.image ? (
              <img src={r.image} alt={r.name} width={40} height={40} loading="lazy" decoding="async" className="rounded object-cover object-top" style={{ width: 40, height: 40 }} />
            ) : (
              <div className="rounded flex items-center justify-center text-white font-bold" style={{ width: 40, height: 40, background: teamColor, fontSize: 15 }}>
                {r.name.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <div className="font-semibold text-(--text-h) truncate" style={{ fontSize: 13.5 }}>{r.name}</div>
              <div className="flex items-center gap-1.5 text-(--text-dim)" style={{ fontSize: 11, marginTop: 3 }}>
                <RoleIcon role={r.role} size={12} color="var(--text-dim)" />
                {r.role}
                {r.nationality && <span className="text-(--text-faint)">· {r.nationality}</span>}
                {!r.is_starter && <span className="badge badge-neutral" style={{ marginLeft: 2 }}>Sub</span>}
              </div>
            </div>
            {ps && (
              <div className="text-right tabular-nums text-(--text-dim)" style={{ fontSize: 11 }}>
                <div>KDA <b className="text-(--text-h)">{ps.kda.toFixed(2)}</b></div>
                <div style={{ marginTop: 2 }}>{ps.avg_kills}/{ps.avg_deaths}/{ps.avg_assists} · {ps.games} GP</div>
              </div>
            )}
          </button>
        );
      })}
    </Card>
  );
}

/* ─── Matches tab ───────────────────────────────────────────── */

function MatchRow({ m, last }: { m: TeamProfileMatch; last: boolean }) {
  const { openMatch } = useDrawer();
  const date = m.datetime ? new Date(m.datetime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';

  return (
    <button
      type="button"
      onClick={() => openMatch(m.match_id)}
      className="w-full flex items-center gap-3 transition-colors hover:bg-(--surface-sub)"
      style={{ padding: '11px 16px', borderBottom: last ? 'none' : '1px solid var(--border)', textAlign: 'left', fontSize: 12.5 }}
    >
      <ResultTag won={m.won} />
      {m.opponent_logo ? (
        <img src={m.opponent_logo} alt={m.opponent} width={30} height={30} loading="lazy" decoding="async" className="object-contain shrink-0" style={{ width: 30, height: 30 }} />
      ) : (
        <div style={{ width: 30, height: 30, borderRadius: 6, background: 'var(--surface-sub)', flexShrink: 0 }} />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-(--text-h) font-semibold truncate" style={{ fontSize: 12.5 }}>vs {m.opponent}</div>
        <div className="text-(--text-dim) truncate" style={{ fontSize: 10.5 }}>{date} · {m.event}</div>
      </div>
      <div className="text-right shrink-0 tabular-nums">
        <div className="font-bold text-(--text-h)" style={{ fontSize: 14 }}>
          {m.team_score}<span className="text-(--text-faint)">–</span>{m.opponent_score}
        </div>
        <div className="text-(--text-dim)" style={{ fontSize: 10.5, marginTop: 1 }}>BO{m.best_of}</div>
      </div>
    </button>
  );
}

/* ─── Page ──────────────────────────────────────────────────── */

export default function TeamDetailPage() {
  const { name } = useParams<{ name: string }>();
  return <TeamDetailView key={name} />;
}

function TeamDetailView() {
  const data = useLoaderData() as TeamProfile;
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>('Overview');

  const { team, current_event, current_roster, stats, top_players, top_champions, recent_matches, available_years, available_events } = data;
  const teamColor = team.color || 'var(--accent)';

  const played = recent_matches.filter((m) => m.won !== null);
  const upcoming = recent_matches
    .filter((m) => m.won === null)
    .sort((a, b) => (a.datetime ?? '').localeCompare(b.datetime ?? ''));
  const lastFive = played.slice(0, 5).map((m) => (m.won ? 'W' : 'L'));

  const selectedYear = searchParams.get('year') ? Number(searchParams.get('year')) : null;
  const selectedEvent = searchParams.get('event') ? Number(searchParams.get('event')) : null;

  function handleYearChange(year: string) {
    const next = new URLSearchParams();
    if (year) next.set('year', year);
    setSearchParams(next);
  }

  function handleEventChange(eventId: string) {
    const next = new URLSearchParams(searchParams);
    if (eventId) next.set('event', eventId);
    else next.delete('event');
    setSearchParams(next);
  }

  const tabs: Tab[] = ['Overview', 'Roster', 'Champions', 'Matches'];

  return (
    <EsportsLayout right={<TeamRail upcoming={upcoming} recent={played} />}>
      {/* Hero card */}
      <div
        className="card card-xl card-soft-shadow overflow-hidden"
        style={{ borderRadius: 16 }}
      >
        <div className="flex gap-6 px-7 pt-7 pb-1" style={{ alignItems: 'center' }}>
          <div
            className="shrink-0 flex items-center justify-center overflow-hidden"
            style={{ width: 96, height: 96, borderRadius: 18, background: team.logo ? 'var(--surface)' : teamColor, border: team.logo ? '1px solid var(--border)' : 'none' }}
          >
            {team.logo ? (
              <img src={team.logo} alt={team.name} decoding="async" fetchPriority="high" className="max-w-full max-h-full object-contain" style={{ padding: 12 }} />
            ) : (
              <span className="text-white font-bold" style={{ fontFamily: 'var(--font-sans)', fontSize: 30, letterSpacing: '-0.03em' }}>
                {team.short_name.slice(0, 3)}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="h-display" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}>
              {team.name}
            </h1>

            <div className="flex items-center flex-wrap gap-2.5" style={{ marginTop: 8 }}>
              <span className="font-display tabular-nums" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-h)' }}>
                {stats.match_wins}<span className="text-(--text-dim)">–</span>{stats.match_losses}
              </span>
              {team.region && <span className="badge badge-accent">{team.region}</span>}
              {current_event && (
                <span className="text-(--text-dim)" style={{ fontSize: 12 }}>
                  {current_event.league}{current_event.year ? ` · ${current_event.year}` : ''}
                </span>
              )}
              {lastFive.length > 0 && (
                <span className="inline-flex gap-1">
                  {lastFive.map((c, i) => (
                    <span
                      key={i}
                      className="form-chip"
                      style={{ background: c === 'W' ? 'var(--green-muted)' : 'var(--red-muted)', color: c === 'W' ? 'var(--green)' : 'var(--red)' }}
                    >
                      {c}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar + year/event selects */}
        <div className="flex items-center border-t border-(--border)" style={{ padding: '0 14px', marginTop: 12 }}>
          <div className="flex" style={{ flex: 1 }}>
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTab(t)}
                className={`section-tab${t === activeTab ? ' active' : ''}`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {available_years.length > 0 && (
              <select className="field-select" value={selectedYear ?? ''} onChange={(e) => handleYearChange(e.target.value)}>
                {available_years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            {available_events.length > 0 && (
              <select className="field-select" value={selectedEvent ?? ''} onChange={(e) => handleEventChange(e.target.value)}>
                <option value="">All events</option>
                {available_events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ marginTop: 22 }}>
        {activeTab === 'Overview' && (
          <>
            <Headline stats={stats} />
            <div
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 22, marginTop: 22, alignItems: 'start' }}
            >
              <PerformanceList stats={stats} />
              <Objectives stats={stats} />
            </div>
            {top_players.length > 0 && <PlayerRoster players={top_players} teamColor={teamColor} logo={team.logo} />}
          </>
        )}

        {activeTab === 'Roster' && (
          <>
            <h3 className="section-label">Current roster</h3>
            <RosterTab roster={current_roster} players={top_players} teamColor={teamColor} />
          </>
        )}

        {activeTab === 'Champions' && (
          top_champions.length > 0 ? (
            <ChampionPool champions={top_champions} />
          ) : (
            <p className="text-(--text-dim)" style={{ marginTop: 10, fontSize: 13 }}>No champion data for this selection.</p>
          )
        )}

        {activeTab === 'Matches' && (
          <>
            <h3 className="section-label">Recent matches</h3>
            {played.length > 0 ? (
              <Card style={{ overflow: 'hidden', marginTop: 10 }}>
                {played.map((m, i) => (
                  <MatchRow key={m.match_id} m={m} last={i === played.length - 1} />
                ))}
              </Card>
            ) : (
              <p className="text-(--text-dim)" style={{ marginTop: 10, fontSize: 13 }}>No matches found.</p>
            )}
          </>
        )}
      </div>
    </EsportsLayout>
  );
}
