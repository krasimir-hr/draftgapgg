import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useReducer, useMemo } from 'react';
import { getLeagues, getEvents, getEventStandings, getEventRosters } from '../api/core';
import type { League, Event, StandingsEntry } from '../types/models';
import Spinner from '../components/Spinner';
import MatchView from '../components/MatchView';
import OverviewTab from '../components/league/OverviewTab';
import MatchListTab from '../components/league/MatchListTab';
import StandingsTab from '../components/league/StandingsTab';
import PlayersTab from '../components/league/PlayersTab';
import ChampsTab from '../components/league/ChampsTab';
import EventScheduleRail from '../components/EventScheduleRail';
import { slugify, getStageName, buildLeagueSlug, parseLeagueSlug, getEventStagePart } from '../utils/slugs';

interface StandingsState { loading: boolean; error: string | null; list: StandingsEntry[]; }
type StandingsAction = { type: 'fetch' } | { type: 'success'; list: StandingsEntry[] } | { type: 'error'; message: string };
function standingsReducer(_s: StandingsState, a: StandingsAction): StandingsState {
  switch (a.type) {
    case 'fetch':   return { loading: true, error: null, list: [] };
    case 'success': return { loading: false, error: null, list: a.list };
    case 'error':   return { loading: false, error: a.message, list: [] };
  }
}

const NAV_TABS = ['Overview', 'Results', 'Schedule', 'Standings', 'Players', 'Champions'] as const;
type NavTab = typeof NAV_TABS[number];

const TAB_TO_PATH: Record<NavTab, string> = {
  Overview: '', Results: 'results', Schedule: 'schedule',
  Standings: 'standings', Players: 'players', Champions: 'champions',
};
const PATH_TO_TAB: Record<string, NavTab> = {
  results: 'Results', schedule: 'Schedule', standings: 'Standings',
  players: 'Players', champions: 'Champions',
};

