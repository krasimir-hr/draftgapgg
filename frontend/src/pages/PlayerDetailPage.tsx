import { Link, useParams } from 'react-router-dom';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { getPlayerProfile } from '../api/core';
import type {
  PlayerProfile,
  PlayerProfileChampion,
  PlayerProfileGame,
  PlayerProfileStats,
} from '../types/models';
import Spinner from '../components/Spinner';

const ROLE_ICON: Record<string, string> = {
  Top:     'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-top.svg',
  Jungle:  'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-jungle.svg',
  Mid:     'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-middle.svg',
  Bot:     'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-bottom.svg',
  Support: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-utility.svg',
};

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

type Tab = 'overview' | 'performances' | 'champions';

interface State {
  loading: boolean;
  error: string | null;
  data: PlayerProfile | null;
}
type Action =
  | { type: 'fetch' }
  | { type: 'success'; data: PlayerProfile }
  | { type: 'error'; message: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'fetch':   return { ...state, loading: true, error: null };
    case 'success': return { loading: false, error: null, data: action.data };
    case 'error':   return { ...state, loading: false, error: action.message };
  }
}

/** Reusable hook that fetches a player profile for given filters. */
function usePlayerProfile(name: string, year: string, eventId: string) {
  const [state, dispatch] = useReducer(reducer, { loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'fetch' });
    const params: { year?: string; event?: string } = {};
    if (year !== 'all') params.year = year;
    if (eventId !== 'all') params.event = eventId;
    getPlayerProfile(name, params)
      .then((res) => { if (!cancelled) dispatch({ type: 'success', data: res.data }); })
      .catch((err) => { if (!cancelled) dispatch({ type: 'error', message: String(err) }); });
    return () => { cancelled = true; };
  }, [name, year, eventId]);

  return state;
}

export default function PlayerDetailPage() {
  const { name } = useParams<{ name: string }>();
  const playerName = name ?? '';
  const [tab, setTab] = useState<Tab>('overview');

  // Overview always fetches with year=latest; tabs maintain their own filter.
  const overview = usePlayerProfile(playerName, 'latest', 'all');

  if (overview.loading && !overview.data) return <Spinner />;
  if (overview.error || !overview.data) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <p className="text-sm text-red-400">{overview.error ?? 'Player not found'}</p>
      </div>
    );
  }

  const { player, current_team, current_role, available_years, available_events } = overview.data;
  const latestYear = available_years[0] ?? null;
  const flag = flagEmoji(player.nationality);
  const portraitCandidates = [player.image, player.leaguepedia_image].filter((s): s is string => !!s);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <PlayerHeader
        name={player.name}
        realName={player.real_name}
        nationality={player.nationality}
        age={player.age}
        role={current_role}
        flag={flag}
        portraitSources={portraitCandidates}
        currentTeam={current_team}
      />

      <TabBar tab={tab} onChange={setTab} />

      {tab === 'overview' && (
        <OverviewTab data={overview.data} latestYear={latestYear} />
      )}
      {tab === 'performances' && (
        <PerformancesTab
          name={playerName}
          availableYears={available_years}
          availableEvents={available_events}
          initialYear={latestYear != null ? String(latestYear) : 'all'}
        />
      )}
      {tab === 'champions' && (
        <ChampionsTab
          name={playerName}
          availableYears={available_years}
          availableEvents={available_events}
          initialYear={latestYear != null ? String(latestYear) : 'all'}
        />
      )}
    </div>
  );
}

/* ─── Header ─── */

