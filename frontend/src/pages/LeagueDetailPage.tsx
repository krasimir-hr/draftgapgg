import { useNavigate, useLoaderData, useParams, redirect, type LoaderFunctionArgs } from 'react-router-dom';
import { useMemo } from 'react';
import { getLeagues, getEvents } from '../api/core';
import type { League, Event, Match } from '../types/models';
import OverviewTab from '../components/league/OverviewTab';
import EsportsLayout from '../components/EsportsLayout';
import { MatchRails } from '../components/Sidebar';
import { RAIL_FEATURED } from '../lib/surfaces';
import MatchesTab from '../components/league/MatchesTab';
import StandingsTab from '../components/league/StandingsTab';
import TeamStatsRail from '../components/league/TeamStatsRail';
import PlayerStatsRail from '../components/league/PlayerStatsRail';
import ChampsStatsRail from '../components/league/ChampsStatsRail';
import PlayersTab from '../components/league/PlayersTab';
import ChampsTab from '../components/league/ChampsTab';
import BracketTab from '../components/league/BracketTab';
import { useDrawer } from '../contexts/DrawerContext';
import { slugify, getStageName, buildLeagueSlug, parseLeagueSlug } from '../utils/slugs';
import {
  resolveLeagueView, bracketNeeds, bracketKey, NO_STANDINGS, STATIC_TAB_PATH,
  type NavTab, type StaticTab,
} from '../lib/leagueView';
import {
  loadTeamMeta, loadLeagueTab, loadRails, loadBracketMatches,
  type LeagueTabData, type RailsData,
} from '../lib/leagueData';

// Cached across league pages so switching leagues/tabs resolves from memory.
let leaguesCache: League[] | null = null;
const eventsCache = new Map<number, Event[]>();

export interface LeagueLoaderData extends LeagueTabData {
  league: League | null;
  events: Event[];
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
  bracketMatches: Record<string, Match[]>;
  rails: RailsData;
}

// Resolves the league, events, team metadata and active-tab data before render.
export async function leagueLoader({ params }: LoaderFunctionArgs): Promise<LeagueLoaderData> {
  const slug = params.slug ?? '';
  const tab = params.tab;
  const leaguePart = parseLeagueSlug(slug)?.leaguePart ?? slug;

  if (!leaguesCache) {
    leaguesCache = (await getLeagues({ page_size: 100 })).data.results;
  }
  const league = leaguesCache.find((l) => slugify(l.short_name ?? l.name) === leaguePart) ?? null;

  let events: Event[] = [];
  if (league) {
    if (!eventsCache.has(league.id)) {
      eventsCache.set(league.id, (await getEvents({ league: league.id, page_size: 200 })).data.results);
    }
    events = eventsCache.get(league.id)!;
  }

  const view = resolveLeagueView(league, events, slug, tab);

  // Redirect partial slugs to the canonical full slug before rendering.
  if (league && view.effectiveEvent && view.effectiveYear) {
    const fullSlug = buildLeagueSlug(league, view.effectiveYear, view.effectiveEvent, view.stagesForYear);
    if (fullSlug !== slug) {
      throw redirect(`/leagues/${fullSlug}${tab ? `/${tab}` : ''}`);
    }
  }

  if (view.activeEventId === null) {
    return { league, events, teamLogos: {}, teamShortNames: {}, bracketMatches: {}, rails: { upcoming: [], recent: [] } };
  }

  // Rosters for the active event and every bracket sub-stage event, merged.
  const needs = bracketNeeds(view);
  const metaEventIds = [...new Set([view.activeEventId, ...needs.map((n) => n.eventId)])];

  const [metas, bracketMatches, tabData, rails] = await Promise.all([
    Promise.all(metaEventIds.map((id) => loadTeamMeta(id))),
    loadBracketMatches(needs),
    loadLeagueTab(view, view.activeEventId),
    loadRails(view.overviewEventIds),
  ]);

  // Active event first; sub-stage events override.
  const teamLogos: Record<string, string | null> = {};
  const teamShortNames: Record<string, string> = {};
  for (const m of metas) {
    Object.assign(teamLogos, m.teamLogos);
    Object.assign(teamShortNames, m.teamShortNames);
  }

  return { league, events, teamLogos, teamShortNames, bracketMatches, rails, ...tabData };
}


