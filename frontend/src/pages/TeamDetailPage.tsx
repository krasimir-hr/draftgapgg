import { Link, useParams } from 'react-router-dom';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { getTeamProfile } from '../api/core';
import type {
  TeamProfile,
  TeamProfileChampion,
  TeamProfileEventOption,
  TeamProfileMatch,
  TeamProfileRosterPlayer,
  TeamProfileStats,
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

function PortraitCard({ player }: { player: TeamProfileRosterPlayer }) {
  const flag = flagEmoji(player.nationality);
  return (
    <Link
      to={`/players/${encodeURIComponent(player.name)}`}
      className="group relative block"
    >
      <div
        className="relative w-full overflow-hidden transition-all duration-200 ease-out group-hover:-translate-y-1.5"
        style={{ paddingBottom: '145%', boxShadow: '0 0 0 1px var(--border)' }}
        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent), 0 8px 24px color-mix(in srgb, var(--accent) 35%, transparent)')}
        onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 0 0 1px var(--border)')}
      >
        <div className="absolute inset-0" style={{ background: 'color-mix(in srgb, var(--surface-sub) 60%, black)' }}>
          {ROLE_ICON[player.role] && (
            <div className="absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
              <img src={ROLE_ICON[player.role]} alt={player.role} className="w-3.5 h-3.5 brightness-0 invert opacity-90" />
            </div>
          )}

          {player.image ? (
            <img src={player.image} alt={player.name} className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xl font-bold text-white" style={{ background: 'var(--accent)' }}>
              {player.name.charAt(0)}
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-black/90 to-transparent" />
          <div className="absolute bottom-0 inset-x-0 px-1.5 pb-2 flex flex-col items-center gap-0.5">
            <span className="text-[11px] font-bold text-white leading-tight text-center drop-shadow truncate w-full">{player.name}</span>
            {flag && <span className="text-xs leading-none">{flag}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}

type Tab = 'overview' | 'matches' | 'champions' | 'roster';

interface State {
  loading: boolean;
  error: string | null;
  data: TeamProfile | null;
}
type Action =
  | { type: 'fetch' }
  | { type: 'success'; data: TeamProfile }
  | { type: 'error'; message: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'fetch':   return { ...state, loading: true, error: null };
    case 'success': return { loading: false, error: null, data: action.data };
    case 'error':   return { ...state, loading: false, error: action.message };
  }
}

function useTeamProfile(name: string, year: string, eventId: string) {
  const [state, dispatch] = useReducer(reducer, { loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'fetch' });
    const params: { year?: string; event?: string } = {};
    if (year !== 'all') params.year = year;
    if (eventId !== 'all') params.event = eventId;
    getTeamProfile(name, params)
      .then((res) => { if (!cancelled) dispatch({ type: 'success', data: res.data }); })
      .catch((err) => { if (!cancelled) dispatch({ type: 'error', message: String(err) }); });
    return () => { cancelled = true; };
  }, [name, year, eventId]);

  return state;
}

export default function TeamDetailPage() {
  const { name } = useParams<{ name: string }>();
  const teamName = name ?? '';
  const [tab, setTab] = useState<Tab>('overview');

  // Overview always fetches with year=latest, all events.
  const overview = useTeamProfile(teamName, 'latest', 'all');

  if (overview.loading && !overview.data) return <Spinner />;
  if (overview.error || !overview.data) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <p className="text-sm text-red-400">{overview.error ?? 'Team not found'}</p>
      </div>
    );
  }

  const { team, current_event, current_roster, available_years, available_events } = overview.data;
  const latestYear = available_years[0] ?? null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <TeamHeader team={team} currentEvent={current_event} starterCount={current_roster.filter(r => r.is_starter && r.role !== 'Coach').length} />

      <TabBar tab={tab} onChange={setTab} />

      {tab === 'overview' && (
        <OverviewTab
          data={overview.data}
          latestYear={latestYear}
        />
      )}
      {tab === 'matches' && (
        <MatchesTab
          name={teamName}
          availableYears={available_years}
          availableEvents={available_events}
          initialYear={latestYear != null ? String(latestYear) : 'all'}
        />
      )}
      {tab === 'champions' && (
        <ChampionsTab
          name={teamName}
          availableYears={available_years}
          availableEvents={available_events}
          initialYear={latestYear != null ? String(latestYear) : 'all'}
        />
      )}
      {tab === 'roster' && (
        <RosterTab roster={current_roster} currentEvent={current_event} />
      )}
    </div>
  );
}

