import { useEffect, useLayoutEffect, useMemo, useReducer, useState } from 'react';
import { getMatches, getEventRosters } from '../../api/core';
import type { Match } from '../../types/models';
import { TeamMark } from './shared';

interface Props {
  eventId: number;
  teamLogos: Record<string, string | null>;
  teamShortNames?: Record<string, string>;
  onMatchSelect: (id: number) => void;
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

const ROUND_ORDER = (name: string): number => {
  if (/play.?in.*1/i.test(name)) return 0;
  if (/play.?in.*2/i.test(name)) return 1;
  if (/play.?in.*3/i.test(name)) return 2;
  if (/play.?in/i.test(name))    return 3;
  const m = name.match(/round\s*(\d+)/i);
  if (m) return 10 + Number(m[1]);
  if (/final/i.test(name)) return 99;
  return 50;
};

const isFinalsTab = (tab: string) => /^(grand\s+)?finals?$/i.test(tab.trim());
const isPlayInTab = (tab: string) => /play.?in/i.test(tab);

type Band = 'upper' | 'lower' | 'final';
interface Edge { from: Match; to: Match; team: string }

// ── Layout constants (px) ──
const CARD_H = 94;
const ROW_GAP = 16;
const SLOT = CARD_H + ROW_GAP;
const COL_GAP = 44;        // wide gap → narrower cards, more room for connector lines
const LABEL_W = 34;
const HEADER_H = 26;
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
  rounds: string[];                 // ordered round names (excludes finals)
  finals: Match[];
  hasLower: boolean;
  bandOf: Map<number, Band>;
  colOf: Map<number, number>;       // matchId → column index (finals = rounds.length)
  upperByCol: Map<number, Match[]>;
  lowerByCol: Map<number, Match[]>;
  edges: Edge[];                    // progression lines (drops to lower omitted)
}

/**
 * Derive a double-elimination structure from flat match data. Leaguepedia's
 * MatchSchedule has no upper/lower marker, so we infer it: walking matches in
 * chronological order, a team that has already lost belongs to the lower
 * bracket. A match is "upper" only while both teams are undefeated; once either
 * has a loss the match drops to the lower bracket. The `Finals` tab is the
 * grand final.
 *
 * Play-In is a separate qualifier: its losses must not carry into the main
 * bracket (otherwise qualified teams get misclassified as lower-bracket in
 * round 1). So the loss tally is reset when the first main-bracket match
 * appears after the Play-In rounds.
 *
 * Edges connect each team's consecutive matches (their path). The drop from
 * upper → lower (a loss) is intentionally omitted — only progressions are drawn.
 */
function buildBracket(matches: Match[]): Built {
  const chrono = [...matches].sort(
    (a, b) => (a.datetime_utc ?? '').localeCompare(b.datetime_utc ?? '') || a.id - b.id,
  );

  const losses = new Map<string, number>();
  const bandOf = new Map<number, Band>();
  let sawPlayIn = false;
  let mainStarted = false;

  for (const m of chrono) {
    if (isPlayInTab(m.tab)) {
      sawPlayIn = true;
    } else if (sawPlayIn && !mainStarted && !isFinalsTab(m.tab)) {
      losses.clear();           // entering the main bracket — everyone starts fresh
      mainStarted = true;
    }

    let band: Band;
    if (isFinalsTab(m.tab)) {
      band = 'final';
    } else {
      const l1 = losses.get(m.team1) ?? 0;
      const l2 = losses.get(m.team2) ?? 0;
      band = l1 === 0 && l2 === 0 ? 'upper' : 'lower';
    }
    bandOf.set(m.id, band);
    if (m.winner === 1 || m.winner === 2) {
      const loser = m.winner === 1 ? m.team2 : m.team1;
      losses.set(loser, (losses.get(loser) ?? 0) + 1);
    }
  }

  const finals = chrono.filter((m) => bandOf.get(m.id) === 'final');

  // Round columns (everything except the grand final)
  const roundNames: string[] = [];
  for (const m of chrono) {
    if (bandOf.get(m.id) === 'final') continue;
    const key = m.tab || 'Matches';
    if (!roundNames.includes(key)) roundNames.push(key);
  }
  roundNames.sort((a, b) => ROUND_ORDER(a) - ROUND_ORDER(b));

  const colOf = new Map<number, number>();
  const upperByCol = new Map<number, Match[]>();
  const lowerByCol = new Map<number, Match[]>();
  for (const m of chrono) {
    const band = bandOf.get(m.id)!;
    if (band === 'final') { colOf.set(m.id, roundNames.length); continue; }
    const col = roundNames.indexOf(m.tab || 'Matches');
    colOf.set(m.id, col);
    const target = band === 'upper' ? upperByCol : lowerByCol;
    if (!target.has(col)) target.set(col, []);
    target.get(col)!.push(m);
  }

  const hasLower = lowerByCol.size > 0;

  // Edges: each team's consecutive matches, skipping the upper→lower drop.
  const byTeam = new Map<string, Match[]>();
  for (const m of chrono) {
    for (const t of [m.team1, m.team2]) {
      if (!t) continue;
      if (!byTeam.has(t)) byTeam.set(t, []);
      byTeam.get(t)!.push(m);
    }
  }
  const edges: Edge[] = [];
  for (const [team, list] of byTeam) {
    for (let i = 1; i < list.length; i++) {
      const from = list[i - 1];
      const to = list[i];
      const bf = bandOf.get(from.id);
      const bt = bandOf.get(to.id);
      if (bf === 'upper' && bt === 'lower') continue; // the loss drop — not drawn
      edges.push({ from, to, team });
    }
  }

  return { rounds: roundNames, finals, hasLower, bandOf, colOf, upperByCol, lowerByCol, edges };
}

