import type { League, Event } from '../types/models';
import { slugify, parseLeagueSlug, getEventStagePart } from '../utils/slugs';

// Resolves the league-detail view (active event/year/stage + tab list) from the
// URL slug. Shared by the route loader and the page so preloads match the render.

export const STATIC_TABS = ['Overview', 'Matches', 'Team Stats', 'Players', 'Champions'] as const;
export type StaticTab = typeof STATIC_TABS[number];
export type NavTab = StaticTab | string;

export const STATIC_TAB_PATH: Record<StaticTab, string> = {
  Overview: '', Matches: 'matches', 'Team Stats': 'standings', Players: 'players', Champions: 'champions',
};
export const PATH_TO_STATIC: Record<string, StaticTab> = {
  matches: 'Matches', standings: 'Team Stats', players: 'Players', champions: 'Champions',
};

export const NO_STANDINGS = new Set(['Worlds', 'MSI', 'First Stand', 'EWC']);

export interface SubStage {
  label: string;
  event: Event;
  stageId?: number;    // filter matches by this EventStage id (when stage lives within parent event)
  tabFilter?: string[];
  tabPrefix?: string;  // filter matches whose tab starts with this prefix
  stageOnly?: boolean;
  swiss?: boolean;
  isStandings?: boolean; // shows regular season standings table instead of a bracket
}

export interface LeagueView {
  years: number[];
  effectiveYear: number | null;
  stagesForYear: Event[];
  parentStages: Event[];
  effectiveEvent: Event | null;
  subStages: SubStage[];
  activeEventId: number | null;
  overviewEventIds: number[];
  navTabs: NavTab[];
  activeTab: NavTab;
}

export function resolveLeagueView(league: League | null, events: Event[], slug: string, tab: string | undefined): LeagueView {
  const slugParts = parseLeagueSlug(slug);

  const years = [...new Set(events.filter((e) => e.year != null).map((e) => e.year!))].sort((a, b) => b - a);
  const activeYear = events.find((e) => e.is_active)?.year ?? null;
  const effectiveYear = slugParts?.year ?? activeYear ?? years[0] ?? null;

  const stagesForYear = events
    .filter((e) => e.year === effectiveYear)
    .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? '') || a.id - b.id);

  // Group Worlds sub-stages (Play-In / Swiss / Knockout) under the Main Event.
  // NOTE: Regular-split " Playoffs" and LCK "Road to MSI" (its playoff) are
  // intentionally NOT grouped — they stay as standalone, selectable stages.
  const childIds = new Set<number>();
  const parentToChildren = new Map<number, SubStage[]>();

  if (league?.short_name === 'MSI') {
    for (const event of stagesForYear) {
      if (!parentToChildren.has(event.id)) parentToChildren.set(event.id, []);
      parentToChildren.get(event.id)!.push(
        { label: 'Play-In', event, tabPrefix: 'Play-In', stageOnly: true },
        { label: 'Knockout', event, tabPrefix: 'Bracket', tabFilter: ['Finals'], stageOnly: true },
      );
    }
  }

  if (league?.short_name === 'Worlds') {
    const mainEvent = stagesForYear.find((s) => s.name.includes('Main Event'));
    const playInEvent = stagesForYear.find((s) => s.name.includes('Play-In'));
    if (mainEvent) {
      if (!parentToChildren.has(mainEvent.id)) parentToChildren.set(mainEvent.id, []);
      const children = parentToChildren.get(mainEvent.id)!;
      if (playInEvent) {
        childIds.add(playInEvent.id);
        children.push({ label: 'Play-In', event: playInEvent, stageOnly: true });
      }
      children.push({ label: 'Swiss Stage', event: mainEvent, swiss: true, stageOnly: true });
      children.push({ label: 'Knockout', event: mainEvent, tabFilter: ['Quarterfinals', 'Semifinals', 'Finals'], stageOnly: true });
    }
  }

  // For regular events that carry multiple EventStages (e.g. Regular Season +
  // Playoffs), surface non-league stages as selectable sub-stage nav tabs so
  // the bracket can be reached without a separate dropdown entry. A "Regular
  // Season" standings entry is prepended so the nav reads: Regular Season → Playoffs.
  for (const event of stagesForYear) {
    if (!event.stages?.length) continue;
    for (const stage of event.stages) {
      if (stage.type !== 'playoff' && stage.type !== 'swiss' && stage.type !== 'play_in') continue;
      const label = stage.name; // e.g. "Playoffs", "Qualifying Series"
      if (!parentToChildren.has(event.id)) parentToChildren.set(event.id, []);
      const existing = parentToChildren.get(event.id)!;
      if (!existing.some((ss) => ss.isStandings)) {
        existing.push({ label: 'Regular Season', event, stageOnly: true, isStandings: true });
      }
      if (!existing.some((ss) => ss.label === label)) {
        existing.push({ label, event, stageId: stage.id, stageOnly: true });
      }
    }
  }

  const parentStages = stagesForYear.filter((e) => !childIds.has(e.id));

  // Always resolve to a parent event — child URLs redirect to their parent.
  let effectiveEvent: Event | null;
  if (!slugParts?.stagePart) {
    const today = new Date().toISOString().slice(0, 10);
    const weekAhead = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

    const isActive = (e: Event) =>
      e.is_active || parentToChildren.get(e.id)?.some((ss) => ss.event.is_active);
    // parentStages is sorted ascending by start_date, so the last event that has
    // already started is the most recently concluded/ongoing one.
    const latestStarted = [...parentStages].reverse().find((e) => e.start_date && e.start_date <= today);
    // The soonest event still in the future.
    const nextUpcoming = parentStages.find((e) => e.start_date && e.start_date > today);

    effectiveEvent =
      parentStages.find(isActive) ??
      // Hold on the latest event through the gap; only switch to the next one
      // once it's within a week of kicking off.
      (nextUpcoming && nextUpcoming.start_date! <= weekAhead ? nextUpcoming : null) ??
      latestStarted ??
      nextUpcoming ??
      parentStages[parentStages.length - 1] ??
      null;
  } else if (!league || !effectiveYear) {
    effectiveEvent = parentStages[parentStages.length - 1] ?? null;
  } else {
    effectiveEvent =
      parentStages.find((e) => getEventStagePart(league, effectiveYear, e, stagesForYear) === slugParts.stagePart)
      ?? parentStages[parentStages.length - 1]
      ?? null;
  }

  const subStages = effectiveEvent ? (parentToChildren.get(effectiveEvent.id) ?? []) : [];
  const activeEventId = effectiveEvent?.id ?? null;

  const overviewEventIds = activeEventId === null
    ? []
    : [...new Set([activeEventId, ...subStages.map((ss) => ss.event.id)])];

  const isInternational = NO_STANDINGS.has(league?.short_name ?? '');
  const navTabs: NavTab[] = ['Overview'];
  for (const ss of subStages) if (!ss.stageOnly) navTabs.push(ss.label);
  navTabs.push('Matches');
  if (!isInternational) navTabs.push('Team Stats');
  navTabs.push('Players', 'Champions');

  let activeTab: NavTab = 'Overview';
  if (tab) {
    const lower = tab.toLowerCase();
    if (PATH_TO_STATIC[lower]) activeTab = PATH_TO_STATIC[lower];
    else {
      const ss = subStages.find((s) => slugify(s.label) === lower);
      if (ss) activeTab = ss.label;
    }
  }

  return {
    years, effectiveYear, stagesForYear, parentStages, effectiveEvent,
    subStages, activeEventId, overviewEventIds, navTabs, activeTab,
  };
}

