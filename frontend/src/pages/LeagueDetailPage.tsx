import { useNavigate, useLoaderData, useParams, redirect, type LoaderFunctionArgs } from 'react-router-dom';
import { useMemo, type ReactNode } from 'react';
import { getLeagues, getEvents } from '../api/core';
import type { League, Event, Match } from '../types/models';
import OverviewTab from '../components/league/OverviewTab';
import EsportsLayout from '../components/EsportsLayout';
import { MatchRails } from '../components/Sidebar';
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
  resolveLeagueView, bracketNeeds, bracketKey, STATIC_TAB_PATH,
  type NavTab, type StaticTab,
} from '../lib/leagueView';
import {
  loadTeamMeta, loadLeagueTab, loadRails, loadBracketMatches,
  type LeagueTabData, type RailsData,
} from '../lib/leagueData';

// Icons for the section-tab menu. Shown in place of the text label on mobile
// (see .league-hero-tabs in App.css); desktop keeps the text. navTabs is always
// this fixed set — sub-stages never become tabs — so every tab has an icon.
const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const TAB_ICONS: Record<string, ReactNode> = {
  Overview: svg(<>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
  </>),
  Matches: svg(<>
    <rect x="2.5" y="8" width="19" height="8.5" rx="4.25" />
    <path d="M6.5 10.75v3" />
    <path d="M5 12.25h3" />
    <circle cx="15.3" cy="11.6" r="0.5" fill="currentColor" stroke="none" />
    <circle cx="18" cy="13.4" r="0.5" fill="currentColor" stroke="none" />
  </>),
  'Team Stats': svg(<>
    <path d="M5 20v-6" />
    <path d="M12 20V5.5" />
    <path d="M19 20v-9.5" />
  </>),
  Players: svg(<>
    <circle cx="9" cy="8" r="3.3" />
    <path d="M3.8 19.5a5.4 5.4 0 0 1 10.4 0" />
    <path d="M15.6 5.2a3.2 3.2 0 0 1 0 5.7" />
    <path d="M16.3 14.3a5.4 5.4 0 0 1 3.9 5.2" />
  </>),
  Champions: svg(<>
    <path d="M14.5 17.5 3.5 6.5v-3h3l11 11" />
    <path d="M13 19l6-6" />
    <path d="M16 16l4.5 4.5" />
    <path d="M14.5 6.5 17.5 3.5h3v3l-3 3" />
    <path d="M5 14l4 4" />
    <path d="M7.5 16.5 3.5 20.5" />
  </>),
};

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
        <div className="league-hero-bar flex items-center" style={{ padding: '0 8px' }}>
          {league.logo && (
            <img
              src={league.logo}
              alt={leagueLabel}
              decoding="async"
              className="league-hero-bar-logo logo-themed"
            />
          )}
          <div className="league-hero-tabs flex">
            {navTabs.map((t) => {
              const icon = TAB_ICONS[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTabSelect(t)}
                  className={`section-tab${t === activeTab ? ' active' : ''}${icon ? ' section-tab--icon' : ''}`}
                  aria-label={t}
                >
                  {icon && <span className="section-tab-icon" aria-hidden="true">{icon}</span>}
                  <span className="section-tab-text">{t}</span>
                </button>
              );
            })}
          </div>
          <span className="league-hero-spacer" aria-hidden="true" />
          <div className="league-hero-selects flex items-center gap-2">
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