function PlayerHeader({
  name, realName, nationality, age, role, flag,
  portraitSources, currentTeam,
}: {
  name: string;
  realName: string | null;
  nationality: string | null;
  age: string | null;
  role: string | null;
  flag: string;
  portraitSources: string[];
  currentTeam: PlayerProfile['current_team'];
}) {
  return (
    <div className="card overflow-hidden mb-6 relative">
      <div className="flex items-stretch gap-0">
        {/* Portrait */}
        <div className="shrink-0 w-44 sm:w-56 relative overflow-hidden">
          <PlayerPortrait name={name} sources={portraitSources} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 px-7 py-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-2">
              {role && ROLE_ICON[role] && (
                <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: 'var(--surface-sub)' }}>
                  <img src={ROLE_ICON[role]} alt={role} className="w-5 h-5 brightness-0 invert opacity-70" />
                </div>
              )}
              <h1 className="text-3xl sm:text-4xl font-bold text-(--text-h) tracking-tight">{name}</h1>
              {flag && <span className="text-2xl leading-none">{flag}</span>}
            </div>

            {realName && <p className="text-sm text-(--text) mb-3">{realName}</p>}

            <div className="flex items-center gap-4 flex-wrap text-xs text-(--text-dim)">
              {role && <span className="badge badge-accent">{role}</span>}
              {nationality && <span>{nationality}</span>}
              {age && <span>Age {age}</span>}
            </div>
          </div>

          {currentTeam && (
            <Link
              to={`/teams/${encodeURIComponent(currentTeam.name)}`}
              className="mt-5 pt-5 border-t border-(--border) flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              {currentTeam.logo ? (
                <img src={currentTeam.logo} alt={currentTeam.name} className="w-10 h-10 object-contain shrink-0" />
              ) : (
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ background: 'var(--accent)' }}
                >
                  {currentTeam.name.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-(--text-dim) leading-none mb-1">Current team</p>
                <p className="text-sm font-semibold text-(--text-h) truncate">{currentTeam.name}</p>
              </div>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab bar ─── */

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview',     label: 'Overview' },
    { key: 'performances', label: 'Performances' },
    { key: 'champions',    label: 'Champions' },
  ];
  return (
    <div className="flex items-center gap-1 mb-5 border-b border-(--border)">
      {tabs.map(t => {
        const active = t.key === tab;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className="relative px-4 py-2.5 text-sm font-medium transition-colors"
            style={{
              color: active ? 'var(--text-h)' : 'var(--text-dim)',
            }}
          >
            <span className={active ? '' : 'hover:text-(--text-h)'}>{t.label}</span>
            {active && (
              <span
                className="absolute left-0 right-0 -bottom-px h-0.5 rounded-t"
                style={{ background: 'var(--accent)' }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Overview tab ─── */

function OverviewTab({ data, latestYear }: { data: PlayerProfile; latestYear: number | null }) {
  const { stats, best_champions, recent_games } = data;
  const champs = best_champions.slice(0, 10);

  return (
    <>
      {latestYear != null && (
        <p className="text-[11px] uppercase tracking-widest text-(--text-dim) mb-3">
          Showing {latestYear} performance
        </p>
      )}
      <StatRow stats={stats} />
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 mt-6">
        <RecentGamesCard games={recent_games} title="Recent matches" maxGroups={10} />
        <ChampionsCard champions={champs} title="Most played champions" />
      </div>
    </>
  );
}

/* ─── Performances tab ─── */

function PerformancesTab({
  name, availableYears, availableEvents, initialYear,
}: {
  name: string;
  availableYears: number[];
  availableEvents: PlayerProfile['available_events'];
  initialYear: string;
}) {
  const [year, setYear] = useState(initialYear);
  const [eventId, setEventId] = useState('all');
  const state = usePlayerProfile(name, year, eventId);

  const filteredEvents = useFilteredEvents(availableEvents, year, eventId, setEventId);

  return (
    <>
      <FilterBar
        year={year} onYearChange={setYear}
        eventId={eventId} onEventChange={setEventId}
        years={availableYears}
        events={filteredEvents}
        loading={state.loading}
      />

      {state.loading && !state.data ? (
        <div className="py-12 flex items-center justify-center"><div className="spinner" /></div>
      ) : state.error || !state.data ? (
        <p className="text-sm text-red-400 px-2 py-4">{state.error ?? 'Failed to load'}</p>
      ) : (
        <RecentGamesCard games={state.data.recent_games} title="Matches" />
      )}
    </>
  );
}

/* ─── Champions tab ─── */

function ChampionsTab({
  name, availableYears, availableEvents, initialYear,
}: {
  name: string;
  availableYears: number[];
  availableEvents: PlayerProfile['available_events'];
  initialYear: string;
}) {
  const [year, setYear] = useState(initialYear);
  const [eventId, setEventId] = useState('all');
  const state = usePlayerProfile(name, year, eventId);

  const filteredEvents = useFilteredEvents(availableEvents, year, eventId, setEventId);

  return (
    <>
      <FilterBar
        year={year} onYearChange={setYear}
        eventId={eventId} onEventChange={setEventId}
        years={availableYears}
        events={filteredEvents}
        loading={state.loading}
      />

      {state.loading && !state.data ? (
        <div className="py-12 flex items-center justify-center"><div className="spinner" /></div>
      ) : state.error || !state.data ? (
        <p className="text-sm text-red-400 px-2 py-4">{state.error ?? 'Failed to load'}</p>
      ) : (
        <ChampionsCard champions={state.data.best_champions} title="Champions played" />
      )}
    </>
  );
}

/* ─── Shared bits ─── */

function useFilteredEvents(
  available: PlayerProfile['available_events'],
  year: string,
  eventId: string,
  setEventId: (v: string) => void,
) {
  const filtered = useMemo(() => {
    if (year === 'all') return available;
    const yr = Number(year);
    return available.filter(e => e.year === yr);
  }, [available, year]);

  useEffect(() => {
    if (eventId === 'all') return;
    if (!filtered.some(e => String(e.id) === eventId)) setEventId('all');
  }, [filtered, eventId, setEventId]);

  return filtered;
}

function FilterBar({
  year, onYearChange, eventId, onEventChange, years, events, loading,
}: {
  year: string;
  onYearChange: (v: string) => void;
  eventId: string;
  onEventChange: (v: string) => void;
  years: number[];
  events: PlayerProfile['available_events'];
  loading: boolean;
}) {
  return (
    <div className="card px-5 py-4 mb-5 flex items-center gap-3 flex-wrap">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-(--text-dim)">Filter</span>
      <select className="field-select" value={year} onChange={(e) => onYearChange(e.target.value)}>
        <option value="all">All years</option>
        {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
      </select>
      <select className="field-select" value={eventId} onChange={(e) => onEventChange(e.target.value)}>
        <option value="all">All events</option>
        {events.map(e => (
          <option key={e.id} value={String(e.id)}>
            {e.league} · {e.name}{e.year ? ` (${e.year})` : ''}
          </option>
        ))}
      </select>
      {loading && <div className="spinner ml-auto" />}
    </div>
  );
}

function StatRow({ stats }: { stats: PlayerProfileStats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatTile label="Games" value={stats.games} />
      <StatTile
        label="Win rate"
        value={stats.win_rate != null ? `${stats.win_rate}%` : '—'}
        sub={`${stats.wins}W ${stats.losses}L`}
        accent={stats.win_rate != null && stats.win_rate >= 50 ? 'green' : undefined}
      />
      <StatTile label="KDA" value={stats.kda.toFixed(2)} sub={`${stats.avg_kills} / ${stats.avg_deaths} / ${stats.avg_assists}`} />
      <StatTile label="CS / min" value={stats.avg_cs_per_min != null ? stats.avg_cs_per_min.toFixed(2) : '—'} sub={`${stats.avg_cs} avg`} />
      <StatTile label="Avg gold" value={`${(stats.avg_gold / 1000).toFixed(1)}k`} />
      <StatTile label="Avg dmg" value={`${(stats.avg_damage / 1000).toFixed(1)}k`} />
    </div>
  );
}

interface MatchGroup {
  matchId: number;
  games: PlayerProfileGame[];
}

function groupGamesByMatch(games: PlayerProfileGame[]): MatchGroup[] {
  const groups: MatchGroup[] = [];
  const indexByMatch = new Map<number, number>();
  for (const g of games) {
    const existing = indexByMatch.get(g.match_id);
    if (existing == null) {
      indexByMatch.set(g.match_id, groups.length);
      groups.push({ matchId: g.match_id, games: [g] });
    } else {
      groups[existing].games.push(g);
    }
  }
  // Within each match, show games in chronological order (game 1 first).
  for (const grp of groups) {
    grp.games.sort((a, b) => (a.datetime ?? '').localeCompare(b.datetime ?? ''));
  }
  return groups;
}

function RecentGamesCard({
  games, title, maxGroups,
}: {
  games: PlayerProfileGame[];
  title: string;
  maxGroups?: number;
}) {
  const allGroups = useMemo(() => groupGamesByMatch(games), [games]);
  const groups = maxGroups != null ? allGroups.slice(0, maxGroups) : allGroups;
  const shownGames = groups.reduce((n, g) => n + g.games.length, 0);

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-(--border) flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-(--text-h)">{title}</h2>
        <span className="text-xs text-(--text-dim)">
          ({groups.length} {groups.length === 1 ? 'match' : 'matches'} · {shownGames} games)
        </span>
      </div>
      {groups.length === 0 ? (
        <p className="text-sm text-(--text-dim) px-5 py-8 text-center">No games for this filter.</p>
      ) : (
        <ul>
          {groups.map((grp, i) => (
            <li key={grp.matchId} className={i > 0 ? 'border-t border-(--border)' : ''}>
              <MatchGroupRow group={grp} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MatchGroupRow({ group }: { group: MatchGroup }) {
  const first = group.games[0];

  // Series score (from the player's team perspective)
  const playerOnT1 = first.team === first.match_team1;
  const ownScore = playerOnT1 ? first.match_team1_wins : first.match_team2_wins;
  const oppScore = playerOnT1 ? first.match_team2_wins : first.match_team1_wins;
  const seriesWon = first.match_winner != null
    ? (playerOnT1 ? first.match_winner === 1 : first.match_winner === 2)
    : null;

  const date = first.datetime
    ? new Date(first.datetime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '—';

  const eventLogo = first.event_logo || first.league_logo;

  return (
    <Link
      to={`/matches/${group.matchId}`}
      className="block hover:bg-(--surface-hover) transition-colors"
    >
      {/* Header row */}
      <div className="flex items-center gap-3 px-5 py-3">
        {/* Left: date + vs + opponent */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-xs text-(--text-dim) tabular-nums shrink-0 w-14">{date}</span>
          <span className="text-xs text-(--text-dim) shrink-0">vs</span>
          <SmallTeamLogo name={first.opponent} logo={first.opponent_logo} />
          <span className="text-sm font-semibold text-(--text-h) truncate">{first.opponent}</span>
          {first.match_winner != null && (
            <span
              className="text-xs font-semibold tabular-nums shrink-0"
              style={{ color: seriesWon ? 'var(--green)' : '#ef4444' }}
            >
              {seriesWon ? 'W' : 'L'} {ownScore}-{oppScore}
            </span>
          )}
        </div>

        {/* Right: league/event + Bo */}
        <div className="flex items-center gap-2 shrink-0 text-xs text-(--text-dim) min-w-0">
          {eventLogo && (
            <img
              src={eventLogo}
              alt={first.league}
              className="w-4 h-4 object-contain shrink-0 logo-themed"
            />
          )}
          <span className="text-(--text) truncate max-w-[18ch]">{first.event}</span>
          <span className="opacity-40">·</span>
          <span>Bo{first.best_of}</span>
        </div>
      </div>

      {/* Games sub-rows */}
      <div className="border-t border-(--border)" style={{ background: 'color-mix(in srgb, var(--surface-sub) 35%, transparent)' }}>
        {group.games.map((g, i) => {
          const won = g.won === true;
          const lost = g.won === false;
          const stripe = won ? 'var(--green)' : lost ? '#ef4444' : 'var(--border)';
          return (
            <div
              key={g.game_id}
              className={`flex items-center gap-3 px-5 py-2 ${i > 0 ? 'border-t border-(--border)' : ''}`}
            >
              <div className="w-0.5 h-7 rounded-full shrink-0" style={{ background: stripe }} />
              {g.champion_icon ? (
                <img src={g.champion_icon} alt={g.champion ?? ''} className="w-7 h-7 rounded shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded bg-(--surface-sub) shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <span className="text-xs font-medium text-(--text-h) truncate">{g.champion ?? '—'}</span>
                <span className="text-[10px] text-(--text-dim) ml-1.5">{g.role}</span>
              </div>
              <div className="text-xs tabular-nums text-(--text-h) shrink-0">
                {g.kills}/<span className="text-red-400">{g.deaths}</span>/{g.assists}
              </div>
              <div className="text-[10px] text-(--text-dim) tabular-nums shrink-0 w-16 text-right">
                {g.cs_per_min != null ? `${g.cs_per_min.toFixed(1)} cs/m` : `${g.cs} cs`}
              </div>
            </div>
          );
        })}
      </div>
    </Link>
  );
}

function SmallTeamLogo({ name, logo }: { name: string; logo: string | null }) {
  if (logo) {
    return (
      <div className="w-6 h-6 shrink-0 flex items-center justify-center overflow-hidden">
        <img src={logo} alt={name} className="max-w-full max-h-full object-contain" />
      </div>
    );
  }
  return (
    <div
      className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold text-white shrink-0"
      style={{ background: 'var(--accent)' }}
    >
      {name.charAt(0)}
    </div>
  );
}

function ChampionsCard({ champions, title }: { champions: PlayerProfileChampion[]; title: string }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-(--border) flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-(--text-h)">{title}</h2>
        <span className="text-xs text-(--text-dim)">({champions.length})</span>
      </div>
      {champions.length === 0 ? (
        <p className="text-sm text-(--text-dim) px-5 py-8 text-center">No champion data.</p>
      ) : (
        <ul>
          {champions.map((c, i) => (
            <li key={c.id} className={i > 0 ? 'border-t border-(--border)' : ''}>
              <Link
                to={`/champions/${c.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-(--surface-hover) transition-colors"
              >
                <img src={c.icon_url} alt={c.name} className="w-10 h-10 rounded-md shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-(--text-h) truncate">{c.name}</p>
                  <p className="text-[11px] text-(--text-dim) tabular-nums">
                    {c.games} game{c.games === 1 ? '' : 's'} · {c.avg_kills}/{c.avg_deaths}/{c.avg_assists}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className="text-sm font-semibold tabular-nums"
                    style={{ color: c.win_rate >= 50 ? 'var(--green)' : 'var(--text-h)' }}
                  >
                    {c.win_rate.toFixed(0)}%
                  </p>
                  <p className="text-[11px] text-(--text-dim) tabular-nums">{c.kda.toFixed(2)} KDA</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlayerPortrait({ name, sources }: { name: string; sources: string[] }) {
  const [idx, setIdx] = useState(0);
  const src = sources[idx];

  if (!src) {
    return (
      <div
        className="w-full h-full flex items-center justify-center text-6xl font-bold text-white"
        style={{ background: 'var(--accent)' }}
      >
        {name.charAt(0)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      className="w-full h-full object-cover object-top"
      onError={() => setIdx(i => i + 1)}
    />
  );
}

function StatTile({
  label, value, sub, accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'green';
}) {
  const valueColor = accent === 'green' ? 'var(--green)' : 'var(--text-h)';
  return (
    <div className="card px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-(--text-dim) mb-1">{label}</p>
      <p className="text-xl font-bold tabular-nums" style={{ color: valueColor }}>{value}</p>
      {sub && <p className="text-[11px] text-(--text-dim) tabular-nums mt-0.5">{sub}</p>}
    </div>
  );
}