export interface BracketNeed {
  eventId: number;
  stageId?: number;
}

export const bracketKey = (eventId: number, stageId?: number | null) =>
  `${eventId}:${stageId ?? ''}`;

// Every bracket match set the active tab can display, including client-side
// switches (Stages picker sub-stages, Overview playoff stages), so the loader
// can preload them all.
export function bracketNeeds(view: LeagueView): BracketNeed[] {
  const { activeTab, subStages, effectiveEvent, activeEventId } = view;
  if (activeEventId == null) return [];

  const needs: BracketNeed[] = [];
  const add = (eventId: number, stageId?: number) => {
    if (!needs.some((n) => n.eventId === eventId && n.stageId === stageId)) {
      needs.push({ eventId, stageId });
    }
  };

  if (activeTab === 'Overview') {
    // EventStage-based brackets (regular leagues with playoff stages).
    for (const s of effectiveEvent?.stages ?? []) {
      if (s.type === 'playoff') add(activeEventId, s.id);
    }
    // SubStage-based brackets (international events: MSI, Worlds).
    for (const ss of subStages.filter((s) => s.stageOnly && !s.isStandings)) {
      add(ss.event.id, ss.swiss ? undefined : ss.stageId);
    }
    return needs;
  }

  if (activeTab === 'Stages') {
    const stageOnly = subStages.filter((ss) => ss.stageOnly && !ss.isStandings);
    // No sub-stages → the picker falls back to a single bracket on the event.
    if (!stageOnly.length) { add(activeEventId); return needs; }
    // Swiss / tab-filtered stages read the whole event's matches (no stage id).
    for (const ss of stageOnly) add(ss.event.id, ss.swiss ? undefined : ss.stageId);
    return needs;
  }

  // A selectable sub-stage nav tab (e.g. "Playoffs").
  const ss = subStages.find((s) => !s.stageOnly && s.label === activeTab);
  if (ss) add(ss.event.id, ss.swiss ? undefined : ss.stageId);
  return needs;
}