export default function LeagueDetailPage() {
  const { slug = '', tab, matchId } = useParams<{ slug: string; tab?: string; matchId?: string }>();
  const navigate = useNavigate();

  const slugParts = useMemo(() => parseLeagueSlug(slug), [slug]);
  const leaguePart = slugParts?.leaguePart ?? slug;

  // ── Resolve league + events from the slug's league part ──
  const [resolving, setResolving] = useState(true);
  const [league, setLeague] = useState<League | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResolving(true);
    setResolveError(null);

    (async () => {
      try {
        const leaguesRes = await getLeagues({ page_size: 100 });
        if (cancelled) return;
        const found = leaguesRes.data.results.find(
          (l) => slugify(l.short_name ?? l.name) === leaguePart,
        );
        if (!found) { setResolveError('League not found'); setResolving(false); return; }
        setLeague(found);
        const eventsRes = await getEvents({ league: found.id, page_size: 200 });
        if (cancelled) return;
        setEvents(eventsRes.data.results);
      } catch {
        if (!cancelled) setResolveError('Failed to load');
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();

    return () => { cancelled = true; };
  }, [leaguePart]);

  // ── Derive year / event from slug ──
  const years = useMemo(
    () => [...new Set(events.filter((e) => e.year != null).map((e) => e.year!))].sort((a, b) => b - a),
    [events],
  );
  const activeYear = useMemo(() => events.find((e) => e.is_active)?.year ?? null, [events]);
  const effectiveYear = slugParts?.year ?? activeYear ?? years[0] ?? null;

  const stagesForYear = useMemo(
    () => events
      .filter((e) => e.year === effectiveYear)
      .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? '') || a.id - b.id),
    [events, effectiveYear],
  );

  const effectiveEvent = useMemo(() => {
    if (!slugParts?.stagePart) return stagesForYear.find((e) => e.is_active) ?? stagesForYear[0] ?? null;
    if (!league || !effectiveYear) return stagesForYear[0] ?? null;
    return (
      stagesForYear.find((e) => getEventStagePart(league, effectiveYear, e, stagesForYear) === slugParts.stagePart)
      ?? stagesForYear[0]
      ?? null
    );
  }, [stagesForYear, slugParts?.stagePart, league, effectiveYear]);

  const effectiveEventId = effectiveEvent?.id ?? null;

  // ── Once resolved, redirect partial URLs to full slug ──
  useEffect(() => {
    if (resolving || !league || !effectiveEvent || !effectiveYear) return;
    const fullSlug = buildLeagueSlug(league, effectiveYear, effectiveEvent, stagesForYear);
    if (fullSlug !== slug) {
      navigate(
        `/leagues/${fullSlug}${tab ? `/${tab}` : ''}${matchId ? `/match/${matchId}` : ''}`,
        { replace: true },
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolving, league, effectiveEvent, effectiveYear]);

  // ── Tab and match derived from URL ──
  const activeTab: NavTab = (tab && PATH_TO_TAB[tab.toLowerCase()]) || 'Overview';
  const selectedMatchId = matchId ? Number(matchId) : null;

  // ── Team logos / names ──
  const [teamLogos, setTeamLogos] = useState<Record<string, string | null>>({});
  const [teamShortNames, setTeamShortNames] = useState<Record<string, string>>({});
  const [standingsState, dispatchStandings] = useReducer(standingsReducer, { loading: false, error: null, list: [] });

  useEffect(() => {
    if (effectiveEventId === null) return;
    getEventRosters(effectiveEventId).then((res) => {
      const logos: Record<string, string | null> = {};
      const shorts: Record<string, string> = {};
      for (const r of res.data.results) {
        if (!r.name) continue;
        logos[r.name] = r.org?.logo ?? null;
        if (r.org?.short_name) shorts[r.name] = r.org.short_name;
      }
      setTeamLogos(logos);
      setTeamShortNames(shorts);
    }).catch(() => {});
  }, [effectiveEventId]);

  useEffect(() => {
    if (effectiveEventId === null) return;
    dispatchStandings({ type: 'fetch' });
    getEventStandings(effectiveEventId)
      .then((res) => dispatchStandings({ type: 'success', list: res.data }))
      .catch(() => dispatchStandings({ type: 'error', message: 'Failed to load standings' }));
  }, [effectiveEventId]);

  // ── Navigation helpers ──
  function currentSlug(): string {
    if (!league || !effectiveEvent || !effectiveYear) return slug;
    return buildLeagueSlug(league, effectiveYear, effectiveEvent, stagesForYear);
  }

  function handleYearSelect(year: number) {
    const newStages = events
      .filter((e) => e.year === year)
      .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? '') || a.id - b.id);
    const defaultEvent = newStages.find((e) => e.is_active) ?? newStages[0];
    if (!league || !defaultEvent) return;
    const newSlug = buildLeagueSlug(league, year, defaultEvent, newStages);
    navigate(`/leagues/${newSlug}${tab ? `/${tab}` : ''}`);
  }

  function handleEventSelect(eventId: number) {
    const event = events.find((e) => e.id === eventId);
    if (!league || !event || !effectiveYear) return;
    const newSlug = buildLeagueSlug(league, effectiveYear, event, stagesForYear);
    navigate(`/leagues/${newSlug}${tab ? `/${tab}` : ''}`);
  }

  function handleTabSelect(newTab: NavTab) {
    const s = currentSlug();
    const path = TAB_TO_PATH[newTab];
    navigate(path ? `/leagues/${s}/${path}` : `/leagues/${s}`);
  }

  function handleMatchSelect(id: number) {
    navigate(`/leagues/${currentSlug()}/match/${id}`);
  }

  function handleMatchBack() {
    const s = currentSlug();
    const path = TAB_TO_PATH[activeTab];
    navigate(path ? `/leagues/${s}/${path}` : `/leagues/${s}`);
  }

  // ── Render ──
  if (resolving) return <Spinner />;
  if (resolveError || !league) return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <p className="text-sm text-red-400">{resolveError ?? 'Not found'}</p>
    </div>
  );

  const leagueLabel = league.short_name ?? league.name;
  const seasonHeading = effectiveYear ? `${leagueLabel} Season ${effectiveYear}` : leagueLabel;
  const placementByTeam = Object.fromEntries(standingsState.list.map((s) => [s.team, s.placement]));

  const inMatchView = events.length > 0 && selectedMatchId !== null && effectiveEventId !== null;

  if (inMatchView) {
    return (
      <div className="flex justify-center items-start gap-4 px-6 py-8">
        <div
          style={{
            position: 'sticky',
            top: '2rem',
            width: 176,
            height: 'calc(100svh - 84px)',
            flexShrink: 0,
          }}
        >
          <EventScheduleRail
            eventId={effectiveEventId!}
            currentMatchId={selectedMatchId!}
            teamLogos={teamLogos}
            teamShortNames={teamShortNames}
            onMatchSelect={handleMatchSelect}
          />
        </div>
        <div className="flex-1 min-w-0 max-w-6xl">
          <div className="card overflow-hidden">
            <MatchView
              matchId={selectedMatchId!}
              teamLogos={teamLogos}
              teamShortNames={teamShortNames}
              onBack={handleMatchBack}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="card overflow-hidden mb-4">
        <div className="flex items-center gap-4 px-6 py-5">
          {league.logo ? (
            <img src={league.logo} alt={leagueLabel} className="logo-themed w-10 h-10 object-contain shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-base font-bold text-white shrink-0" style={{ background: 'var(--accent)' }}>
              {leagueLabel.charAt(0)}
            </div>
          )}
          <h1 className="text-xl font-bold text-(--text-h) flex-1 min-w-0 truncate">{seasonHeading}</h1>
          <div className="flex items-center gap-2 shrink-0">
            {years.length > 0 && (
              <select className="field-select" value={effectiveYear ?? ''} onChange={(e) => handleYearSelect(Number(e.target.value))}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            {stagesForYear.length > 0 && (
              <select className="field-select" value={effectiveEventId ?? ''} onChange={(e) => handleEventSelect(Number(e.target.value))}>
                {stagesForYear.map((e) => (
                  <option key={e.id} value={e.id}>{getStageName(e.name, stagesForYear)}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex border-t border-(--border) px-2">
          {NAV_TABS.map((t) => (
            <button
              key={t}
              onClick={() => handleTabSelect(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                t === activeTab
                  ? 'border-(--accent) text-(--accent-2)'
                  : 'border-transparent text-(--text-dim) hover:text-(--text-h)'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-(--text-dim) py-6">No editions found.</p>
      ) : (
        <div className="card overflow-hidden">
          {effectiveEventId === null ? null : (
            <>
              {activeTab === 'Overview' && (
                <OverviewTab eventId={effectiveEventId} teamLogos={teamLogos} teamShortNames={teamShortNames} onMatchSelect={handleMatchSelect} />
              )}
              {(activeTab === 'Results' || activeTab === 'Schedule') && (
                <MatchListTab
                  eventId={effectiveEventId}
                  isResult={activeTab === 'Results'}
                  teamLogos={teamLogos}
                  teamShortNames={teamShortNames}
                  placementByTeam={placementByTeam}
                  onMatchSelect={handleMatchSelect}
                />
              )}
              {activeTab === 'Standings' && (
                <StandingsTab loading={standingsState.loading} error={standingsState.error} list={standingsState.list} />
              )}
              {activeTab === 'Players' && (
                <PlayersTab eventId={effectiveEventId} teamLogos={teamLogos} teamShortNames={teamShortNames} />
              )}
              {activeTab === 'Champions' && (
                <ChampsTab eventId={effectiveEventId} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
