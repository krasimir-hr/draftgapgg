import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useReducer, useMemo } from 'react';
import { getLeagues, getEvents, getEventStandings, getEventRosters } from '../api/core';
import type { League, Event, StandingsEntry } from '../types/models';
import Spinner from '../components/Spinner';
import OverviewTab from '../components/league/OverviewTab';
import MatchesTab from '../components/league/MatchesTab';
import StandingsTab from '../components/league/StandingsTab';
import PlayersTab from '../components/league/PlayersTab';
import ChampsTab from '../components/league/ChampsTab';
import BracketTab from '../components/league/BracketTab';
import { useDrawer } from '../contexts/DrawerContext';
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

const STATIC_TABS = ['Overview', 'Matches', 'Standings', 'Players', 'Champions'] as const;
type StaticTab = typeof STATIC_TABS[number];
type NavTab = StaticTab | string;

const STATIC_TAB_PATH: Record<StaticTab, string> = {
  Overview: '', Matches: 'matches', Standings: 'standings', Players: 'players', Champions: 'champions',
};
const PATH_TO_STATIC: Record<string, StaticTab> = {
  matches: 'Matches', standings: 'Standings', players: 'Players', champions: 'Champions',
};

const LEAGUE_REGION: Record<string, { label: string; flag: string }> = {
  LCK:   { label: 'Korea',   flag: '🇰🇷' },
  LPL:   { label: 'China',   flag: '🇨🇳' },
  LEC:   { label: 'Europe',  flag: '🇪🇺' },
  LCS:   { label: 'NA',      flag: '🇺🇸' },
  CBLoL: { label: 'Brazil',  flag: '🇧🇷' },
  LCP:   { label: 'Pacific', flag: '🌏' },
};

const LEAGUE_COLOR: Record<string, string> = {
  LCK:   '#a78bfa',
  LPL:   '#dc2626',
  LEC:   '#3b82f6',
  LCS:   '#06b6d4',
  CBLoL: '#10b981',
  LCP:   '#f59e0b',
};


