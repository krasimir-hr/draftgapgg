import { useLoaderData, useParams, useSearchParams, type LoaderFunctionArgs } from 'react-router-dom';
import { useState } from 'react';
import { getChampionProfile } from '../api/lol';
import type {
  ChampionProfile,
  ChampionProfileAbility,
  ChampionProfileGame,
  ChampionProfilePlayer,
  ChampionProfileRegion,
  ChampionProfileRole,
  ChampionProfileStats,
} from '../types/models';
import { useDrawer } from '../contexts/DrawerContext';
import { RoleIcon } from '../components/league/shared';
import { ChampionIcon } from '../components/ChampionIcon';
import EsportsLayout from '../components/EsportsLayout';
import { SideRail } from '../components/Sidebar';
import { Select } from '../components/ui/Select';

export async function championLoader({ params, request }: LoaderFunctionArgs): Promise<ChampionProfile> {
  const url = new URL(request.url);
  const year = url.searchParams.get('year');
  const apiParams: Record<string, string> = {};
  if (year) apiParams.year = year;
  return (await getChampionProfile(Number(params.id), apiParams)).data;
}

type Tab = 'Overview' | 'Abilities' | 'Matches';

/* ─── shared primitives (mirrors the player page) ───────────── */

const SECTION = 'text-(--text-dim) uppercase font-semibold';
const sectionStyle = { fontSize: 10.5, letterSpacing: '0.1em' } as const;

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, ...style }}>
      {children}
    </div>
  );
}

/** Slim monochrome progress track. */
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

/* ─── Overview ──────────────────────────────────────────────── */

