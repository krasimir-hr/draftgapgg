import { useEffect, useLayoutEffect, useMemo, useReducer, useState } from 'react';
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
interface Edge { from: Match; to: Match; team: string }

// Layout constants (px)
const CARD_H = 94;
const ROW_GAP = 16;
const SLOT = CARD_H + ROW_GAP;
const COL_GAP = 44;
const LABEL_W = 34;
const BAND_GAP = 48;

function formatMatchDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
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
    if (to) edges.push({ from: m, to, team: '' });
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

  const layout = useMemo(() => {
    const { colOrder, finals, hasLower, colOf, upperByCol, lowerByCol, edges } = built;
    const nCols = colOrder.length + (finals.length ? 1 : 0);
    if (!width || !nCols) return null;

    const labelW = hasLower ? LABEL_W : 0;
    const colW = (width - labelW) / nCols;
    const cardW = Math.max(colW - COL_GAP, 80);
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
      const blockH = finalMs.length * CARD_H + Math.max(finalMs.length - 1, 0) * ROW_GAP;
      const startY = (totalHeight - blockH) / 2;
      finalMs.forEach((m, i) => yOf.set(m.id, startY + i * SLOT));
    }

    const finalsBlockH = finals.length * CARD_H + Math.max(finals.length - 1, 0) * ROW_GAP;
    const finalsStart = (totalHeight - finalsBlockH) / 2;
    finals.forEach((f, i) => yOf.set(f.id, finalsStart + i * SLOT));

    const posOf = (m: Match) => ({ x: xOf(colOf.get(m.id)!), y: yOf.get(m.id)! });

    return { colW, cardW, labelW, xOf, yOf, posOf, totalHeight, upperHeight: upper.height, lowerOffset };
  }, [built, width]);

  if (state.loading) return <div className="py-10 flex items-center justify-center"><div className="spinner" /></div>;
  if (state.error)   return <p className="text-sm px-6 py-6" style={{ color: 'var(--red)' }}>{state.error}</p>;

  const empty = !built.colOrder.length && !built.finals.length;

  const allMatches: Match[] = [
    ...[...built.upperByCol.values()].flat(),
    ...[...built.lowerByCol.values()].flat(),
    ...built.finals,
  ];

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
        ) : !layout ? (
          <div style={{ height: 200 }} />
        ) : (
          <>
            {/* Canvas: connectors + cards */}
            <div style={{ position: 'relative', height: layout.totalHeight }}>
              {/* Band labels + divider */}
              {built.hasLower && (
                <>
                  <BandLabel text="Upper Bracket" top={0} height={layout.upperHeight} />
                  <BandLabel text="Lower Bracket" top={layout.lowerOffset} height={layout.totalHeight - layout.lowerOffset} />
                  <div
                    style={{
                      position: 'absolute',
                      left: 0, right: 0,
                      top: layout.upperHeight + BAND_GAP / 2,
                      borderTop: '1px dashed var(--border)',
                    }}
                  />
                </>
              )}

              {/* Connector lines */}
              <svg
                width={width}
                height={layout.totalHeight}
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
              >
                {[...built.edges]
                  .sort((a, b) => Number(a.team === hoveredTeam) - Number(b.team === hoveredTeam))
                  .map((e, i) => {
                    const from = layout.posOf(e.from);
                    const to = layout.posOf(e.to);
                    const x1 = from.x + layout.cardW;
                    const y1 = from.y + CARD_H / 2;
                    const x2 = to.x;
                    const y2 = to.y + CARD_H / 2;
                    const midX = (x1 + x2) / 2;
                    const active = hoveredTeam != null && e.team === hoveredTeam;
                    const dim = hoveredTeam != null && !active;
                    return (
                      <path
                        key={`${e.from.id}-${e.to.id}-${i}`}
                        d={`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`}
                        fill="none"
                        stroke={active ? 'var(--accent)' : 'var(--border-strong)'}
                        strokeWidth={active ? 2.5 : 1.5}
                        strokeLinejoin="round"
                        opacity={dim ? 0.3 : 1}
                        style={{ transition: 'stroke 0.15s, opacity 0.15s, stroke-width 0.15s' }}
                      />
                    );
                  })}
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
                      top: y,
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
                      onHover={setHoveredTeam}
                      onClick={() => onMatchSelect(m.id)}
                      onEdit={() => setEditingMatch(m)}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
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
  match: m, teamLogos, teamShortNames, hoveredTeam, onHover, onClick, onEdit,
}: {
  match: Match;
  teamLogos: Record<string, string | null>;
  teamShortNames?: Record<string, string>;
  hoveredTeam: string | null;
  onHover: (team: string | null) => void;
  onClick: () => void;
  onEdit: () => void;
}) {
  const done = m.winner !== null;
  const t1Win = m.winner === 1;
  const t2Win = m.winner === 2;

  const inPath = hoveredTeam != null && (m.team1 === hoveredTeam || m.team2 === hoveredTeam);
  const dimmed = hoveredTeam != null && !inPath;
  const dateText = formatMatchDate(m.datetime_utc);
  const boText = m.best_of ? `BO${m.best_of}` : '';
  const metaLabel = [dateText, boText].filter(Boolean).join(' · ');

  return (
    <div style={{ position: 'relative', width: '100%', opacity: dimmed ? 0.4 : 1, transition: 'opacity 0.15s', zIndex: inPath ? 2 : 1 }}>
      {/* Date hovers above the card so it doesn't shift the card's vertical center
          (connector lines target CARD_H/2 — the divider between the two teams). */}
      {metaLabel && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            marginBottom: 4,
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-faint)',
            textAlign: 'center',
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            pointerEvents: 'none',
          }}
        >
          {metaLabel}
        </div>
      )}
      <button
        type="button"
        onClick={onClick}
        className="card w-full text-left"
        style={{
          borderRadius: 10,
          overflow: 'hidden',
          padding: 0,
          borderColor: inPath ? 'var(--accent)' : undefined,
          boxShadow: inPath ? 'var(--ring-focus)' : undefined,
          transition: 'box-shadow 0.15s, border-color 0.15s',
        }}
      >
        <TeamRow
          team={m.team1} label={teamShortNames?.[m.team1] || m.team1} logo={teamLogos[m.team1]}
          score={done ? m.team1_score : null}
          win={t1Win} lose={done && !t1Win}
          highlight={hoveredTeam === m.team1}
          onHover={onHover}
        />
        <div style={{ height: 1, background: 'var(--border)' }} />
        <TeamRow
          team={m.team2} label={teamShortNames?.[m.team2] || m.team2} logo={teamLogos[m.team2]}
          score={done ? m.team2_score : null}
          win={t2Win} lose={done && !t2Win}
          highlight={hoveredTeam === m.team2}
          onHover={onHover}
        />
      </button>
      <button
        type="button"
        title="Edit bracket wiring"
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
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
  const background = highlight ? 'var(--accent-muted)' : 'transparent';

  return (
    <div
      className="flex items-center"
      onMouseEnter={() => onHover(team)}
      onMouseLeave={() => onHover(null)}
      style={{
        padding: '8px 9px',
        gap: 7,
        minWidth: 0,
        background,
        opacity: highlight ? 1 : (lose ? 0.45 : 1),
        boxShadow: highlight ? 'inset 2px 0 0 var(--accent)' : undefined,
        transition: 'background 0.15s, opacity 0.15s',
      }}
    >
      <TeamMark short={team} logo={logo ?? null} size={20} />
      <span
        className="flex-1 font-medium truncate"
        style={{
          fontSize: 12.5,
          color: (win || highlight) ? 'var(--text-h)' : 'var(--text)',
          fontWeight: (win || highlight) ? 600 : 500,
        }}
      >
        {label}
      </span>
      {score !== null && (
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: win ? 'var(--accent-2)' : 'var(--text-dim)',
            minWidth: 14,
            textAlign: 'right',
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
            borderRadius: 9,
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
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