/* ─── Header ─── */

function TeamHeader({
  team, currentEvent, starterCount,
}: {
  team: TeamProfile['team'];
  currentEvent: TeamProfileEventOption | null;
  starterCount: number;
}) {
  return (
    <div className="card overflow-hidden mb-6 relative">
      <div className="flex items-stretch gap-0">
        <div className="shrink-0 w-44 sm:w-56 flex items-center justify-center p-6 bg-(--surface-sub)">
          {team.logo ? (
            <img
              src={team.logo}
              alt={team.name}
              className="max-w-full max-h-32 object-contain"
            />
          ) : (
            <div
              className="w-32 h-32 rounded-2xl flex items-center justify-center text-5xl font-bold text-white"
              style={{ background: team.color || 'var(--accent)' }}
            >
              {team.short_name.charAt(0)}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 px-7 py-6 flex flex-col justify-between">
          <div>
            <div className="flex items-baseline gap-3 flex-wrap mb-2">
              <h1 className="text-3xl sm:text-4xl font-bold text-(--text-h) tracking-tight">{team.name}</h1>
              {team.short_name && team.short_name !== team.name && (
                <span className="text-xl font-semibold text-(--text-dim) tracking-widest">{team.short_name}</span>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap text-xs text-(--text-dim)">
              {team.region && <span className="badge badge-accent">{team.region}</span>}
              {currentEvent && (
                <span>
                  {currentEvent.league}
                  {currentEvent.year ? ` · ${currentEvent.year}` : ''}
                </span>
              )}
              {starterCount > 0 && <span>{starterCount} starters</span>}
            </div>
          </div>

          {currentEvent && (
            <div className="mt-5 pt-5 border-t border-(--border)">
              <p className="text-[10px] uppercase tracking-widest text-(--text-dim) leading-none mb-1">Currently competing in</p>
              <p className="text-sm font-semibold text-(--text-h) truncate">{currentEvent.name}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab bar ─── */

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview',  label: 'Overview' },
    { key: 'matches',   label: 'Matches' },
    { key: 'champions', label: 'Champions' },
    { key: 'roster',    label: 'Roster' },
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
            style={{ color: active ? 'var(--text-h)' : 'var(--text-dim)' }}
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

/* ─── Overview ─── */

function OverviewTab({ data, latestYear }: { data: TeamProfile; latestYear: number | null }) {
  const { stats, top_champions, recent_matches, current_roster } = data;
  const champs = top_champions.slice(0, 10);
  const starters = current_roster.filter(r => r.is_starter && r.role !== 'Coach');

  const upcoming = recent_matches
    .filter(m => m.won === null)
    .slice()
    .sort((a, b) => (a.datetime ?? '').localeCompare(b.datetime ?? ''));
  const finished = recent_matches.filter(m => m.won !== null);

  return (
    <>
      {latestYear != null && (
        <p className="text-[11px] uppercase tracking-widest text-(--text-dim) mb-3">
          Showing {latestYear} performance
        </p>
      )}
      <StatRow stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 mt-6">
        {/* Left: upcoming */}
        <div className="space-y-6">
          <UpcomingMatchesCard matches={upcoming} />
        </div>

        {/* Right: roster + recent + champions */}
        <div className="space-y-6 min-w-0">
          {starters.length > 0 && (
            <PortraitRoster players={starters} title="Starting roster" />
          )}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <MatchesCard matches={finished} title="Recent results" maxRows={10} />
            <ChampionsCard champions={champs} title="Most picked champions" />
          </div>
        </div>
      </div>
    </>
  );
}

function PortraitRoster({ players, title }: { players: TeamProfileRosterPlayer[]; title: string }) {
  if (players.length === 0) return null;
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-(--border) flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-(--text-h)">{title}</h2>
        <span className="text-xs text-(--text-dim)">({players.length})</span>
      </div>
      <div
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 p-3 justify-items-center"
        style={{ background: 'var(--surface-sub)' }}
      >
        {players.map(p => (
          <div key={`${p.player_id}-${p.role}`} className="w-full max-w-30">
            <PortraitCard player={p} />
          </div>
        ))}
      </div>
    </div>
  );
}

function UpcomingMatchesCard({ matches }: { matches: TeamProfileMatch[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-(--border) flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-(--text-h)">Upcoming</h2>
        <span className="text-xs text-(--text-dim)">({matches.length})</span>
      </div>
      {matches.length === 0 ? (
        <p className="text-sm text-(--text-dim) px-5 py-8 text-center">No upcoming matches.</p>
      ) : (
        <ul>
          {matches.map((m, i) => {
            const d = m.datetime ? new Date(m.datetime) : null;
            const date = d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
            const time = d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
            return (
              <li key={m.match_id} className={i > 0 ? 'border-t border-(--border)' : ''}>
                <Link
                  to={`/matches/${m.match_id}`}
                  className="block px-5 py-3 hover:bg-(--surface-hover) transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1.5 text-[11px] text-(--text-dim) tabular-nums">
                    <span>{date}</span>
                    {time && <span>{time}</span>}
                    <span className="opacity-40">·</span>
                    <span>Bo{m.best_of}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <SmallTeamLogo name={m.opponent} logo={m.opponent_logo} />
                    <span className="text-sm font-semibold text-(--text-h) truncate">vs {m.opponent}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-(--text-dim)">
                    {(m.event_logo || m.league_logo) && (
                      <img
                        src={(m.event_logo || m.league_logo) as string}
                        alt={m.league}
                        className="w-3.5 h-3.5 object-contain shrink-0 logo-themed"
                      />
                    )}
                    <span className="truncate">{m.event}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ─── Matches tab ─── */

function MatchesTab({
  name, availableYears, availableEvents, initialYear,
}: {
  name: string;
  availableYears: number[];
  availableEvents: TeamProfileEventOption[];
  initialYear: string;
}) {
  const [year, setYear] = useState(initialYear);
  const [eventId, setEventId] = useState('all');
  const state = useTeamProfile(name, year, eventId);

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
        <MatchesCard matches={state.data.recent_matches} title="Matches" />
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
  availableEvents: TeamProfileEventOption[];
  initialYear: string;
}) {
  const [year, setYear] = useState(initialYear);
  const [eventId, setEventId] = useState('all');
  const state = useTeamProfile(name, year, eventId);

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
        <ChampionsCard champions={state.data.top_champions} title="Champions played" showBans />
      )}
    </>
  );
}

/* ─── Roster tab ─── */

function RosterTab({
  roster, currentEvent,
}: {
  roster: TeamProfileRosterPlayer[];
  currentEvent: TeamProfileEventOption | null;
}) {
  if (roster.length === 0) {
    return <p className="text-sm text-(--text-dim) py-8 text-center">No roster information.</p>;
  }
  const starters = roster.filter(r => r.is_starter && r.role !== 'Coach');
  const subs = roster.filter(r => !r.is_starter && r.role !== 'Coach');
  const coaches = roster.filter(r => r.role === 'Coach');

  return (
    <>
      {currentEvent && (
        <p className="text-[11px] uppercase tracking-widest text-(--text-dim) mb-3">
          Roster for {currentEvent.name}
        </p>
      )}
      {starters.length > 0 && (
        <PortraitRoster players={starters} title="Starters" />
      )}
      {subs.length > 0 && (
        <div className="mt-6">
          <PortraitRoster players={subs} title="Substitutes" />
        </div>
      )}
      {coaches.length > 0 && (
        <div className="mt-6">
          <PortraitRoster players={coaches} title="Coaching staff" />
        </div>
      )}
    </>
  );
}

/* ─── Shared bits ─── */

function useFilteredEvents(
  available: TeamProfileEventOption[],
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
  events: TeamProfileEventOption[];
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

function StatRow({ stats }: { stats: TeamProfileStats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatTile
        label="Match WR"
        value={stats.match_win_rate != null ? `${stats.match_win_rate}%` : '—'}
        sub={`${stats.match_wins}W ${stats.match_losses}L`}
        accent={stats.match_win_rate != null && stats.match_win_rate >= 50 ? 'green' : undefined}
      />
      <StatTile
        label="Game WR"
        value={stats.game_win_rate != null ? `${stats.game_win_rate}%` : '—'}
        sub={`${stats.game_wins}W ${stats.game_losses}L`}
      />
      <StatTile label="Avg kills" value={stats.avg_kills_for} sub={`vs ${stats.avg_kills_against}`} />
      <StatTile label="Avg length" value={stats.avg_game_length ?? '—'} />
      <StatTile label="Dragons" value={stats.avg_dragons.toFixed(1)} sub="per game" />
      <StatTile label="Barons" value={stats.avg_barons.toFixed(1)} sub="per game" />
    </div>
  );
}

function MatchesCard({
  matches, title, maxRows,
}: {
  matches: TeamProfileMatch[];
  title: string;
  maxRows?: number;
}) {
  const rows = maxRows != null ? matches.slice(0, maxRows) : matches;
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-(--border) flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-(--text-h)">{title}</h2>
        <span className="text-xs text-(--text-dim)">({rows.length}{maxRows != null && matches.length > maxRows ? ` of ${matches.length}` : ''})</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-(--text-dim) px-5 py-8 text-center">No matches for this filter.</p>
      ) : (
        <ul>
          {rows.map((m, i) => (
            <li key={m.match_id} className={i > 0 ? 'border-t border-(--border)' : ''}>
              <MatchRow match={m} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MatchRow({ match }: { match: TeamProfileMatch }) {
  const won = match.won === true;
  const lost = match.won === false;
  const stripe = won ? 'var(--green)' : lost ? '#ef4444' : 'var(--border)';
  const date = match.datetime
    ? new Date(match.datetime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '—';
  const eventLogo = match.event_logo || match.league_logo;

  return (
    <Link
      to={`/matches/${match.match_id}`}
      className="flex items-center gap-3 px-5 py-3 hover:bg-(--surface-hover) transition-colors"
    >
      <div className="w-0.5 h-9 rounded-full shrink-0" style={{ background: stripe }} />

      {/* Left: date + vs + opponent */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="text-xs text-(--text-dim) tabular-nums shrink-0 w-14">{date}</span>
        <span className="text-xs text-(--text-dim) shrink-0">vs</span>
        <SmallTeamLogo name={match.opponent} logo={match.opponent_logo} />
        <span className="text-sm font-semibold text-(--text-h) truncate">{match.opponent}</span>
        {match.won != null && (
          <span
            className="text-xs font-semibold tabular-nums shrink-0"
            style={{ color: won ? 'var(--green)' : '#ef4444' }}
          >
            {won ? 'W' : 'L'} {match.team_score}-{match.opponent_score}
          </span>
        )}
      </div>

      {/* Right: league/event + Bo */}
      <div className="flex items-center gap-2 shrink-0 text-xs text-(--text-dim)">
        {eventLogo && (
          <img
            src={eventLogo}
            alt={match.league}
            className="w-4 h-4 object-contain shrink-0 logo-themed"
          />
        )}
        <span className="text-(--text) truncate max-w-[20ch]">{match.event}</span>
        <span className="opacity-40">·</span>
        <span>Bo{match.best_of}</span>
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

function ChampionsCard({
  champions, title, showBans,
}: {
  champions: TeamProfileChampion[];
  title: string;
  showBans?: boolean;
}) {
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
                    {c.picks} pick{c.picks === 1 ? '' : 's'}
                    {showBans && c.bans > 0 ? ` · ${c.bans} ban${c.bans === 1 ? '' : 's'}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className="text-sm font-semibold tabular-nums"
                    style={{ color: (c.win_rate ?? 0) >= 50 ? 'var(--green)' : 'var(--text-h)' }}
                  >
                    {c.win_rate != null ? `${c.win_rate.toFixed(0)}%` : '—'}
                  </p>
                  <p className="text-[11px] text-(--text-dim) tabular-nums">
                    {c.kda != null ? `${c.kda.toFixed(2)} KDA` : ''}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
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