/**
 * Assign a vertical position to each match in a band. The leftmost column is
 * stacked evenly; every later match is centered on the matches that feed it
 * (its in-band edges), so a team that progresses lands on/near its prior row.
 * Overlaps are resolved by pushing matches down while preserving order.
 */
function layoutBand(byCol: Map<number, Match[]>, feeders: Map<number, number[]>): {
  y: Map<number, number>; height: number;
} {
  const y = new Map<number, number>();
  const cols = [...byCol.keys()].sort((a, b) => a - b);
  let first = true;

  for (const col of cols) {
    const ms = byCol.get(col)!;
    if (first) {
      ms.forEach((m, i) => y.set(m.id, i * SLOT));
      first = false;
      continue;
    }
    // Desired position from feeders; fall back to the previous known row.
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
  return { y, height };
}

export default function BracketTab({ eventId, teamLogos, teamShortNames, onMatchSelect }: Props) {
  const [state, dispatch] = useReducer(reducer, { loading: true, error: null, matches: [] });
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  // Logos/short names for exactly this bracket's teams (includes Play-In teams
  // that the parent split's roster map may be missing); falls back to props.
  const [ownLogos, setOwnLogos] = useState<Record<string, string | null>>({});
  const [ownShorts, setOwnShorts] = useState<Record<string, string>>({});

  useEffect(() => {
    dispatch({ type: 'fetch' });
    getMatches({ event: eventId, page_size: 100 })
      .then((res) => dispatch({ type: 'success', matches: res.data.results }))
      .catch(() => dispatch({ type: 'error', message: 'Failed to load bracket' }));

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
  }, [eventId]);

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

  const built = useMemo(() => buildBracket(state.matches), [state.matches]);

  const layout = useMemo(() => {
    const { rounds, finals, hasLower, colOf, upperByCol, lowerByCol, edges } = built;
    const nCols = rounds.length + (finals.length ? 1 : 0);
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
    const lower = hasLower ? layoutBand(lowerByCol, lowerFeeders) : { y: new Map<number, number>(), height: 0 };

    const lowerOffset = upper.height + (hasLower ? BAND_GAP : 0);
    const totalHeight = (hasLower ? lowerOffset + lower.height : upper.height) || CARD_H;

    const yOf = new Map<number, number>();
    for (const [id, v] of upper.y) yOf.set(id, v);
    for (const [id, v] of lower.y) yOf.set(id, v + lowerOffset);

    const finalsBlockH = finals.length * CARD_H + Math.max(finals.length - 1, 0) * ROW_GAP;
    const finalsStart = (totalHeight - finalsBlockH) / 2;
    finals.forEach((f, i) => yOf.set(f.id, finalsStart + i * SLOT));

    const posOf = (m: Match) => ({ x: xOf(colOf.get(m.id)!), y: yOf.get(m.id)! });

    return { colW, cardW, labelW, xOf, yOf, posOf, totalHeight, upperHeight: upper.height, lowerOffset };
  }, [built, width]);

  if (state.loading) return <div className="py-10 flex items-center justify-center"><div className="spinner" /></div>;
  if (state.error)   return <p className="text-sm px-6 py-6" style={{ color: 'var(--red)' }}>{state.error}</p>;

  const empty = !built.rounds.length && !built.finals.length;

  const allMatches: Match[] = [
    ...[...built.upperByCol.values()].flat(),
    ...[...built.lowerByCol.values()].flat(),
    ...built.finals,
  ];

  return (
    <div className="card card-soft-shadow" style={{ borderRadius: 14, padding: '16px 12px 20px' }}>
      <div ref={setContainerEl} style={{ position: 'relative', width: '100%' }}>
        {empty ? (
          <p className="text-sm text-(--text-dim) py-6 text-center">No bracket data yet.</p>
        ) : !layout ? (
          <div style={{ height: 200 }} />
        ) : (
          <>
            {/* ── Column headers ── */}
            <div style={{ position: 'relative', height: HEADER_H }}>
              {built.rounds.map((name, col) => (
                <ColHeader key={name} name={name} left={layout.xOf(col)} width={layout.cardW} />
              ))}
              {built.finals.length > 0 && (
                <ColHeader name="Finals" left={layout.xOf(built.rounds.length)} width={layout.cardW} />
              )}
            </div>

            {/* ── Canvas: connectors + cards ── */}
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

function ColHeader({ name, left, width }: { name: string; left: number; width: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left,
        width,
        top: 0,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--accent-2)',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {name}
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
  match: m, teamLogos, teamShortNames, hoveredTeam, onHover, onClick,
}: {
  match: Match;
  teamLogos: Record<string, string | null>;
  teamShortNames?: Record<string, string>;
  hoveredTeam: string | null;
  onHover: (team: string | null) => void;
  onClick: () => void;
}) {
  const done = m.winner !== null;
  const t1Win = m.winner === 1;
  const t2Win = m.winner === 2;

  const inPath = hoveredTeam != null && (m.team1 === hoveredTeam || m.team2 === hoveredTeam);
  const dimmed = hoveredTeam != null && !inPath;
  const dateLabel = formatMatchDate(m.datetime_utc);

  return (
    <button
      type="button"
      onClick={onClick}
      className="card w-full text-left"
      style={{
        borderRadius: 10,
        overflow: 'hidden',
        padding: 0,
        opacity: dimmed ? 0.4 : 1,
        borderColor: inPath ? 'var(--accent)' : undefined,
        boxShadow: inPath ? 'var(--ring-focus)' : undefined,
        transition: 'opacity 0.15s, box-shadow 0.15s, border-color 0.15s',
        position: 'relative',
        zIndex: inPath ? 2 : 1,
      }}
    >
      <TeamRow
        team={m.team1} label={teamShortNames?.[m.team1] || m.team1} logo={teamLogos[m.team1]}
        score={done ? m.team1_score : null}
        win={t1Win} lose={done && !t1Win}
        highlight={hoveredTeam === m.team1}
        onHover={onHover}
        bestOf={m.best_of}
      />
      <div style={{ height: 1, background: 'var(--border)' }} />
      <TeamRow
        team={m.team2} label={teamShortNames?.[m.team2] || m.team2} logo={teamLogos[m.team2]}
        score={done ? m.team2_score : null}
        win={t2Win} lose={done && !t2Win}
        highlight={hoveredTeam === m.team2}
        onHover={onHover}
      />
      {dateLabel && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            padding: '4px 9px',
            fontSize: 10,
            fontWeight: 500,
            color: 'var(--text-faint)',
            textAlign: 'center',
            letterSpacing: '0.01em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            background: 'var(--surface-sub)',
          }}
        >
          {dateLabel}
        </div>
      )}
    </button>
  );
}

function TeamRow({
  team, label, logo, score, win, lose, highlight, onHover, bestOf,
}: {
  team: string;
  label: string;
  logo: string | null | undefined;
  score: number | null;
  win: boolean;
  lose: boolean;
  highlight: boolean;
  onHover: (team: string | null) => void;
  bestOf?: number;
}) {
  const background = highlight
    ? 'var(--accent-muted)'
    : win ? 'var(--accent-muted)' : 'transparent';

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
      {score === null && bestOf && (
        <span style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 600 }}>
          BO{bestOf}
        </span>
      )}
    </div>
  );
}
