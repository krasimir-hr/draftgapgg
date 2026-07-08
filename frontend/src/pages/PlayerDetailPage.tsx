import { useLoaderData, useNavigate, useParams, useSearchParams, redirect, type LoaderFunctionArgs } from 'react-router-dom';
import { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { getPlayerProfile } from '../api/core';
import type {
  PlayerProfile,
  PlayerProfileChampion,
  PlayerProfileGame,
  PlayerProfileStats,
  PlayerProfileUpcomingMatch,
} from '../types/models';
import { useDrawer } from '../contexts/DrawerContext';
import { RoleIcon, TeamMark } from '../components/league/shared';
import { ChampionIcon } from '../components/ChampionIcon';
import EsportsLayout from '../components/EsportsLayout';
import { SideRail } from '../components/Sidebar';
import PlayerTraits from '../components/PlayerTraits';
import { Select } from '../components/ui/Select';

export async function playerLoader({ params, request }: LoaderFunctionArgs): Promise<PlayerProfile> {
  const url = new URL(request.url);
  const year = url.searchParams.get('year');
  const event = url.searchParams.get('event');

  const apiParams: Record<string, string> = {};
  if (year) apiParams.year = year;
  if (event) apiParams.event = event;

  const data = (await getPlayerProfile(params.name!, apiParams)).data;

  if (!year && data.available_years.length > 0) {
    const latest = String(Math.max(...data.available_years));
    url.searchParams.set('year', latest);
    throw redirect(url.toString());
  }

  return data;
}

type Tab = 'Overview' | 'Stats' | 'Matches';

/* ─── shared primitives ─────────────────────────────────────── */

const SECTION = 'text-(--text-dim) uppercase font-semibold';
const sectionStyle = { fontSize: 10.5, letterSpacing: '0.1em' } as const;

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

function kdaStr(k: number, d: number, a: number) {
  return d === 0 ? '∞' : ((k + a) / d).toFixed(2);
}

/* ─── Overview ─────────────────────────────────────────────── */

function Headline({ stats }: { stats: PlayerProfileStats }) {
  const wr = stats.win_rate ?? 0;
  return (
    <Card style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', alignItems: 'center' }}>
      {/* Win rate ring */}
      <div className="flex items-center gap-3" style={{ padding: '18px 22px', borderRight: '1px solid var(--border)' }}>
        <Ring pct={wr} size={62} stroke={5}>
          <span className="tabular-nums font-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-h)' }}>
            {stats.win_rate != null ? `${wr.toFixed(0)}%` : '—'}
          </span>
        </Ring>
        <div>
          <div className={SECTION} style={sectionStyle}>Win rate</div>
          <div className="tabular-nums" style={{ fontSize: 12.5, color: 'var(--text)', marginTop: 4 }}>
            {stats.wins}<span className="text-(--text-faint)">W</span> · {stats.losses}<span className="text-(--text-faint)">L</span>
          </div>
        </div>
      </div>

      <HeadlineCell label="KDA" value={stats.kda.toFixed(2)} sub={`${stats.avg_kills.toFixed(1)} / ${stats.avg_deaths.toFixed(1)} / ${stats.avg_assists.toFixed(1)}`} />
      <HeadlineCell label="Games" value={String(stats.games)} sub="this selection" border />
      <HeadlineCell label="CS / min" value={stats.avg_cs_per_min != null ? stats.avg_cs_per_min.toFixed(1) : '—'} sub={`${stats.avg_cs} CS avg`} border />
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

function PerformanceList({ stats }: { stats: PlayerProfileStats }) {
  const rows: { label: string; value: string }[] = [
    { label: 'Kills per game', value: stats.avg_kills.toFixed(1) },
    { label: 'Deaths per game', value: stats.avg_deaths.toFixed(1) },
    { label: 'Assists per game', value: stats.avg_assists.toFixed(1) },
    { label: 'CS per game', value: String(stats.avg_cs) },
    { label: 'CS per minute', value: stats.avg_cs_per_min != null ? stats.avg_cs_per_min.toFixed(2) : '—' },
    { label: 'Gold per game', value: `${(stats.avg_gold / 1000).toFixed(1)}k` },
    { label: 'Damage per game', value: `${(stats.avg_damage / 1000).toFixed(1)}k` },
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

type TrendPoint = { i: number; kda: number; kills: number; deaths: number; assists: number; won: boolean | null; champion: string | null; opponent: string };

function KdaTooltip({ active, payload }: { active?: boolean; payload?: { payload: TrendPoint }[] }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: 'var(--shadow-md)' }}>
      {d.champion && <div style={{ color: 'var(--text-h)', fontWeight: 600 }}>{d.champion}</div>}
      {d.opponent && <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>vs {d.opponent}</div>}
      <div className="tabular-nums" style={{ color: 'var(--text-dim)', marginTop: 4, fontSize: 11 }}>
        {d.kills}/{d.deaths}/{d.assists}
        <span style={{ color: 'var(--text-h)', fontWeight: 700, marginLeft: 6 }}>{d.kda === 99 ? '∞' : d.kda.toFixed(2)} KDA</span>
      </div>
    </div>
  );
}

function KdaTrend({ games }: { games: PlayerProfileGame[] }) {
  const data: TrendPoint[] = [...games].reverse().slice(0, 20).map((g, i) => ({
    i: i + 1,
    kda: g.deaths === 0 ? 99 : Math.round(((g.kills + g.assists) / g.deaths) * 100) / 100,
    kills: g.kills, deaths: g.deaths, assists: g.assists,
    won: g.won, champion: g.champion, opponent: g.opponent,
  }));
  if (data.length < 2) return null;

  return (
    <div>
      <h3 className="section-label" style={{ marginBottom: 10 }}>KDA trend</h3>
      <Card style={{ padding: '16px 16px 10px' }}>
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -30 }}>
            <defs>
              <linearGradient id="kdaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="i" hide />
            <YAxis hide domain={[0, (max: number) => Math.max(max, 4) * 1.15]} />
            <ReferenceLine y={3} stroke="var(--border-strong)" strokeDasharray="3 3" />
            <Tooltip content={<KdaTooltip />} cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }} />
            <Area
              type="monotone" dataKey="kda"
              stroke="var(--accent)" strokeWidth={2}
              fill="url(#kdaFill)"
              dot={{ r: 2.5, fill: 'var(--accent)', strokeWidth: 0 }}
              activeDot={{ r: 4.5, stroke: 'var(--surface)', strokeWidth: 2, fill: 'var(--accent)' }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

function ChampionPool({ champions }: { champions: PlayerProfileChampion[] }) {
  return (
    <div style={{ marginTop: 22 }}>
      <h3 className="section-label" style={{ marginBottom: 10 }}>Champion pool</h3>
      <Card style={{ overflow: 'hidden' }}>
        {/* header */}
        <div
          className="grid items-center text-(--text-dim) uppercase font-semibold"
          style={{ gridTemplateColumns: '40px 1fr 56px 150px 56px', gap: 14, padding: '9px 16px', fontSize: 9.5, letterSpacing: '0.07em', borderBottom: '1px solid var(--border)' }}
        >
          <span />
          <span>Champion</span>
          <span className="text-right">Games</span>
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

function ChampionPoolRow({ c, last }: { c: PlayerProfileChampion; last: boolean }) {
  return (
    <div
      className="grid items-center"
      style={{ gridTemplateColumns: '40px 1fr 56px 150px 56px', gap: 14, padding: '11px 16px', borderBottom: last ? 'none' : '1px solid var(--border)' }}
    >
      <ChampionIcon src={c.icon_url} alt={c.name} size={36} />
      <div className="min-w-0">
        <div className="font-semibold text-(--text-h) truncate" style={{ fontSize: 13 }}>{c.name}</div>
        <div className="text-(--text-dim) tabular-nums" style={{ fontSize: 10.5, marginTop: 1 }}>
          {c.avg_kills.toFixed(1)} / {c.avg_deaths.toFixed(1)} / {c.avg_assists.toFixed(1)}
        </div>
      </div>
      <div className="text-right tabular-nums text-(--text)" style={{ fontSize: 12.5 }}>{c.games}</div>
      <div className="flex items-center gap-2.5">
        <Meter pct={c.win_rate} />
        <span className="tabular-nums font-semibold text-(--text-h)" style={{ fontSize: 12, minWidth: 30, textAlign: 'right' }}>{c.win_rate.toFixed(0)}%</span>
      </div>
      <div className="text-right tabular-nums font-semibold text-(--text-h)" style={{ fontSize: 13 }}>{c.kda.toFixed(2)}</div>
    </div>
  );
}

/* ─── Right siderail ────────────────────────────────────────── */

function UpcomingRailRow({ m, isLast, onClick }: { m: PlayerProfileUpcomingMatch; isLast: boolean; onClick: () => void }) {
  const dt = m.datetime ? new Date(m.datetime) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="match-rail-row"
      style={{ padding: '8px 14px 10px', borderBottom: isLast ? 'none' : '1px solid var(--border)' }}
    >
      <div className="rail-match-meta">
        {dt ? dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'TBD'} · BO{m.best_of}
      </div>
      <div className="rail-match-team">
        <TeamMark short={m.team1} logo={m.team1_logo} size={20} />
        <span className="rail-match-team-name" style={{ fontSize: 13 }}>{m.team1}</span>
      </div>
      <div className="rail-match-team">
        <TeamMark short={m.team2} logo={m.team2_logo} size={20} />
        <span className="rail-match-team-name" style={{ fontSize: 13 }}>{m.team2}</span>
      </div>
    </button>
  );
}

function PerfRailRow({ g, isLast, onClick }: { g: PlayerProfileGame; isLast: boolean; onClick: () => void }) {
  const date = g.datetime ? new Date(g.datetime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
  return (
    <button
      type="button"
      onClick={onClick}
      className="match-rail-row w-full flex items-center gap-2.5"
      style={{ padding: '9px 14px', borderBottom: isLast ? 'none' : '1px solid var(--border)', textAlign: 'left' }}
    >
      <ResultTag won={g.won} />
      {g.champion_icon ? (
        <ChampionIcon src={g.champion_icon} alt={g.champion ?? ''} size={26} />
      ) : (
        <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--surface-sub)', flexShrink: 0 }} />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-(--text-h) font-semibold truncate" style={{ fontSize: 12 }}>{g.champion ?? '—'}</div>
        <div className="text-(--text-dim) truncate" style={{ fontSize: 10, marginTop: 1 }}>vs {g.opponent} · {date}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="tabular-nums font-semibold text-(--text-h)" style={{ fontSize: 12.5 }}>{kdaStr(g.kills, g.deaths, g.assists)}</div>
        <div className="tabular-nums text-(--text-dim)" style={{ fontSize: 10, marginTop: 1 }}>{g.kills}/{g.deaths}/{g.assists}</div>
      </div>
    </button>
  );
}

function PlayerRail({ upcoming, recent }: { upcoming: PlayerProfileUpcomingMatch[]; recent: PlayerProfileGame[] }) {
  const navigate = useNavigate();
  const { openMatch } = useDrawer();
  const recentItems = recent.slice(0, 8);

  return (
    <>
      <SideRail title="Upcoming matches">
        {upcoming.length === 0 ? (
          <div className="text-(--text-dim) text-center" style={{ padding: '12px 14px', fontSize: 12.5 }}>No upcoming matches</div>
        ) : (
          upcoming.map((m, i) => (
            <UpcomingRailRow key={m.id} m={m} isLast={i === upcoming.length - 1} onClick={() => navigate(`/matches/${m.id}`)} />
          ))
        )}
      </SideRail>

      <SideRail title="Recent performances">
        {recentItems.length === 0 ? (
          <div className="text-(--text-dim) text-center" style={{ padding: '12px 14px', fontSize: 12.5 }}>No recent games</div>
        ) : (
          recentItems.map((g, i) => (
            <PerfRailRow key={g.game_id} g={g} isLast={i === recentItems.length - 1} onClick={() => openMatch(g.match_id)} />
          ))
        )}
      </SideRail>
    </>
  );
}

/* ─── Stats tab ─────────────────────────────────────────────── */

function StatGrid({ stats }: { stats: PlayerProfileStats }) {
  const cells: { label: string; value: string; sub?: string }[] = [
    { label: 'Games', value: String(stats.games) },
    { label: 'Win rate', value: stats.win_rate != null ? `${stats.win_rate.toFixed(1)}%` : '—', sub: `${stats.wins}W ${stats.losses}L` },
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
      style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, marginTop: 10, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}
    >
      {cells.map((s) => (
        <div key={s.label} style={{ background: 'var(--surface)', padding: '14px 16px' }}>
          <div className={SECTION} style={{ fontSize: 9.5, letterSpacing: '0.08em', marginBottom: 4 }}>{s.label}</div>
          <div className="font-display tabular-nums" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-h)', lineHeight: 1.1 }}>{s.value}</div>
          {s.sub && <div className="text-(--text-dim) tabular-nums" style={{ fontSize: 10.5, marginTop: 3 }}>{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/* ─── Matches tab ───────────────────────────────────────────── */

function GameRow({ g, last }: { g: PlayerProfileGame; last: boolean }) {
  const { openMatch } = useDrawer();
  const date = g.datetime ? new Date(g.datetime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';

  return (
    <button
      type="button"
      onClick={() => openMatch(g.match_id)}
      className="w-full flex items-center gap-3 transition-colors hover:bg-(--surface-sub)"
      style={{ padding: '11px 16px', borderBottom: last ? 'none' : '1px solid var(--border)', textAlign: 'left', fontSize: 12.5 }}
    >
      <ResultTag won={g.won} />
      {g.champion_icon ? (
        <ChampionIcon src={g.champion_icon} alt={g.champion ?? ''} size={30} />
      ) : (
        <div style={{ width: 30, height: 30, borderRadius: 6, background: 'var(--surface-sub)', flexShrink: 0 }} />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-(--text-h) font-semibold truncate" style={{ fontSize: 12.5 }}>
          {g.champion ?? '—'}
          <span className="text-(--text-dim) font-normal ml-2" style={{ fontSize: 10.5 }}>vs {g.opponent}</span>
        </div>
        <div className="text-(--text-dim)" style={{ fontSize: 10.5 }}>{date} · {g.event}</div>
      </div>
      <div className="text-right shrink-0 tabular-nums">
        <div className="font-semibold text-(--text-h)" style={{ fontSize: 13 }}>{kdaStr(g.kills, g.deaths, g.assists)}</div>
        <div className="text-(--text-dim)" style={{ fontSize: 10.5, marginTop: 1 }}>{g.kills}/{g.deaths}/{g.assists}</div>
      </div>
    </button>
  );
}

/* ─── Page ──────────────────────────────────────────────────── */

export default function PlayerDetailPage() {
  const { name } = useParams<{ name: string }>();
  return <PlayerDetailView key={name} />;
}

function PlayerDetailView() {
  const data = useLoaderData() as PlayerProfile;
  const [searchParams, setSearchParams] = useSearchParams();
  const { openTeam } = useDrawer();
  const [activeTab, setActiveTab] = useState<Tab>('Overview');

  const { player, current_team, current_role, stats, traits, best_champions, recent_games, upcoming_matches, available_years, available_events } = data;
  const portraitSrc = player.image || player.leaguepedia_image;

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

  const tabs: Tab[] = ['Overview', 'Stats', 'Matches'];

  return (
    <EsportsLayout right={<PlayerRail upcoming={upcoming_matches} recent={recent_games} />}>
      {/* Hero card */}
      <div
        className="card card-xl card-soft-shadow overflow-hidden"
        style={{ borderRadius: 16, background: 'var(--surface)' }}
      >
        <div className="flex gap-6 px-7 pt-6" style={{ alignItems: 'flex-end' }}>
          <div className="shrink-0 overflow-hidden" style={{ height: 140, borderRadius: '8px 8px 0 0', alignSelf: 'stretch' }}>
            {portraitSrc ? (
              <img src={portraitSrc} alt={player.name} decoding="async" fetchPriority="high" style={{ height: '100%', width: 'auto', display: 'block' }} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-white" style={{ background: 'var(--accent)', width: 100 }}>
                {player.name.charAt(0)}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0" style={{ alignSelf: 'center' }}>
            <h1 className="h-display" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}>
              {player.name}
            </h1>

            <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1 text-(--text-dim)" style={{ marginTop: 6, fontSize: 12.5 }}>
              {[
                current_role && (
                  <span key="role" className="inline-flex items-center gap-1.5">
                    <RoleIcon role={current_role} size={13} color="var(--text-dim)" />
                    {current_role}
                  </span>
                ),
                current_team && (
                  <button
                    key="team"
                    type="button"
                    onClick={() => openTeam(current_team.name)}
                    className="inline-flex items-center gap-1.5 hover:text-(--text-h) transition-colors"
                    style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, color: 'inherit', fontSize: 'inherit' }}
                  >
                    {current_team.logo && (
                      <img src={current_team.logo} alt={current_team.short_name} width={14} height={14} loading="lazy" decoding="async" style={{ objectFit: 'contain' }} />
                    )}
                    {current_team.short_name}
                  </button>
                ),
                player.nationality && <span key="nat">{player.nationality}</span>,
                player.age && <span key="age">Age {player.age}</span>,
              ]
                .filter(Boolean)
                .flatMap((item, i) =>
                  i === 0 ? [item] : [<span key={`dot-${i}`} style={{ color: 'var(--text-faint)' }}>·</span>, item]
                )}
            </div>
          </div>
        </div>

        {/* Tab bar + year/event selects */}
        <div className="flex items-center border-t border-(--border)" style={{ padding: '0 14px' }}>
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
              <Select
                ariaLabel="Year"
                value={selectedYear ?? null}
                options={available_years.map((y) => ({ value: y, label: String(y) }))}
                onChange={(v) => handleYearChange(String(v))}
                align="right"
              />
            )}
            {available_events.length > 0 && (
              <Select
                ariaLabel="Event"
                value={selectedEvent != null ? String(selectedEvent) : ''}
                options={[
                  { value: '', label: 'All events' },
                  ...available_events.map((e) => ({ value: String(e.id), label: e.name })),
                ]}
                onChange={(v) => handleEventChange(String(v))}
                align="right"
              />
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
              style={{
                display: 'grid',
                gridTemplateColumns: traits ? 'minmax(0, 1.05fr) minmax(0, 1fr)' : 'minmax(0, 1fr)',
                gap: 22,
                marginTop: 22,
                alignItems: 'start',
              }}
            >
              {traits && <PlayerTraits data={traits} />}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                <PerformanceList stats={stats} />
                <KdaTrend games={recent_games} />
              </div>
            </div>
            {best_champions.length > 0 && <ChampionPool champions={best_champions} />}
          </>
        )}

        {activeTab === 'Stats' && (
          <>
            <h3 className="section-label">Performance</h3>
            <StatGrid stats={stats} />
          </>
        )}

        {activeTab === 'Matches' && (
          <>
            <h3 className="section-label">Recent games</h3>
            {recent_games.length > 0 ? (
              <Card style={{ overflow: 'hidden', marginTop: 10 }}>
                {recent_games.map((g, i) => (
                  <GameRow key={g.game_id} g={g} last={i === recent_games.length - 1} />
                ))}
              </Card>
            ) : (
              <p className="text-(--text-dim)" style={{ marginTop: 10, fontSize: 13 }}>No games found.</p>
            )}
          </>
        )}
      </div>
    </EsportsLayout>
  );
}