function Headline({ stats }: { stats: ChampionProfileStats }) {
  const wr = stats.win_rate ?? 0;
  return (
    <Card style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', alignItems: 'center' }}>
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
      <HeadlineCell label="Pick rate" value={stats.pick_rate != null ? `${stats.pick_rate.toFixed(0)}%` : '—'} sub={`${stats.games} games picked`} border />
      <HeadlineCell label="Presence" value={stats.presence != null ? `${stats.presence.toFixed(0)}%` : '—'} sub={`${stats.bans} bans`} border />
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

/** Where the champion is played + how each side performs. */
function RolesAndSides({ roles, stats }: { roles: ChampionProfileRole[]; stats: ChampionProfileStats }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 22, alignItems: 'start' }}>
      <div>
        <h3 className="section-label" style={{ marginBottom: 10 }}>Roles</h3>
        <Card style={{ overflow: 'hidden' }}>
          {roles.length === 0 ? (
            <div className="text-(--text-dim) text-center" style={{ padding: '14px', fontSize: 12.5 }}>No data</div>
          ) : roles.map((r, i) => (
            <div
              key={r.role}
              className="grid items-center"
              style={{ gridTemplateColumns: '1fr 120px 46px', gap: 12, padding: '11px 16px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <RoleIcon role={r.role} size={14} color="var(--text-dim)" />
                <span className="text-(--text-h) font-semibold truncate" style={{ fontSize: 12.5 }}>{r.role}</span>
                <span className="text-(--text-dim) tabular-nums" style={{ fontSize: 10.5 }}>{r.share.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Meter pct={r.share} />
                <span className="tabular-nums text-(--text-dim)" style={{ fontSize: 11, minWidth: 28, textAlign: 'right' }}>{r.games}g</span>
              </div>
              <span className="text-right tabular-nums font-semibold text-(--text-h)" style={{ fontSize: 12.5 }}>
                {r.win_rate != null ? `${r.win_rate.toFixed(0)}%` : '—'}
              </span>
            </div>
          ))}
        </Card>
      </div>

      <div>
        <h3 className="section-label" style={{ marginBottom: 10 }}>Side performance</h3>
        <Card style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <SideCell label="Blue side" color="var(--blue, #4f86f7)" wr={stats.blue_win_rate} games={stats.blue_games} />
          <SideCell label="Red side" color="var(--red)" wr={stats.red_win_rate} games={stats.red_games} border />
        </Card>
      </div>
    </div>
  );
}

function SideCell({ label, color, wr, games, border }: { label: string; color: string; wr: number | null; games: number; border?: boolean }) {
  return (
    <div style={{ padding: '16px 18px', borderLeft: border ? '1px solid var(--border)' : undefined }}>
      <div className="flex items-center gap-1.5" style={{ marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: color, display: 'inline-block' }} />
        <span className={SECTION} style={sectionStyle}>{label}</span>
      </div>
      <div className="font-display tabular-nums" style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-h)', lineHeight: 1 }}>
        {wr != null ? `${wr.toFixed(0)}%` : '—'}
      </div>
      <div className="text-(--text-dim) tabular-nums" style={{ fontSize: 11, marginTop: 4 }}>{games} games</div>
    </div>
  );
}

function BestPlayers({ players, onPlayer }: { players: ChampionProfilePlayer[]; onPlayer: (name: string) => void }) {
  return (
    <div style={{ marginTop: 22 }}>
      <h3 className="section-label" style={{ marginBottom: 10 }}>Best players</h3>
      <Card style={{ overflow: 'hidden' }}>
        <div
          className="grid items-center text-(--text-dim) uppercase font-semibold"
          style={{ gridTemplateColumns: '40px 1fr 56px 150px 56px', gap: 14, padding: '9px 16px', fontSize: 9.5, letterSpacing: '0.07em', borderBottom: '1px solid var(--border)' }}
        >
          <span />
          <span>Player</span>
          <span className="text-right">Games</span>
          <span>Win rate</span>
          <span className="text-right">KDA</span>
        </div>
        {players.map((p, i) => (
          <button
            key={p.name}
            type="button"
            onClick={() => onPlayer(p.name)}
            className="grid items-center w-full text-left transition-colors hover:bg-(--surface-sub)"
            style={{ gridTemplateColumns: '40px 1fr 56px 150px 56px', gap: 14, padding: '10px 16px', borderBottom: i === players.length - 1 ? 'none' : '1px solid var(--border)' }}
          >
            {p.image ? (
              <img src={p.image} alt={p.name} width={36} height={36} loading="lazy" decoding="async"
                style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', objectPosition: 'top', background: 'var(--surface-sub)' }} />
            ) : (
              <div className="flex items-center justify-center font-bold text-white" style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent)', fontSize: 14 }}>
                {p.name.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <div className="font-semibold text-(--text-h) truncate" style={{ fontSize: 13 }}>{p.name}</div>
              <div className="text-(--text-dim) flex items-center gap-1.5 truncate" style={{ fontSize: 10.5, marginTop: 1 }}>
                {p.team_logo && <img src={p.team_logo} alt="" width={12} height={12} style={{ objectFit: 'contain' }} />}
                <span className="truncate">{p.team}</span>
              </div>
            </div>
            <div className="text-right tabular-nums text-(--text)" style={{ fontSize: 12.5 }}>{p.games}</div>
            <div className="flex items-center gap-2.5">
              <Meter pct={p.win_rate} />
              <span className="tabular-nums font-semibold text-(--text-h)" style={{ fontSize: 12, minWidth: 30, textAlign: 'right' }}>{p.win_rate.toFixed(0)}%</span>
            </div>
            <div className="text-right tabular-nums font-semibold text-(--text-h)" style={{ fontSize: 13 }}>{p.kda.toFixed(2)}</div>
          </button>
        ))}
      </Card>
    </div>
  );
}

/* ─── Right siderail ────────────────────────────────────────── */

function RegionRailRow({ r, isLast }: { r: ChampionProfileRegion; isLast: boolean }) {
  return (
    <div
      className="flex items-center gap-2.5"
      style={{ padding: '9px 14px', borderBottom: isLast ? 'none' : '1px solid var(--border)' }}
    >
      {r.logo ? (
        <img src={r.logo} alt={r.name} width={24} height={24} loading="lazy" decoding="async" style={{ objectFit: 'contain', flexShrink: 0 }} />
      ) : (
        <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--surface-sub)', flexShrink: 0 }} />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-(--text-h) font-semibold truncate" style={{ fontSize: 12.5 }}>{r.name}</div>
        <div className="text-(--text-dim) tabular-nums" style={{ fontSize: 10, marginTop: 1 }}>{r.games} games</div>
      </div>
      <div className="flex items-center gap-2 shrink-0" style={{ width: 96 }}>
        <Meter pct={r.win_rate} />
        <span className="tabular-nums font-semibold text-(--text-h)" style={{ fontSize: 12, minWidth: 30, textAlign: 'right' }}>{r.win_rate.toFixed(0)}%</span>
      </div>
    </div>
  );
}

function RecentRailRow({ g, isLast, onClick }: { g: ChampionProfileGame; isLast: boolean; onClick: () => void }) {
  const date = g.datetime ? new Date(g.datetime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
  return (
    <button
      type="button"
      onClick={onClick}
      className="match-rail-row w-full flex items-center gap-2.5"
      style={{ padding: '9px 14px', borderBottom: isLast ? 'none' : '1px solid var(--border)', textAlign: 'left' }}
    >
      <ResultTag won={g.won} />
      <div className="min-w-0 flex-1">
        <div className="text-(--text-h) font-semibold truncate" style={{ fontSize: 12 }}>{g.player}</div>
        <div className="text-(--text-dim) truncate" style={{ fontSize: 10, marginTop: 1 }}>vs {g.opponent} · {date}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="tabular-nums font-semibold text-(--text-h)" style={{ fontSize: 12.5 }}>{kdaStr(g.kills, g.deaths, g.assists)}</div>
        <div className="tabular-nums text-(--text-dim)" style={{ fontSize: 10, marginTop: 1 }}>{g.kills}/{g.deaths}/{g.assists}</div>
      </div>
    </button>
  );
}

function ChampionRail({ regions, recent }: { regions: ChampionProfileRegion[]; recent: ChampionProfileGame[] }) {
  const { openMatch } = useDrawer();
  const regionItems = regions.slice(0, 6);
  const recentItems = recent.slice(0, 8);
  return (
    <>
      <SideRail title="Best regions">
        {regionItems.length === 0 ? (
          <div className="text-(--text-dim) text-center" style={{ padding: '12px 14px', fontSize: 12.5 }}>No regional data</div>
        ) : (
          regionItems.map((r, i) => <RegionRailRow key={r.id} r={r} isLast={i === regionItems.length - 1} />)
        )}
      </SideRail>

      <SideRail title="Recent games">
        {recentItems.length === 0 ? (
          <div className="text-(--text-dim) text-center" style={{ padding: '12px 14px', fontSize: 12.5 }}>No recent games</div>
        ) : (
          recentItems.map((g, i) => (
            <RecentRailRow key={g.game_id} g={g} isLast={i === recentItems.length - 1} onClick={() => openMatch(g.match_id)} />
          ))
        )}
      </SideRail>
    </>
  );
}

/* ─── Abilities tab ─────────────────────────────────────────── */

const ABILITY_KEY: Record<string, string> = { passive: 'P', Q: 'Q', W: 'W', E: 'E', R: 'R' };

function AbilityRow({ a, last }: { a: ChampionProfileAbility; last: boolean }) {
  return (
    <div className="flex items-start gap-3.5" style={{ padding: '14px 16px', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <div className="relative shrink-0" style={{ width: 44, height: 44 }}>
        {a.image_url ? (
          <img src={a.image_url} alt={a.name} width={44} height={44} loading="lazy" decoding="async"
            style={{ width: 44, height: 44, borderRadius: 9, objectFit: 'cover', border: '1px solid var(--accent-border)' }} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 9, background: 'var(--surface-sub)' }} />
        )}
        <span
          className="absolute font-bold flex items-center justify-center text-white"
          style={{ bottom: -5, right: -5, width: 18, height: 18, borderRadius: 5, fontSize: 10, background: 'var(--accent)', border: '2px solid var(--surface)' }}
        >
          {ABILITY_KEY[a.ability_type] ?? a.ability_type}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-(--text-h) font-semibold" style={{ fontSize: 13 }}>{a.name}</p>
          {a.cooldown.length > 0 && (
            <span className="text-(--text-dim) tabular-nums shrink-0" style={{ fontSize: 10.5 }}>CD {a.cooldown.join(' / ')}s</span>
          )}
        </div>
        <p className="text-(--text) leading-relaxed" style={{ fontSize: 12, marginTop: 4 }}>{a.description}</p>
      </div>
    </div>
  );
}

/* ─── Matches tab ───────────────────────────────────────────── */

function GameRow({ g, last, onClick }: { g: ChampionProfileGame; last: boolean; onClick: () => void }) {
  const date = g.datetime ? new Date(g.datetime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 transition-colors hover:bg-(--surface-sub)"
      style={{ padding: '11px 16px', borderBottom: last ? 'none' : '1px solid var(--border)', textAlign: 'left', fontSize: 12.5 }}
    >
      <ResultTag won={g.won} />
      <RoleIcon role={g.role} size={15} color="var(--text-dim)" />
      <div className="min-w-0 flex-1">
        <div className="text-(--text-h) font-semibold truncate" style={{ fontSize: 12.5 }}>
          {g.player}
          <span className="text-(--text-dim) font-normal ml-2" style={{ fontSize: 10.5 }}>{g.team} vs {g.opponent}</span>
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

export default function ChampionDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ChampionDetailView key={id} />;
}

function ChampionDetailView() {
  const data = useLoaderData() as ChampionProfile;
  const [searchParams, setSearchParams] = useSearchParams();
  const { openMatch, openPlayer } = useDrawer();
  const [activeTab, setActiveTab] = useState<Tab>('Overview');

  const { champion, abilities, stats, roles, best_players, best_regions, recent_games, available_years } = data;
  const selectedYear = searchParams.get('year') ?? '';

  function handleYearChange(year: string) {
    const next = new URLSearchParams(searchParams);
    if (year) next.set('year', year);
    else next.delete('year');
    setSearchParams(next);
  }

  const tabs: Tab[] = ['Overview', 'Abilities', 'Matches'];

  return (
    <EsportsLayout right={<ChampionRail regions={best_regions} recent={recent_games} />}>
      {/* Hero card */}
      <div
        className="card card-xl card-soft-shadow overflow-hidden relative"
        style={{ borderRadius: 16 }}
      >
        {champion.splash_url && (
          <div
            aria-hidden
            style={{
              position: 'absolute', inset: 0,
              backgroundImage: `linear-gradient(90deg, var(--surface) 12%, transparent 65%), url(${champion.splash_url})`,
              backgroundSize: 'cover', backgroundPosition: 'right 22%',
              opacity: 0.5, pointerEvents: 'none',
            }}
          />
        )}
        <div className="relative">
          <div className="flex gap-5 px-7 pt-6 pb-1" style={{ alignItems: 'center' }}>
            <ChampionIcon src={champion.icon_url} alt={champion.name} size={88} />
            <div className="flex-1 min-w-0">
              <h1 className="h-display" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}>{champion.name}</h1>
              {champion.title && (
                <p className="text-(--text) italic" style={{ fontSize: 13.5, marginTop: 4 }}>{champion.title}</p>
              )}
              <div className="flex items-center flex-wrap gap-1.5" style={{ marginTop: 9 }}>
                {champion.tags.map((tag) => (
                  <span key={tag} className="badge badge-accent">{tag}</span>
                ))}
                {champion.resource_type && (
                  <span className="text-(--text-dim)" style={{ fontSize: 11.5, marginLeft: 4 }}>{champion.resource_type}</span>
                )}
              </div>
            </div>
          </div>

          {/* Tab bar + year select */}
          <div className="flex items-center border-t border-(--border)" style={{ padding: '0 14px', marginTop: 14 }}>
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
            {available_years.length > 0 && (
              <Select
                ariaLabel="Year"
                value={selectedYear}
                options={[
                  { value: '', label: 'All years' },
                  ...available_years.map((y) => ({ value: String(y), label: String(y) })),
                ]}
                onChange={(v) => handleYearChange(String(v))}
                align="right"
              />
            )}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ marginTop: 22 }}>
        {activeTab === 'Overview' && (
          stats.games === 0 ? (
            <Card style={{ padding: '28px', textAlign: 'center' }}>
              <p className="text-(--text-dim)" style={{ fontSize: 13 }}>
                No competitive games recorded for {champion.name}{selectedYear ? ` in ${selectedYear}` : ''}.
              </p>
            </Card>
          ) : (
            <>
              <Headline stats={stats} />
              <div style={{ marginTop: 22 }}>
                <RolesAndSides roles={roles} stats={stats} />
              </div>
              {best_players.length > 0 && <BestPlayers players={best_players} onPlayer={openPlayer} />}
            </>
          )
        )}

        {activeTab === 'Abilities' && (
          <>
            <h3 className="section-label" style={{ marginBottom: 10 }}>Abilities</h3>
            {abilities.length > 0 ? (
              <Card style={{ overflow: 'hidden' }}>
                {abilities.map((a, i) => (
                  <AbilityRow key={a.id} a={a} last={i === abilities.length - 1} />
                ))}
              </Card>
            ) : (
              <p className="text-(--text-dim)" style={{ fontSize: 13 }}>No ability data.</p>
            )}
          </>
        )}

        {activeTab === 'Matches' && (
          <>
            <h3 className="section-label" style={{ marginBottom: 10 }}>Recent games</h3>
            {recent_games.length > 0 ? (
              <Card style={{ overflow: 'hidden' }}>
                {recent_games.map((g, i) => (
                  <GameRow key={g.game_id} g={g} last={i === recent_games.length - 1} onClick={() => openMatch(g.match_id)} />
                ))}
              </Card>
            ) : (
              <p className="text-(--text-dim)" style={{ fontSize: 13 }}>No games found.</p>
            )}
          </>
        )}
      </div>
    </EsportsLayout>
  );
}
