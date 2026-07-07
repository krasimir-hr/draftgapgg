import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import type React from 'react';
import type { ReactNode } from 'react';
import { getMatches, getEventRosters, getEvent, patchMatchBracket } from '../../api/core';
import type { Match } from '../../types/models';
import { TeamMark } from './shared';

interface Props {
  eventId: number;
  stageId?: number;
  tabFilter?: string[];
  tabPrefix?: string;
  teamLogos: Record<string, string | null>;
  teamShortNames?: Record<string, string>;
  onMatchSelect: (id: number) => void;
  noBorder?: boolean;
  // When preloaded, the parent also supplies merged rosters and the event name.
  preloadedMatches?: Match[];
  eventName?: string;
}

interface State { loading: boolean; error: string | null; matches: Match[] }
type Action =
  | { type: 'fetch' }
  | { type: 'success'; matches: Match[] }
  | { type: 'error'; message: string };

function reducer(_s: State, a: Action): State {
  switch (a.type) {
    case 'fetch':   return { loading: true, error: null, matches: [] };
    case 'success': return { loading: false, error: null, matches: a.matches };
    case 'error':   return { loading: false, error: a.message, matches: [] };
  }
}


type Band = 'upper' | 'lower' | 'final';
interface Edge { from: Match; to: Match }

// Layout constants (px)
const CARD_H = 96;
const ROW_GAP = 32;    // vertical space between stacked cards; also where the meta pill sits
const SLOT = CARD_H + ROW_GAP;
const COL_GAP = 48;    // inter-column gap at full width; shrinks with the column
const MIN_COL_W = 96;  // hard floor per column; only below this does the canvas scroll sideways
const LABEL_W = 34;
const BAND_GAP = 56;
const HEADER_H = 52;   // round-label strip + clearance above the first row's meta pill

/** Elbow connector with rounded corners. */
function elbowPath(x1: number, y1: number, x2: number, y2: number, r = 9): string {
  if (Math.abs(y2 - y1) < 1) return `M ${x1} ${y1} H ${x2}`;
  const midX = (x1 + x2) / 2;
  const dir = y2 > y1 ? 1 : -1;
  const rr = Math.min(r, Math.abs(y2 - y1) / 2, Math.max(midX - x1, 1));
  return [
    `M ${x1} ${y1}`,
    `H ${midX - rr}`,
    `Q ${midX} ${y1} ${midX} ${y1 + dir * rr}`,
    `V ${y2 - dir * rr}`,
    `Q ${midX} ${y2} ${midX + rr} ${y2}`,
    `H ${x2}`,
  ].join(' ');
}

function formatMatchDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  // 24h keeps the pill compact enough to fit a bracket card with " · BO5" appended.
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} · ${time}`;
}

interface Built {
  colOrder: number[];              // sorted list of unique bracket_col values (layout indices)
  finals: Match[];
  hasLower: boolean;
  bandOf: Map<number, Band>;
  colOf: Map<number, number>;        // matchId → index in colOrder
  upperByCol: Map<number, Match[]>;
  lowerByCol: Map<number, Match[]>;
  edges: Edge[];
}

/**
 * Build bracket layout from admin-set fields:
 *   bracket_col    → which column (1, 2, 3…); falls back to tab grouping if unset
 *   bracket_order  → vertical slot within the column (1 = top)
 *   is_lower_bracket → upper vs lower band
 *   next_match     → connector lines between matches
 */
function buildBracket(matches: Match[]): Built {
  const bandOf = new Map<number, Band>();
  for (const m of matches) {
    bandOf.set(m.id, m.is_lower_bracket ? 'lower' : 'upper');
  }

  // Collect unique bracket_col values; fall back to tab grouping for unset matches.
  const seenCols = new Set<number>();
  for (const m of matches) {
    if (m.bracket_col != null) seenCols.add(m.bracket_col);
  }
  const tabToPseudo = new Map<string, number>();
  let nextPseudo = (seenCols.size ? Math.max(...seenCols) : 0) + 1;
  for (const m of matches) {
    if (m.bracket_col == null) {
      const key = m.tab || 'Stage 1';
      if (!tabToPseudo.has(key)) {
        tabToPseudo.set(key, nextPseudo);
        seenCols.add(nextPseudo);
        nextPseudo++;
      }
    }
  }

  const colOrder = [...seenCols].sort((a, b) => a - b);

  const colOf = new Map<number, number>();
  const upperByCol = new Map<number, Match[]>();
  const lowerByCol = new Map<number, Match[]>();
  for (const m of matches) {
    const rawCol = m.bracket_col ?? tabToPseudo.get(m.tab || 'Stage 1')!;
    const idx = colOrder.indexOf(rawCol);
    colOf.set(m.id, idx);
    const target = m.is_lower_bracket ? lowerByCol : upperByCol;
    if (!target.has(idx)) target.set(idx, []);
    target.get(idx)!.push(m);
  }

  for (const ms of [...upperByCol.values(), ...lowerByCol.values()]) {
    if (ms.every((m) => m.bracket_order != null)) {
      ms.sort((a, b) => (a.bracket_order ?? 0) - (b.bracket_order ?? 0));
    }
  }

  const hasLower = lowerByCol.size > 0;
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const edges: Edge[] = [];
  for (const m of matches) {
    if (m.next_match == null) continue;
    const to = matchById.get(m.next_match);
    if (to) edges.push({ from: m, to });
  }

  return { colOrder, finals: [], hasLower, bandOf, colOf, upperByCol, lowerByCol, edges };
}

/**
 * Assign a vertical position to each match in a band.
 * Returns y positions AND the set of column indices that were placed with fixed
 * ordering (bracket_order or first-column) — those are centered by the caller.
 */
function layoutBand(byCol: Map<number, Match[]>, feeders: Map<number, number[]>): {
  y: Map<number, number>; height: number; fixedCols: Set<number>;
} {
  const y = new Map<number, number>();
  const cols = [...byCol.keys()].sort((a, b) => a - b);
  const fixedCols = new Set<number>();
  let first = true;

  for (const col of cols) {
    const ms = byCol.get(col)!;

    if (ms.every((m) => m.bracket_order != null) || first) {
      ms.forEach((m, i) => y.set(m.id, i * SLOT));
      fixedCols.add(col);
      first = false;
      continue;
    }

    // Feeder-based: center on the midpoint of this match's in-band sources.
    const items = ms.map((m) => {
      const fy = (feeders.get(m.id) ?? []).filter((id) => y.has(id)).map((id) => y.get(id)!);
      return { m, d: fy.length ? fy.reduce((s, v) => s + v, 0) / fy.length : null as number | null };
    });
    let last = 0;
    for (const it of items) { if (it.d == null) it.d = last; else last = it.d; }
    items.sort((a, b) => (a.d! - b.d!));
    let prev = -Infinity;
    for (const it of items) {
      const yy = Math.max(it.d!, prev + SLOT);
      y.set(it.m.id, yy);
      prev = yy;
    }
  }

  let height = 0;
  for (const v of y.values()) height = Math.max(height, v + CARD_H);
  return { y, height, fixedCols };
}

/**
 * After the band height is known, shift each fixed-order column so its block
 * is vertically centered within the full band height.
 * Feeder-based columns are intentionally skipped — they're already anchored to
 * their source matches in earlier columns.
 */
function centerColsInBand(
  y: Map<number, number>,
  byCol: Map<number, Match[]>,
  bandHeight: number,
  fixedCols: Set<number>,
) {
  for (const [col, ms] of byCol) {
    if (!fixedCols.has(col) || !ms.length) continue;
    const ys = ms.map((m) => y.get(m.id)!);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys) + CARD_H;
    const shift = (bandHeight - (maxY - minY)) / 2 - minY;
    if (Math.abs(shift) > 0.5) {
      for (const m of ms) y.set(m.id, y.get(m.id)! + shift);
    }
  }
}

export default function BracketTab({ eventId, stageId, tabFilter, tabPrefix, teamLogos, teamShortNames, onMatchSelect, noBorder, preloadedMatches, eventName }: Props) {
  const [state, dispatch] = useReducer(
    reducer,
    preloadedMatches != null
      ? { loading: false, error: null, matches: preloadedMatches }
      : { loading: true, error: null, matches: [] },
  );
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [ownLogos, setOwnLogos] = useState<Record<string, string | null>>({});
  const [ownShorts, setOwnShorts] = useState<Record<string, string>>({});
  const [ownEventName, setOwnEventName] = useState<string | null>(null);
  // Mobile shows one round at a time (a full bracket crushes cards below ~96px);
  // desktop keeps the fit-to-width canvas. See the round selector below.
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
  );
  const [activeRound, setActiveRound] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Rosters + event name (skipped when preloaded).
  useEffect(() => {
    if (preloadedMatches != null) return;
    getEvent(eventId)
      .then((res) => setOwnEventName(res.data.name))
      .catch(() => {});
    getEventRosters(eventId).then((res) => {
      const logos: Record<string, string | null> = {};
      const shorts: Record<string, string> = {};
      for (const r of res.data.results) {
        if (!r.name) continue;
        logos[r.name] = r.org?.logo ?? null;
        if (r.org?.short_name) shorts[r.name] = r.org.short_name;
      }
      setOwnLogos(logos);
      setOwnShorts(shorts);
    }).catch(() => {});
  }, [eventId, preloadedMatches]);

  const displayName = preloadedMatches != null ? (eventName ?? null) : ownEventName;

  useEffect(() => {
    if (preloadedMatches != null) {
      dispatch({ type: 'success', matches: preloadedMatches });
      return;
    }
    dispatch({ type: 'fetch' });
    const matchParams: Record<string, string | number> = { event: eventId, page_size: 100 };
    if (stageId != null) matchParams.stage = stageId;
    getMatches(matchParams)
      .then((res) => dispatch({ type: 'success', matches: res.data.results }))
      .catch(() => dispatch({ type: 'error', message: 'Failed to load bracket' }));
  }, [eventId, stageId, preloadedMatches]);

  const logos = useMemo(() => ({ ...teamLogos, ...ownLogos }), [teamLogos, ownLogos]);
  const shorts = useMemo(() => ({ ...teamShortNames, ...ownShorts }), [teamShortNames, ownShorts]);

  // Callback ref so the observer (re)attaches whenever the container mounts —
  // the loading spinner unmounts it, so a plain mount-only effect would miss it.
  useLayoutEffect(() => {
    if (!containerEl) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(containerEl);
    setWidth(containerEl.clientWidth);
    return () => ro.disconnect();
  }, [containerEl]);

  const visibleMatches = useMemo(
    () => {
      if (!tabFilter?.length && !tabPrefix) return state.matches;
      return state.matches.filter((m) =>
        (tabFilter?.includes(m.tab) ?? false) || (tabPrefix ? m.tab.startsWith(tabPrefix) : false),
      );
    },
    [state.matches, tabFilter, tabPrefix],
  );

  const built = useMemo(() => buildBracket(visibleMatches), [visibleMatches]);

  // Keep the selected mobile round in range as data loads / filters change.
  useEffect(() => {
    setActiveRound((r) => Math.min(r, Math.max(0, built.colOrder.length - 1)));
  }, [built.colOrder.length]);

  // Human-friendly column titles: "Grand Final" for is_final columns, and for
  // plain single-elim shapes name the tail rounds; everything else is Round N.
  const roundLabels = useMemo(() => {
    const { colOrder, upperByCol, lowerByCol, hasLower } = built;
    const n = colOrder.length;
    const finalCols = new Set<number>();
    for (const [idx, ms] of [...upperByCol, ...lowerByCol]) {
      if (ms.some((m) => m.is_final)) finalCols.add(idx);
    }
    const labels = Array.from({ length: n }, (_, i) =>
      finalCols.has(i) ? 'Grand Final' : `Round ${i + 1}`,
    );
    if (!hasLower && finalCols.size === 0) {
      const count = (i: number) => upperByCol.get(i)?.length ?? 0;
      if (n >= 1 && count(n - 1) === 1) {
        labels[n - 1] = 'Final';
        if (n >= 2 && count(n - 2) === 2) {
          labels[n - 2] = 'Semifinals';
          if (n >= 3 && count(n - 3) === 4) labels[n - 3] = 'Quarterfinals';
        }
      }
    }
    return labels;
  }, [built]);

  const layout = useMemo(() => {
    const { colOrder, finals, hasLower, colOf, upperByCol, lowerByCol, edges } = built;
    const nCols = colOrder.length + (finals.length ? 1 : 0);
    if (!width || !nCols) return null;

    const labelW = hasLower ? LABEL_W : 0;
    // Fit the whole bracket in the visible width by shrinking columns as more of
    // them appear, so a many-round bracket doesn't spill off the edge. Only once
    // a column would drop below MIN_COL_W do we stop shrinking and let the canvas
    // scroll sideways (rare — most brackets fit).
    const layoutWidth = Math.max(width, labelW + nCols * MIN_COL_W);
    const colW = (layoutWidth - labelW) / nCols;
    // The gap (room for connector elbows) scales with the column so narrow
    // columns keep as much card width as possible.
    const colGap = Math.min(COL_GAP, Math.max(16, colW * 0.22));
    const cardW = Math.max(colW - colGap, 80);
    const xOf = (col: number) => labelW + col * colW + (colW - cardW) / 2;

    // In-band feeders for vertical alignment.
    const upperFeeders = new Map<number, number[]>();
    const lowerFeeders = new Map<number, number[]>();
    for (const e of edges) {
      const bf = built.bandOf.get(e.from.id);
      const bt = built.bandOf.get(e.to.id);
      if (bf !== bt) continue;
      const target = bf === 'upper' ? upperFeeders : bf === 'lower' ? lowerFeeders : null;
      if (!target) continue;
      if (!target.has(e.to.id)) target.set(e.to.id, []);
      target.get(e.to.id)!.push(e.from.id);
    }

    const upper = layoutBand(upperByCol, upperFeeders);
    const lower = hasLower ? layoutBand(lowerByCol, lowerFeeders) : { y: new Map<number, number>(), height: 0, fixedCols: new Set<number>() };

    // Center every fixed-order column within its band.
    centerColsInBand(upper.y, upperByCol, upper.height, upper.fixedCols);
    if (hasLower) centerColsInBand(lower.y, lowerByCol, lower.height, lower.fixedCols);

    const lowerOffset = upper.height + (hasLower ? BAND_GAP : 0);
    const totalHeight = (hasLower ? lowerOffset + lower.height : upper.height) || CARD_H;

    const yOf = new Map<number, number>();
    for (const [id, v] of upper.y) yOf.set(id, v);
    for (const [id, v] of lower.y) yOf.set(id, v + lowerOffset);

    // Finals: matches explicitly marked is_final are centered on the full bracket
    // height regardless of which band they're in, so they appear between both bands.
    const finalMs = [...upperByCol.values(), ...lowerByCol.values()]
      .flat()
      .filter((m) => m.is_final);
    if (finalMs.length > 0) {
      // Extra spacing between stacked finals so the meta pill above the lower
      // card doesn't collide with the card above it.
      const FINAL_GAP = 42;
      const blockH = finalMs.length * CARD_H + Math.max(finalMs.length - 1, 0) * FINAL_GAP;
      const startY = (totalHeight - blockH) / 2;
      finalMs.forEach((m, i) => yOf.set(m.id, startY + i * (CARD_H + FINAL_GAP)));
    }

    const finalsBlockH = finals.length * CARD_H + Math.max(finals.length - 1, 0) * ROW_GAP;
    const finalsStart = (totalHeight - finalsBlockH) / 2;
    finals.forEach((f, i) => yOf.set(f.id, finalsStart + i * SLOT));

    const posOf = (m: Match) => ({ x: xOf(colOf.get(m.id)!), y: yOf.get(m.id)! });

    return { colW, cardW, labelW, layoutWidth, xOf, yOf, posOf, totalHeight, upperHeight: upper.height, lowerOffset };
  }, [built, width]);

  if (state.loading) return <div className="py-10 flex items-center justify-center"><div className="spinner" /></div>;
  if (state.error)   return <p className="text-sm px-6 py-6" style={{ color: 'var(--red)' }}>{state.error}</p>;

  const empty = !built.colOrder.length && !built.finals.length;

  const allMatches: Match[] = [
    ...[...built.upperByCol.values()].flat(),
    ...[...built.lowerByCol.values()].flat(),
    ...built.finals,
  ];

  // The single match that crowns the champion: the latest decided final that
  // doesn't feed another match. (Road-to-MSI style brackets flag several
  // matches is_final — only one gets the chip.)
  const championMatchId = (() => {
    const finals = allMatches.filter((m) => m.is_final && m.winner !== null && m.next_match == null);
    if (!finals.length) return null;
    finals.sort((a, b) => (a.datetime_utc ?? '').localeCompare(b.datetime_utc ?? ''));
    return finals[finals.length - 1].id;
  })();

  return (
    <div className={noBorder ? undefined : 'card card-soft-shadow'} style={{ borderRadius: 14, padding: '16px 12px 20px' }}>
      {displayName && (
        <h2
          className="font-sans"
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: 'var(--text-dim)',
            letterSpacing: '0.13em',
            textTransform: 'uppercase',
            marginBottom: 14,
            padding: '0 6px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {displayName}
        </h2>
      )}
      {editingMatch && (
        <BracketMatchEditor
          match={editingMatch}
          allMatches={state.matches}
          onSave={(updated) => {
            dispatch({ type: 'success', matches: state.matches.map((m) => m.id === updated.id ? updated : m) });
            setEditingMatch(null);
          }}
          onClose={() => setEditingMatch(null)}
        />
      )}
      <div ref={setContainerEl} style={{ position: 'relative', width: '100%' }}>
        {empty ? (
          <p className="text-sm text-(--text-dim) py-6 text-center">No bracket data yet.</p>
        ) : isMobile ? (
          <MobileBracket
            built={built}
            roundLabels={roundLabels}
            activeRound={Math.min(activeRound, Math.max(0, built.colOrder.length - 1))}
            onRoundChange={setActiveRound}
            teamLogos={logos}
            teamShortNames={shorts}
            championMatchId={championMatchId}
            hoveredTeam={hoveredTeam}
            onHover={setHoveredTeam}
            onMatchSelect={onMatchSelect}
            onEdit={setEditingMatch}
          />
        ) : !layout ? (
          <div style={{ height: 200 }} />
        ) : (
          <div className="es-scroll" style={{ overflowX: 'auto' }}>
            {/* Canvas: connectors + cards. Wider than the container on narrow
                viewports (see MIN_COL_W), in which case it scrolls sideways. */}
            <div style={{ position: 'relative', height: layout.totalHeight + HEADER_H + 34, width: layout.layoutWidth, minWidth: '100%' }}>
              {/* Alternating column stripes for scanability */}
              {built.colOrder.map((_, i) => i % 2 === 1 && (
                <div
                  key={`stripe-${i}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: layout.labelW + i * layout.colW + 4,
                    width: layout.colW - 8,
                    borderRadius: 12,
                    background: 'color-mix(in srgb, var(--surface-sub) 55%, transparent)',
                    pointerEvents: 'none',
                  }}
                />
              ))}

              {/* Round headers */}
              {built.colOrder.map((_, i) => (
                <div
                  key={`round-${i}`}
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: layout.xOf(i),
                    width: layout.cardW,
                    textAlign: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.13em',
                    textTransform: 'uppercase',
                    color: roundLabels[i] === 'Grand Final' ? 'var(--amber)' : 'var(--text-dim)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    pointerEvents: 'none',
                  }}
                >
                  {roundLabels[i]}
                </div>
              ))}

              {/* Band labels + divider */}
              {built.hasLower && (
                <>
                  <BandLabel text="Upper Bracket" top={HEADER_H} height={layout.upperHeight} />
                  <BandLabel text="Lower Bracket" top={HEADER_H + layout.lowerOffset} height={layout.totalHeight - layout.lowerOffset} />
                  <div
                    style={{
                      position: 'absolute',
                      left: 0, right: 0,
                      top: HEADER_H + layout.upperHeight + BAND_GAP / 2,
                      borderTop: '1px dashed var(--border-strong)',
                      opacity: 0.55,
                    }}
                  />
                </>
              )}

              {/* Connector lines. An edge lights up when the hovered team plays
                  in both endpoints (their path through the bracket); edges whose
                  source match is decided render solid, pending ones dashed. */}
              <svg
                width={layout.layoutWidth}
                height={layout.totalHeight + HEADER_H}
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
              >
                <g transform={`translate(0, ${HEADER_H})`}>
                  {[...built.edges]
                    .map((e) => {
                      const inMatch = (m: Match) => m.team1 === hoveredTeam || m.team2 === hoveredTeam;
                      const active = hoveredTeam != null && inMatch(e.from) && inMatch(e.to);
                      return { e, active };
                    })
                    .sort((a, b) => Number(a.active) - Number(b.active))
                    .map(({ e, active }, i) => {
                      const from = layout.posOf(e.from);
                      const to = layout.posOf(e.to);
                      const decided = e.from.winner !== null;
                      const dim = hoveredTeam != null && !active;
                      // Stacked matches in the same column (e.g. upper final →
                      // grand final) connect bottom-to-top instead of sideways.
                      const stacked = Math.abs(to.x - from.x) < 1;
                      const d = stacked
                        ? `M ${from.x + layout.cardW / 2} ${from.y + CARD_H} V ${to.y}`
                        : elbowPath(from.x + layout.cardW, from.y + CARD_H / 2, to.x, to.y + CARD_H / 2);
                      return (
                        <path
                          key={`${e.from.id}-${e.to.id}-${i}`}
                          d={d}
                          fill="none"
                          stroke={active ? 'var(--accent)' : 'var(--border-strong)'}
                          strokeWidth={active ? 2.25 : 1.5}
                          strokeDasharray={decided || active ? undefined : '3 5'}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={dim ? 0.25 : (decided || active ? 1 : 0.8)}
                          style={{ transition: 'stroke 0.15s, opacity 0.15s, stroke-width 0.15s' }}
                        />
                      );
                    })}
                </g>
              </svg>

              {/* Match cards */}
              {allMatches.map((m) => {
                const { x, y } = layout.posOf(m);
                return (
                  <div
                    key={m.id}
                    style={{
                      position: 'absolute',
                      left: x,
                      top: y + HEADER_H,
                      width: layout.cardW,
                      height: CARD_H,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <BracketCard
                      match={m}
                      teamLogos={logos}
                      teamShortNames={shorts}
                      hoveredTeam={hoveredTeam}
                      isChampionMatch={m.id === championMatchId}
                      onHover={setHoveredTeam}
                      onClick={() => onMatchSelect(m.id)}
                      onEdit={() => setEditingMatch(m)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Mobile bracket: one round at a time. A pill selector (with prev/next chevrons)
 * picks the round; matches render as a plain vertical stack of full-width cards,
 * grouped by band. Connector lines are dropped — they'd point off-screen.
 */
function MobileBracket({
  built, roundLabels, activeRound, onRoundChange,
  teamLogos, teamShortNames, championMatchId, hoveredTeam, onHover, onMatchSelect, onEdit,
}: {
  built: Built;
  roundLabels: string[];
  activeRound: number;
  onRoundChange: (i: number) => void;
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
  championMatchId: number | null;
  hoveredTeam: string | null;
  onHover: (team: string | null) => void;
  onMatchSelect: (id: number) => void;
  onEdit: (m: Match) => void;
}) {
  const nRounds = built.colOrder.length;
  const upperMs = built.upperByCol.get(activeRound) ?? [];
  const lowerMs = built.lowerByCol.get(activeRound) ?? [];

  const pillsRef = useRef<HTMLDivElement | null>(null);
  // Keep the active pill in view as the round changes (via chevrons or taps).
  useEffect(() => {
    const el = pillsRef.current?.querySelector<HTMLElement>(`[data-round="${activeRound}"]`);
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeRound]);

  const renderCard = (m: Match) => (
    <div key={m.id} style={{ position: 'relative' }}>
      <BracketCard
        match={m}
        teamLogos={teamLogos}
        teamShortNames={teamShortNames}
        hoveredTeam={hoveredTeam}
        isChampionMatch={m.id === championMatchId}
        onHover={onHover}
        onClick={() => onMatchSelect(m.id)}
        onEdit={() => onEdit(m)}
      />
    </div>
  );

  const chevron = (dir: -1 | 1) => {
    const target = activeRound + dir;
    const disabled = target < 0 || target >= nRounds;
    return (
      <button
        type="button"
        aria-label={dir < 0 ? 'Previous round' : 'Next round'}
        disabled={disabled}
        onClick={() => onRoundChange(target)}
        style={{
          flexShrink: 0,
          width: 30,
          height: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text-dim)',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.35 : 1,
          padding: 0,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ transform: dir < 0 ? undefined : 'scaleX(-1)' }}>
          <path d="M15 5 L8 12 L15 19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    );
  };

  return (
    <div>
      {/* Round selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        {chevron(-1)}
        <div
          ref={pillsRef}
          className="es-scroll"
          style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1, padding: '2px 0', scrollbarWidth: 'none' }}
        >
          {roundLabels.map((label, i) => {
            const active = i === activeRound;
            const isFinal = label === 'Grand Final' || label === 'Final';
            return (
              <button
                key={i}
                type="button"
                data-round={i}
                onClick={() => onRoundChange(i)}
                style={{
                  flexShrink: 0,
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: '1px solid',
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                  background: active ? 'var(--accent)' : 'var(--surface)',
                  color: active ? 'var(--bg)' : (isFinal ? 'var(--amber)' : 'var(--text-dim)'),
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        {chevron(1)}
      </div>

      {/* Active round's matches, stacked full-width */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 36, paddingTop: 24, paddingBottom: 8 }}>
        {upperMs.length > 0 && (
          <>
            {built.hasLower && <MobileBandLabel text="Upper Bracket" />}
            {upperMs.map(renderCard)}
          </>
        )}
        {lowerMs.length > 0 && (
          <>
            {built.hasLower && <MobileBandLabel text="Lower Bracket" />}
            {lowerMs.map(renderCard)}
          </>
        )}
        {upperMs.length === 0 && lowerMs.length === 0 && (
          <p className="text-sm text-(--text-dim) py-6 text-center">No matches in this round.</p>
        )}
      </div>
    </div>
  );
}

function MobileBandLabel({ text }: { text: string }) {
  return (
    <div
      style={{
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--text-faint)',
        marginTop: 4,
      }}
    >
      {text}
    </div>
  );
}

function BandLabel({ text, top, height }: { text: string; top: number; height: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top,
        height,
        width: LABEL_W,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text-faint)',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
    </div>
  );
}

function BracketCard({
  match: m, teamLogos, teamShortNames, hoveredTeam, isChampionMatch, onHover, onClick, onEdit,
}: {
  match: Match;
  teamLogos: Record<string, string | null>;
  teamShortNames?: Record<string, string>;
  hoveredTeam: string | null;
  isChampionMatch: boolean;
  onHover: (team: string | null) => void;
  onClick: () => void;
  onEdit: () => void;
}) {
  const done = m.winner !== null;
  const t1Win = m.winner === 1;
  const t2Win = m.winner === 2;
  const isFinal = m.is_final;

  const inPath = hoveredTeam != null && (m.team1 === hoveredTeam || m.team2 === hoveredTeam);
  const dimmed = hoveredTeam != null && !inPath;
  const dateText = formatMatchDate(m.datetime_utc);
  const boText = m.best_of ? `BO${m.best_of}` : '';
  const metaLabel = [dateText, boText].filter(Boolean).join(' · ');

  const champion = isChampionMatch && done ? (t1Win ? m.team1 : m.team2) : null;
  const championLabel = champion ? (teamShortNames?.[champion] || champion) : null;

  return (
    <div className="bracket-slot" style={{ position: 'relative', width: '100%', opacity: dimmed ? 0.35 : 1, transition: 'opacity 0.15s', zIndex: inPath ? 2 : 1 }}>
      {/* Meta pill hovers above the card so it doesn't shift the card's vertical
          center (connector lines target CARD_H/2 — the divider between teams). */}
      {metaLabel && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            marginBottom: 5,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              maxWidth: '100%',
              padding: '2px 9px',
              borderRadius: 999,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              fontSize: 9.5,
              fontWeight: 600,
              color: 'var(--text-dim)',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {metaLabel}
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={onClick}
        className="card bracket-match w-full text-left"
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          padding: 0,
          borderColor: inPath
            ? 'var(--accent)'
            : isFinal ? 'color-mix(in srgb, var(--amber) 45%, var(--border))' : undefined,
          boxShadow: inPath
            ? 'var(--ring-focus)'
            : isFinal
              ? '0 0 0 1px color-mix(in srgb, var(--amber) 18%, transparent), 0 6px 20px -8px color-mix(in srgb, var(--amber) 40%, transparent)'
              : 'var(--shadow-sm)',
        }}
      >
        <TeamRow
          team={m.team1} label={teamShortNames?.[m.team1] || m.team1} logo={teamLogos[m.team1]}
          score={done ? m.team1_score : null}
          win={t1Win} lose={done && !t1Win}
          highlight={hoveredTeam === m.team1}
          onHover={onHover}
        />
        <div style={{ height: 1, background: 'var(--border)', flexShrink: 0 }} />
        <TeamRow
          team={m.team2} label={teamShortNames?.[m.team2] || m.team2} logo={teamLogos[m.team2]}
          score={done ? m.team2_score : null}
          win={t2Win} lose={done && !t2Win}
          highlight={hoveredTeam === m.team2}
          onHover={onHover}
        />
      </button>
      {championLabel && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 6,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              maxWidth: '100%',
              padding: '3px 10px',
              borderRadius: 999,
              background: 'var(--amber-muted)',
              border: '1px solid color-mix(in srgb, var(--amber) 35%, transparent)',
              color: 'var(--amber)',
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
              <path d="M6 2h12v2h4v2a6 6 0 0 1-6.3 5.99A6 6 0 0 1 13 15.65V18h4v2H7v-2h4v-2.35a6 6 0 0 1-2.7-3.66A6 6 0 0 1 2 6V4h4V2zm-2 4a4 4 0 0 0 2 3.46V6H4zm16 0h-2v3.46A4 4 0 0 0 20 6z" />
            </svg>
            {championLabel} · Champion
          </span>
        </div>
      )}
      <button
        type="button"
        title="Edit bracket wiring"
        className="bracket-edit-btn"
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          right: 5,
          width: 22,
          height: 22,
          border: '1px solid var(--border)',
          borderRadius: 6,
          background: 'var(--surface)',
          color: 'var(--text-dim)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          flexShrink: 0,
          padding: 0,
        }}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path d="M7.5 1.5 L9.5 3.5 L3.5 9.5 L1 10 L1.5 7.5 Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none"/>
          <path d="M6.5 2.5 L8.5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}

function TeamRow({
  team, label, logo, score, win, lose, highlight, onHover,
}: {
  team: string;
  label: string;
  logo: string | null | undefined;
  score: number | null;
  win: boolean;
  lose: boolean;
  highlight: boolean;
  onHover: (team: string | null) => void;
}) {
  const background = highlight
    ? 'var(--surface-hover)'
    : win ? 'var(--surface-sub)' : 'transparent';
  const tbd = !team;

  return (
    <div
      className="flex items-center"
      onMouseEnter={() => onHover(team || null)}
      onMouseLeave={() => onHover(null)}
      style={{
        height: 44,
        padding: '0 10px',
        gap: 8,
        minWidth: 0,
        background,
        boxShadow: highlight ? 'inset 2px 0 0 var(--accent)' : (win ? 'inset 2px 0 0 var(--accent-2)' : undefined),
        transition: 'background 0.15s',
      }}
    >
      <div
        className="flex items-center flex-1 min-w-0"
        style={{ gap: 8, opacity: highlight ? 1 : (lose ? 0.45 : 1), transition: 'opacity 0.15s' }}
      >
        {tbd ? (
          <div style={{ width: 22, height: 22, borderRadius: 6, border: '1.5px dashed var(--border-strong)', flexShrink: 0 }} />
        ) : (
          <TeamMark short={team} logo={logo ?? null} size={22} />
        )}
        <span
          className="flex-1 truncate"
          style={{
            fontSize: 13,
            color: tbd ? 'var(--text-faint)' : (win || highlight) ? 'var(--text-h)' : 'var(--text)',
            fontWeight: (win || highlight) ? 650 : 500,
            fontStyle: tbd ? 'italic' : undefined,
          }}
        >
          {tbd ? 'TBD' : label}
        </span>
      </div>
      {score !== null && (
        <span
          style={{
            fontFamily: 'var(--font-num)',
            minWidth: 22,
            height: 21,
            padding: '0 5px',
            borderRadius: 6,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            background: win ? 'var(--surface-hover)' : 'var(--surface-sub)',
            color: win ? 'var(--text-h)' : 'var(--text-dim)',
            flexShrink: 0,
          }}
        >
          {score}
        </span>
      )}
    </div>
  );
}

// Admin bracket wiring editor

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface-sub)',
  color: 'var(--text)',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

function MatchOption({ m }: { m: Match }) {
  const date = m.datetime_utc
    ? new Date(m.datetime_utc).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;
  const colLabel = m.bracket_col != null ? `Col ${m.bracket_col}` : (m.tab || '');
  return (
    <option value={m.id}>
      {date ? `${date} · ` : ''}{colLabel ? `[${colLabel}] ` : ''}{m.team1} vs {m.team2}
    </option>
  );
}

function BracketMatchEditor({
  match, allMatches, onSave, onClose,
}: {
  match: Match;
  allMatches: Match[];
  onSave: (updated: Match) => void;
  onClose: () => void;
}) {
  const [bracketCol, setBracketCol] = useState<string>(match.bracket_col?.toString() ?? '');
  const [bracketOrder, setBracketOrder] = useState<string>(match.bracket_order?.toString() ?? '');
  const [nextMatch, setNextMatch] = useState<string>(match.next_match?.toString() ?? '');
  const [isLower, setIsLower] = useState(match.is_lower_bracket);
  const [isFinal, setIsFinal] = useState(match.is_final);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const others = [...allMatches]
    .filter((m) => m.id !== match.id)
    .sort((a, b) => {
      if (!a.datetime_utc && !b.datetime_utc) return 0;
      if (!a.datetime_utc) return 1;
      if (!b.datetime_utc) return -1;
      return new Date(a.datetime_utc).getTime() - new Date(b.datetime_utc).getTime();
    });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await patchMatchBracket(match.id, {
        bracket_col: bracketCol !== '' ? Number(bracketCol) : null,
        bracket_order: bracketOrder !== '' ? Number(bracketOrder) : null,
        next_match: nextMatch !== '' ? Number(nextMatch) : null,
        is_lower_bracket: isLower,
        is_final: isFinal,
      });
      onSave(res.data);
    } catch {
      setError('Failed to save — check for duplicate column/row numbers.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer-panel" style={{ width: 'min(400px, 100vw)', padding: '56px 24px 32px' }}>
        <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">×</button>

        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
          Bracket Editor
        </p>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-h)', marginBottom: 28 }}>
          {match.team1} vs {match.team2}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Field label="Column order">
            <input
              style={inputStyle}
              type="number"
              min={1}
              value={bracketCol}
              onChange={(e) => setBracketCol(e.target.value)}
              placeholder="1, 2, 3… (column position)"
            />
          </Field>

          <Field label="Row / Order">
            <input
              style={inputStyle}
              type="number"
              min={1}
              value={bracketOrder}
              onChange={(e) => setBracketOrder(e.target.value)}
              placeholder="1, 2, 3… (unique per column)"
            />
          </Field>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isLower}
              onChange={(e) => setIsLower(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, color: 'var(--text)' }}>Lower bracket</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isFinal}
              onChange={(e) => setIsFinal(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, color: 'var(--text)' }}>Final</span>
          </label>

          <Field label="Next match (winner advances to)">
            <select
              style={inputStyle}
              value={nextMatch}
              onChange={(e) => setNextMatch(e.target.value)}
            >
              <option value="">— None —</option>
              {others.map((m) => <MatchOption key={m.id} m={m} />)}
            </select>
          </Field>
        </div>

        {error && (
          <p style={{ marginTop: 16, fontSize: 12, color: 'var(--red)' }}>{error}</p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            marginTop: 28,
            width: '100%',
            padding: '10px 0',
            borderRadius: 8,
            border: 'none',
            background: 'var(--text-h)',
            color: 'var(--bg)',
            fontSize: 13,
            fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </>
  );
}
