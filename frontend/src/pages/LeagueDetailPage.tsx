import { useNavigate, useLoaderData, useParams, redirect, type LoaderFunctionArgs } from 'react-router-dom';
import { useMemo } from 'react';
import { getLeagues, getEvents } from '../api/core';
import type { League, Event, Match } from '../types/models';
import OverviewTab from '../components/league/OverviewTab';
import EsportsLayout from '../components/EsportsLayout';
import MatchesTab from '../components/league/MatchesTab';
import StandingsTab from '../components/league/StandingsTab';
import PlayersTab from '../components/league/PlayersTab';
import ChampsTab from '../components/league/ChampsTab';
import BracketTab from '../components/league/BracketTab';
import { Select } from '../components/ui/Select';
import { useDrawer } from '../contexts/DrawerContext';
import { slugify, getStageName, buildLeagueSlug, parseLeagueSlug } from '../utils/slugs';
import {
  resolveLeagueView, bracketNeeds, bracketKey, STATIC_TAB_PATH,
  type NavTab, type StaticTab,
} from '../lib/leagueView';
import {
  loadTeamMeta, loadLeagueTab, loadBracketMatches,
  type LeagueTabData,
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
    return { league, events, teamLogos: {}, teamShortNames: {}, bracketMatches: {} };
  }

  // Rosters for the active event and every bracket sub-stage event, merged.
  const needs = bracketNeeds(view);
  const metaEventIds = [...new Set([view.activeEventId, ...needs.map((n) => n.eventId)])];

  const [metas, bracketMatches, tabData] = await Promise.all([
    Promise.all(metaEventIds.map((id) => loadTeamMeta(id))),
    loadBracketMatches(needs),
    loadLeagueTab(view, view.activeEventId),
  ]);

  // Active event first; sub-stage events override.
  const teamLogos: Record<string, string | null> = {};
  const teamShortNames: Record<string, string> = {};
  for (const m of metas) {
    Object.assign(teamLogos, m.teamLogos);
    Object.assign(teamShortNames, m.teamShortNames);
  }

  return { league, events, teamLogos, teamShortNames, bracketMatches, ...tabData };
}


export default function LeagueDetailPage() {
  const { slug = '', tab } = useParams<{ slug: string; tab?: string }>();
  const navigate = useNavigate();
  const { openMatch } = useDrawer();

  const { league, events, teamLogos, teamShortNames, bracketMatches, overview, matches, standings, players, champions, ratings } =
    useLoaderData() as LeagueLoaderData;

  // Preloaded bracket match set (undefined → component self-fetches).
  const bm = (eventId: number, stageId?: number) => bracketMatches[bracketKey(eventId, stageId)];

  const view = useMemo(() => resolveLeagueView(league, events, slug, tab), [league, events, slug, tab]);
  const {
    years, effectiveYear, stagesForYear, parentStages, effectiveEvent,
    subStages, activeEventId, navTabs, activeTab,
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

  return (
    <EsportsLayout
      header={
        <div className="league-hero-bar">
          <div className="league-hero-top flex items-center">
            <div className="league-hero-brand flex items-center">
              {league.logo && (
                <span className="dg-league-crest">
                <img
                  src={league.logo}
                  alt={leagueLabel}
                  decoding="async"
                  className="league-hero-bar-logo logo-themed"
                />
                </span>
              )}
              <div>
                <h1 className="league-hero-name">{leagueLabel}</h1>
                <p className="league-hero-subtitle">{league.name}</p>
              </div>
            </div>
            <span className="league-hero-spacer" aria-hidden="true" />
            <div className="league-hero-selects flex items-center gap-2">
              {years.length > 0 && (
                <Select
                  ariaLabel="Year"
                  value={effectiveYear ?? null}
                  options={years.map((y) => ({ value: y, label: String(y) }))}
                  onChange={handleYearSelect}
                  align="right"
                />
              )}
              {parentStages.length > 1 && (
                <Select
                  ariaLabel="Event"
                  value={activeEventId ?? null}
                  options={parentStages.map((e) => ({ value: e.id, label: getStageName(e.name, stagesForYear) }))}
                  onChange={handleEventSelect}
                  align="right"
                />
              )}
            </div>
          </div>
          <div className="league-hero-tabs-row">
            <div className="league-hero-tabs flex">
              {navTabs.map((t) => {
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTabSelect(t)}
                    className={`section-tab${t === activeTab ? ' active' : ''}`}
                    aria-label={t}
                  >
                    <span className="section-tab-text">{t}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      }
    >
          <div>
          {events.length === 0 ? (
            <p className="text-sm text-(--text-dim) py-6">No editions found.</p>
          ) : activeEventId === null ? null : (
            <>
              {activeTab === 'Overview' && overview && (
                <OverviewTab
                  key={activeEventId}
                  data={overview}
                  onViewMatches={() => handleTabSelect('Matches')}
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