export default function LeagueDetailPage() {
  const { slug = '', tab } = useParams<{ slug: string; tab?: string }>();
  const navigate = useNavigate();
  const { openMatch } = useDrawer();

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

  // ── Group child events under their parents (before effectiveEvent so we can prefer parents) ──
  const { childIds, parentToChildren } = useMemo(() => {
    const childIds = new Set<number>();
    const parentToChildren = new Map<number, { label: string; event: Event }[]>();

    for (const stage of stagesForYear) {
      if (stage.name.endsWith(' Playoffs')) {
        const parent = stagesForYear.find((s) => s.name === stage.name.slice(0, -' Playoffs'.length));
        if (parent) {
          childIds.add(stage.id);
          if (!parentToChildren.has(parent.id)) parentToChildren.set(parent.id, []);
          parentToChildren.get(parent.id)!.push({ label: 'Playoffs', event: stage });
        }
      }
      if (stage.name.includes('Road to MSI')) {
        const parent = stagesForYear.find((s) => s.name.includes('Rounds 1-2'));
        if (parent) {
          childIds.add(stage.id);
          if (!parentToChildren.has(parent.id)) parentToChildren.set(parent.id, []);
          parentToChildren.get(parent.id)!.push({ label: 'Road to MSI', event: stage });
        }
      }
    }
    return { childIds, parentToChildren };
  }, [stagesForYear]);

  const parentStages = useMemo(
    () => stagesForYear.filter((e) => !childIds.has(e.id)),
    [stagesForYear, childIds],
  );

  // Always resolve to a parent event — child URLs redirect to their parent
  const effectiveEvent = useMemo(() => {
    const parents = parentStages;
    if (!slugParts?.stagePart) {
      const today = new Date().toISOString().slice(0, 10);
      return (
        parents.find((e) => e.is_active || parentToChildren.get(e.id)?.some((ss) => ss.event.is_active)) ??
        parents.find((e) => e.start_date && e.start_date > today) ??
        parents[parents.length - 1] ??
        null
      );
    }
    if (!league || !effectiveYear) return parents[parents.length - 1] ?? null;
    return (
      parents.find((e) => getEventStagePart(league, effectiveYear, e, stagesForYear) === slugParts.stagePart)
      ?? parents[parents.length - 1]
      ?? null
    );
  }, [parentStages, slugParts?.stagePart, league, effectiveYear, stagesForYear]);

  const subStages = useMemo(
    () => effectiveEvent ? (parentToChildren.get(effectiveEvent.id) ?? []) : [],
    [effectiveEvent, parentToChildren],
  );

  const activeEventId = effectiveEvent?.id ?? null;

  // ── Once resolved, redirect partial URLs to full slug ──
  useEffect(() => {
    if (resolving || !league || !effectiveEvent || !effectiveYear) return;
    const fullSlug = buildLeagueSlug(league, effectiveYear, effectiveEvent, stagesForYear);
    if (fullSlug !== slug) {
      navigate(`/leagues/${fullSlug}${tab ? `/${tab}` : ''}`, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolving, league, effectiveEvent, effectiveYear]);

  // ── Dynamic tab list: Overview · [Playoffs/Road to MSI] · Matches · Standings · Players · Champions ──
  const navTabs: NavTab[] = useMemo(() => {
    const result: NavTab[] = ['Overview'];
    for (const ss of subStages) result.push(ss.label);
    result.push('Matches', 'Standings', 'Players', 'Champions');
    return result;
  }, [subStages]);

  const activeTab: NavTab = useMemo(() => {
    if (!tab) return 'Overview';
    const lower = tab.toLowerCase();
    if (PATH_TO_STATIC[lower]) return PATH_TO_STATIC[lower];
    const ss = subStages.find((s) => slugify(s.label) === lower);
    if (ss) return ss.label;
    return 'Overview';
  }, [tab, subStages]);

  // ── Team logos / names ──
  const [teamLogos, setTeamLogos] = useState<Record<string, string | null>>({});
  const [teamShortNames, setTeamShortNames] = useState<Record<string, string>>({});
  const [standingsState, dispatchStandings] = useReducer(standingsReducer, { loading: false, error: null, list: [] });

  useEffect(() => {
    if (activeEventId === null) return;
    getEventRosters(activeEventId).then((res) => {
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
  }, [activeEventId]);

  useEffect(() => {
    if (activeEventId === null) return;
    dispatchStandings({ type: 'fetch' });
    getEventStandings(activeEventId)
      .then((res) => dispatchStandings({ type: 'success', list: res.data }))
      .catch(() => dispatchStandings({ type: 'error', message: 'Failed to load standings' }));
  }, [activeEventId]);

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

  // ── Render ──
  if (resolving) return <Spinner />;
  if (resolveError || !league) return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <p className="text-sm" style={{ color: 'var(--red)' }}>{resolveError ?? 'Not found'}</p>
    </div>
  );

  const leagueLabel = league.short_name ?? league.name;
  const activeStageName = effectiveEvent ? getStageName(effectiveEvent.name, stagesForYear) : '';
  const leagueColor = LEAGUE_COLOR[leagueLabel] ?? 'var(--accent)';

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Hero card */}
      <div
        className="card card-xl card-soft-shadow overflow-hidden mb-6"
        style={{ borderRadius: 16 }}
      >
        <div className="flex items-center gap-4 px-7 py-6 flex-wrap">
          <div className="flex items-center justify-center shrink-0" style={{ width: 80, height: 80 }}>
            {league.logo ? (
              <img
                src={league.logo}
                alt={leagueLabel}
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
              {leagueLabel}{effectiveYear ? ` Season ${effectiveYear}` : ''}
            </h1>
            {activeStageName && (
              <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--accent-2)', fontWeight: 500 }}>
                {activeStageName}
              </div>
            )}
          </div>

        </div>

        <HeroBottomBar
          league={league}
          event={effectiveEvent}
          subStages={subStages}
          years={years}
          effectiveYear={effectiveYear}
          stagesForYear={parentStages}
          activeEventId={activeEventId}
          onYearSelect={handleYearSelect}
          onEventSelect={handleEventSelect}
        />

        <div className="section-tabs border-t border-(--border)" style={{ padding: '0 14px', borderBottomWidth: 0 }}>
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
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-(--text-dim) py-6">No editions found.</p>
      ) : activeEventId === null ? null : (
        <>
          {activeTab === 'Overview' && (
            <OverviewTab
              eventId={activeEventId}
              teamLogos={teamLogos}
              teamShortNames={teamShortNames}
              onMatchSelect={handleMatchSelect}
              onViewAllMatches={() => handleTabSelect('Matches')}
            />
          )}
          {subStages.map((ss) => activeTab === ss.label && (
            <BracketTab
              key={ss.event.id}
              eventId={ss.event.id}
              teamLogos={teamLogos}
              teamShortNames={teamShortNames}
              onMatchSelect={handleMatchSelect}
            />
          ))}
          {activeTab === 'Matches' && (
            <MatchesTab
              eventId={activeEventId}
              teamLogos={teamLogos}
              teamShortNames={teamShortNames}
              onMatchSelect={handleMatchSelect}
            />
          )}
          {activeTab === 'Standings' && (
            <div className="card overflow-hidden">
              <StandingsTab loading={standingsState.loading} error={standingsState.error} list={standingsState.list} />
            </div>
          )}
          {activeTab === 'Players' && (
            <PlayersTab
              eventId={activeEventId}
              teamLogos={teamLogos}
              teamShortNames={teamShortNames}
            />
          )}
          {activeTab === 'Champions' && (
            <ChampsTab eventId={activeEventId} />
          )}
        </>
      )}
    </div>
  );
}