export default function LeagueDetailPage() {
  const { slug = '', tab } = useParams<{ slug: string; tab?: string }>();
  const navigate = useNavigate();
  const { openMatch } = useDrawer();

  const { league, events, teamLogos, teamShortNames, bracketMatches, rails, overview, matches, standings, players, champions, ratings } =
    useLoaderData() as LeagueLoaderData;

  // Preloaded bracket match set (undefined → component self-fetches).
  const bm = (eventId: number, stageId?: number) => bracketMatches[bracketKey(eventId, stageId)];

  const view = useMemo(() => resolveLeagueView(league, events, slug, tab), [league, events, slug, tab]);
  const {
    years, effectiveYear, stagesForYear, parentStages, effectiveEvent,
    subStages, activeEventId, overviewEventIds, navTabs, activeTab,
  } = view;

  // Navigation helpers
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
    navigate(`/leagues/${newSlug}`);
  }

  function handleEventSelect(eventId: number) {
    const event = events.find((e) => e.id === eventId);
    if (!league || !event || !effectiveYear) return;
    const newSlug = buildLeagueSlug(league, effectiveYear, event, stagesForYear);
    navigate(`/leagues/${newSlug}${tab ? `/${tab}` : ''}`);
  }


  function handleTabSelect(newTab: NavTab) {
    const s = currentSlug();
    const path = STATIC_TAB_PATH[newTab as StaticTab] ?? slugify(newTab);
    navigate(path ? `/leagues/${s}/${path}` : `/leagues/${s}`);
  }

  function handleMatchSelect(id: number) {
    openMatch(id);
  }

  // Render
  if (!league) return (
    <EsportsLayout>
      <p className="text-sm" style={{ color: 'var(--red)' }}>League not found</p>
    </EsportsLayout>
  );

  const leagueLabel = league.short_name ?? league.name;
  const activeStageName = effectiveEvent ? getStageName(effectiveEvent.name, stagesForYear) : '';

  const rightRail =
    activeEventId == null ? undefined
    : activeTab === 'Team Stats' ? <TeamStatsRail list={standings ?? []} teamShortNames={teamShortNames} />
    : activeTab === 'Players' ? <PlayerStatsRail players={players ?? []} ratings={ratings ?? []} teamLogos={teamLogos} />
    : activeTab === 'Champions' ? <ChampsStatsRail champions={champions ?? []} />
    : (
      <MatchRails
        eventIds={overviewEventIds}
        upcoming={rails.upcoming}
        recent={rails.recent}
        teamLogos={teamLogos}
        teamShortNames={teamShortNames}
        onMatchSelect={handleMatchSelect}
        onViewAll={() => handleTabSelect('Matches')}
      />
    );

  return (
    <EsportsLayout
      right={rightRail}
      header={
        <div
          className="card card-xl card-soft-shadow overflow-hidden league-hero"
          style={{ borderRadius: 16, background: RAIL_FEATURED }}
        >
        <div className="league-hero-topwrap">
        <div className="league-hero-top flex items-center gap-4 px-7 py-6 flex-wrap">
          <div className="flex items-center justify-center shrink-0" style={{ width: 80, height: 80 }}>
            {league.logo ? (
              <img
                src={league.logo}
                alt={leagueLabel}
                width={80}
                height={80}
                decoding="async"
                fetchPriority="high"
                className="logo-themed"
                style={{ width: 80, height: 80, objectFit: 'contain' }}
              />
            ) : (
              <span
                className="font-bold"
                style={{
                  fontFamily: 'var(--font-sans)', fontSize: 18,
                  letterSpacing: '-0.02em', color: 'var(--text-h)',
                }}
              >
                {leagueLabel}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h1
              className="h-display"
              style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}
            >
              {leagueLabel}{effectiveYear ? ` ${NO_STANDINGS.has(leagueLabel) ? '' : 'Season '}${effectiveYear}` : ''}
            </h1>
            {activeStageName && !NO_STANDINGS.has(leagueLabel) && (() => {
              const stripped = activeStageName
                .replace(new RegExp(`^${leagueLabel}\\s+${effectiveYear}\\s+`, 'i'), '')
                .replace(new RegExp(`^${leagueLabel}\\s+`, 'i'), '');
              return stripped ? (
                <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--accent-2)', fontWeight: 500 }}>
                  {stripped}
                </div>
              ) : null;
            })()}
          </div>

        </div>
        </div>

        <div className="league-hero-bar flex items-center border-t border-(--border)" style={{ padding: '0 14px' }}>
          {league.logo && (
            <img
              src={league.logo}
              alt={leagueLabel}
              decoding="async"
              className="league-hero-bar-logo logo-themed"
            />
          )}
          <div className="league-hero-tabs flex">
            {navTabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleTabSelect(t)}
                className={`section-tab${t === activeTab ? ' active' : ''}`}
              >
                {t}
              </button>
            ))}
          </div>
          <span className="league-hero-spacer" aria-hidden="true" />
          <div className="flex items-center gap-2">
            {years.length > 0 && (
              <select className="field-select" value={effectiveYear ?? ''} onChange={(e) => handleYearSelect(Number(e.target.value))}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            {parentStages.length > 1 && (
              <select className="field-select" value={activeEventId ?? ''} onChange={(e) => handleEventSelect(Number(e.target.value))}>
                {parentStages.map((e) => (
                  <option key={e.id} value={e.id}>{getStageName(e.name, stagesForYear)}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>
      }
    >
          <div style={{ marginTop: 24 }}>
          {events.length === 0 ? (
            <p className="text-sm text-(--text-dim) py-6">No editions found.</p>
          ) : activeEventId === null ? null : (
            <>
              {activeTab === 'Overview' && overview && (
                <OverviewTab
                  key={activeEventId}
                  data={overview}
                  teamShortNames={teamShortNames}
                  teamLogos={teamLogos}
                  eventId={activeEventId ?? undefined}
                  onMatchSelect={handleMatchSelect}
                  subStages={subStages}
                  bm={bm}
                />
              )}
{subStages.filter((ss) => !ss.stageOnly).map((ss) => activeTab === ss.label && (
                <BracketTab
                  key={ss.stageId ?? ss.event.id}
                  eventId={ss.event.id}
                  stageId={ss.stageId}
                  preloadedMatches={bm(ss.event.id, ss.stageId)}
                  eventName={ss.event.name}
                  teamLogos={teamLogos}
                  teamShortNames={teamShortNames}
                  onMatchSelect={handleMatchSelect}
                />
              ))}
              {activeTab === 'Matches' && matches && (
                <MatchesTab
                  matches={matches}
                  teamLogos={teamLogos}
                  teamShortNames={teamShortNames}
                  onMatchSelect={handleMatchSelect}
                />
              )}
              {activeTab === 'Team Stats' && (
                <StandingsTab list={standings ?? []} teamShortNames={teamShortNames} eventId={activeEventId!} stages={effectiveEvent?.stages ?? []} />
              )}
              {activeTab === 'Players' && players && (
                <PlayersTab
                  players={players}
                  ratings={ratings ?? []}
                  teamLogos={teamLogos}
                  teamShortNames={teamShortNames}
                  eventId={activeEventId!}
                  stages={effectiveEvent?.stages ?? []}
                />
              )}
              {activeTab === 'Champions' && champions && (
                <ChampsTab
                  champions={champions}
                  eventId={activeEventId!}
                  stages={effectiveEvent?.stages ?? []}
                />
              )}
            </>
          )}
          </div>
    </EsportsLayout>
  );
}