function formatDMY(dateStr: string | null): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}-${m}-${y}`;
}

function HeroBottomBar({
  league, event, subStages, years, effectiveYear, stagesForYear, activeEventId, onYearSelect, onEventSelect,
}: {
  league: League | null;
  event: Event | null;
  subStages: { label: string; event: Event }[];
  years: number[];
  effectiveYear: number | null;
  stagesForYear: Event[];
  activeEventId: number | null;
  onYearSelect: (y: number) => void;
  onEventSelect: (id: number) => void;
}) {
  const region = league?.short_name ? LEAGUE_REGION[league.short_name] : null;
  const allEndDates = [event?.end_date, ...subStages.map((ss) => ss.event.end_date)].filter(Boolean) as string[];
  const effectiveEndDate = allEndDates.length > 0 ? allEndDates.reduce((a, b) => (a > b ? a : b)) : null;
  const dateRange = [formatDMY(event?.start_date ?? null), formatDMY(effectiveEndDate)]
    .filter(Boolean).join(' – ');

  const socialLinks: { label: string; href: string; icon: React.ReactNode }[] = [];
  if (league?.youtube)   socialLinks.push({ label: 'YouTube',   href: league.youtube,   icon: <IconYouTube /> });
  if (league?.twitter)   socialLinks.push({ label: 'Twitter',   href: league.twitter,   icon: <IconTwitter /> });
  if (league?.instagram) socialLinks.push({ label: 'Instagram', href: league.instagram, icon: <IconInstagram /> });
  if (league?.twitch)    socialLinks.push({ label: 'Twitch',    href: league.twitch,    icon: <IconTwitch /> });

  const dot = <span style={{ color: 'var(--border-strong)', fontSize: 10, margin: '0 8px' }}>·</span>;

  return (
    <div
      className="flex items-center"
      style={{ borderTop: '1px solid var(--border)', padding: '9px 20px 9px 28px' }}
    >
      {/* Left: region · dates · socials */}
      <div className="flex items-center">
        {region && (
          <div className="flex items-center" style={{ gap: 5 }}>
            <span style={{ fontSize: 14, lineHeight: 1 }}>{region.flag}</span>
            <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-dim)' }}>{region.label}</span>
          </div>
        )}

        {dateRange && (
          <>
            {dot}
            <span style={{ fontSize: 11.5, color: 'var(--text-dim)', fontWeight: 500, letterSpacing: '0.01em' }}>
              {dateRange}
            </span>
          </>
        )}

        {socialLinks.length > 0 && (
          <>
            {dot}
            <div className="flex items-center" style={{ gap: 1 }}>
              {socialLinks.map(({ label, href, icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 24, height: 24, borderRadius: 5,
                    color: 'var(--text-faint)', transition: 'color 0.15s, background 0.15s',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-h)';
                    (e.currentTarget as HTMLAnchorElement).style.background = 'var(--surface-sub)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-faint)';
                    (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
                  }}
                >
                  {icon}
                </a>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Right: selectors */}
      <div className="flex items-center gap-2 ml-auto">
        {years.length > 0 && (
          <select className="field-select" value={effectiveYear ?? ''} onChange={(e) => onYearSelect(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
        {stagesForYear.length > 1 && (
          <select className="field-select" value={activeEventId ?? ''} onChange={(e) => onEventSelect(Number(e.target.value))}>
            {stagesForYear.map((e) => (
              <option key={e.id} value={e.id}>{getStageName(e.name, stagesForYear)}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function IconYouTube() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z" />
    </svg>
  );
}

function IconTwitter() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function IconInstagram() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  );
}

function IconTwitch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
    </svg>
  );
}
