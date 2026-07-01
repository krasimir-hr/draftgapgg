import { useEffect, useMemo, useReducer, useState } from 'react';
import { getMatches, getEventRosters } from '../../api/core';
import type { Match } from '../../types/models';
import { TeamMark } from './shared';

interface Props {
  eventId: number;
  teamLogos: Record<string, string | null>;
  teamShortNames?: Record<string, string>;
  onMatchSelect: (id: number) => void;
  // When preloaded, the parent also supplies merged rosters.
  preloadedMatches?: Match[];
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

const isTBD = (t: string) => !t || /^tbd$/i.test(t.trim());
const roundNum = (tab: string): number => {
  const m = tab.match(/round\s*(\d+)/i);
  return m ? Number(m[1]) : 0;
};

// Swiss derivation
// Each match in a Swiss round is between two teams of the same record. Walking
// the rounds in order we tally match wins/losses; the record a team carries
// *into* a match defines which bucket that match belongs to. A team is
// qualified at 3 wins and eliminated at 3 losses.
interface Rec { w: number; l: number }
interface SwissMatch { m: Match; round: number; recW: number; recL: number; diff: number }
interface Standing { name: string; w: number; l: number }

interface Built {
  rounds: number[];                          // ordered round numbers present
  bucketsByRound: Map<number, BucketGroup[]>;
  qualified: Standing[];
  eliminated: Standing[];
}
interface BucketGroup { recW: number; recL: number; diff: number; bestOf: number; matches: SwissMatch[] }

function buildSwiss(matches: Match[]): Built {
  const ordered = matches
    .filter((m) => roundNum(m.tab) > 0)
    .sort(
      (a, b) =>
        roundNum(a.tab) - roundNum(b.tab) ||
        (a.datetime_utc ?? '').localeCompare(b.datetime_utc ?? '') ||
        a.id - b.id,
    );

  const rec = new Map<string, Rec>();
  const getRec = (t: string): Rec => rec.get(t) ?? { w: 0, l: 0 };

  const swiss: SwissMatch[] = [];
  for (const m of ordered) {
    const round = roundNum(m.tab);
    // Entering record — both teams share it; pick whichever side is known.
    const base = !isTBD(m.team1) ? getRec(m.team1) : getRec(m.team2);
    swiss.push({ m, round, recW: base.w, recL: base.l, diff: base.w - base.l });

    if (m.winner === 1 || m.winner === 2) {
      const winner = m.winner === 1 ? m.team1 : m.team2;
      const loser = m.winner === 1 ? m.team2 : m.team1;
      const rw = getRec(winner);
      const rl = getRec(loser);
      rec.set(winner, { w: rw.w + 1, l: rw.l });
      rec.set(loser, { w: rl.w, l: rl.l + 1 });
    }
  }

  // Group by (round, record)
  const groupMap = new Map<string, BucketGroup>();
  for (const s of swiss) {
    const key = `${s.round}:${s.recW}-${s.recL}`;
    let g = groupMap.get(key);
    if (!g) {
      g = { recW: s.recW, recL: s.recL, diff: s.diff, bestOf: s.m.best_of, matches: [] };
      groupMap.set(key, g);
    }
    g.matches.push(s);
  }

  const rounds = [...new Set(swiss.map((s) => s.round))].sort((a, b) => a - b);
  const bucketsByRound = new Map<number, BucketGroup[]>();
  for (const r of rounds) {
    const groups = [...groupMap.values()]
      .filter((g) => g.matches[0].round === r)
      .sort((a, b) => b.diff - a.diff || b.recW - a.recW);
    bucketsByRound.set(r, groups);
  }

  const standings = [...rec.entries()].map(([name, r]) => ({ name, w: r.w, l: r.l }));
  const byRecord = (a: Standing, b: Standing) =>
    b.w - a.w || a.l - b.l || a.name.localeCompare(b.name);
  const qualified = standings.filter((t) => t.w >= 3).sort(byRecord);
  const eliminated = standings.filter((t) => t.l >= 3).sort(byRecord);

  return { rounds, bucketsByRound, qualified, eliminated };
}

// Diff → accent color for a record bucket.
function diffColor(diff: number): { fg: string; bg: string } {
  if (diff >= 2)  return { fg: 'var(--green)',  bg: 'var(--green-muted)' };
  if (diff === 1) return { fg: 'var(--green)',  bg: 'var(--green-muted)' };
  if (diff === 0) return { fg: 'var(--accent-2)', bg: 'var(--accent-muted)' };
  if (diff === -1) return { fg: 'var(--amber)',  bg: 'var(--amber-muted)' };
  return { fg: 'var(--red)', bg: 'var(--red-muted)' };
}

const CARD_W = 158;

export default function SwissStage({ eventId, teamLogos, teamShortNames, onMatchSelect, preloadedMatches }: Props) {
  const [state, dispatch] = useReducer(reducer, { loading: true, error: null, matches: [] });
  const [hovered, setHovered] = useState<string | null>(null);
  const [ownLogos, setOwnLogos] = useState<Record<string, string | null>>({});
  const [ownShorts, setOwnShorts] = useState<Record<string, string>>({});

  // Skipped when preloaded — matches come straight from the prop and rosters are
  // already merged into teamLogos / teamShortNames by the route loader.
  useEffect(() => {
    if (preloadedMatches != null) return;
    dispatch({ type: 'fetch' });
    getMatches({ event: eventId, page_size: 100 })
      .then((res) => dispatch({ type: 'success', matches: res.data.results }))
      .catch(() => dispatch({ type: 'error', message: 'Failed to load Swiss stage' }));

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

  const matches = preloadedMatches ?? state.matches;
  const loading = preloadedMatches == null && state.loading;
  const error = preloadedMatches == null ? state.error : null;

  const logos = useMemo(() => ({ ...teamLogos, ...ownLogos }), [teamLogos, ownLogos]);
  const shorts = useMemo(() => ({ ...teamShortNames, ...ownShorts }), [teamShortNames, ownShorts]);
  const built = useMemo(() => buildSwiss(matches), [matches]);

  if (loading) return <div className="py-10 flex items-center justify-center"><div className="spinner" /></div>;
  if (error)   return <p className="text-sm px-6 py-6" style={{ color: 'var(--red)' }}>{error}</p>;
  if (!built.rounds.length) {
    return (
      <div className="card card-soft-shadow" style={{ borderRadius: 14, padding: '24px' }}>
        <p className="text-sm text-(--text-dim) text-center">No Swiss stage data yet.</p>
      </div>
    );
  }

  const label = (s: string) => shorts[s] || s;

  return (
    <div className="card card-soft-shadow" style={{ borderRadius: 14, padding: '18px 16px 22px' }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap" style={{ gap: 10, marginBottom: 16 }}>
        <div>
          <h2 className="h-display" style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>Swiss Stage</h2>
          <p style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 3 }}>
            First to <strong style={{ color: 'var(--green)' }}>3 wins</strong> advances · out at{' '}
            <strong style={{ color: 'var(--red)' }}>3 losses</strong> · advancement &amp; elimination matches are BO3
          </p>
        </div>
      </div>

      {/* Diamond grid */}
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'stretch', minWidth: 'min-content' }}>
          {built.rounds.map((r) => (
            <div key={r} style={{ display: 'flex', flexDirection: 'column', minWidth: CARD_W }}>
              <RoundHeader round={r} />
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: 18,
                  flex: 1,
                }}
              >
                {built.bucketsByRound.get(r)!.map((g) => (
                  <Bucket
                    key={`${g.recW}-${g.recL}`}
                    group={g}
                    logos={logos}
                    label={label}
                    hovered={hovered}
                    onHover={setHovered}
                    onClick={onMatchSelect}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Results rail */}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 196 }}>
            <RoundHeader round={null} title="Result" />
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14, flex: 1 }}>
              <ResultRail
                title="Qualified"
                tone="green"
                teams={built.qualified}
                logos={logos}
                label={label}
                hovered={hovered}
                onHover={setHovered}
              />
              {built.eliminated.length > 0 && (
                <ResultRail
                  title="Eliminated"
                  tone="red"
                  teams={built.eliminated}
                  logos={logos}
                  label={label}
                  hovered={hovered}
                  onHover={setHovered}
                  dim
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoundHeader({ round, title }: { round: number | null; title?: string }) {
  return (
    <div
      style={{
        textAlign: 'center',
        marginBottom: 14,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--accent-2)',
        whiteSpace: 'nowrap',
      }}
    >
      {title ?? `Round ${round}`}
    </div>
  );
}

function Bucket({
  group, logos, label, hovered, onHover, onClick,
}: {
  group: BucketGroup;
  logos: Record<string, string | null>;
  label: (s: string) => string;
  hovered: string | null;
  onHover: (t: string | null) => void;
  onClick: (id: number) => void;
}) {
  const c = diffColor(group.diff);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {/* Record header */}
      <div className="flex items-center justify-center" style={{ gap: 6 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: c.fg,
            background: c.bg,
            borderRadius: 6,
            padding: '2px 8px',
            letterSpacing: '0.02em',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {group.recW}–{group.recL}
        </span>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em' }}>
          BO{group.bestOf}
        </span>
      </div>
      {group.matches.map((s) => (
        <MatchCard key={s.m.id} sm={s} accent={c.fg} logos={logos} label={label}
          hovered={hovered} onHover={onHover} onClick={onClick} />
      ))}
    </div>
  );
}

function MatchCard({
  sm, accent, logos, label, hovered, onHover, onClick,
}: {
  sm: SwissMatch;
  accent: string;
  logos: Record<string, string | null>;
  label: (s: string) => string;
  hovered: string | null;
  onHover: (t: string | null) => void;
  onClick: (id: number) => void;
}) {
  const m = sm.m;
  const done = m.winner !== null;
  const involved = hovered != null && (m.team1 === hovered || m.team2 === hovered);
  const dim = hovered != null && !involved;

  return (
    <button
      type="button"
      onClick={() => onClick(m.id)}
      className="card w-full text-left"
      style={{
        padding: 0,
        borderRadius: 9,
        overflow: 'hidden',
        borderColor: involved ? 'var(--accent)' : undefined,
        boxShadow: involved ? 'var(--ring-focus)' : undefined,
        opacity: dim ? 0.42 : 1,
        transition: 'opacity 0.15s, box-shadow 0.15s, border-color 0.15s',
        position: 'relative',
        borderLeft: `2px solid ${accent}`,
      }}
    >
      <TeamRow team={m.team1} label={label(m.team1)} logo={logos[m.team1]}
        score={done ? m.team1_score : null} win={m.winner === 1} lose={done && m.winner !== 1}
        highlight={hovered === m.team1} onHover={onHover} />
      <div style={{ height: 1, background: 'var(--border)' }} />
      <TeamRow team={m.team2} label={label(m.team2)} logo={logos[m.team2]}
        score={done ? m.team2_score : null} win={m.winner === 2} lose={done && m.winner !== 2}
        highlight={hovered === m.team2} onHover={onHover} />
    </button>
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
  onHover: (t: string | null) => void;
}) {
  const tbd = isTBD(team);
  return (
    <div
      className="flex items-center"
      onMouseEnter={() => !tbd && onHover(team)}
      onMouseLeave={() => onHover(null)}
      style={{
        padding: '6px 8px',
        gap: 6,
        minWidth: 0,
        background: highlight ? 'var(--accent-muted)' : win ? 'var(--accent-muted)' : 'transparent',
        opacity: highlight ? 1 : lose ? 0.5 : 1,
        boxShadow: highlight ? 'inset 2px 0 0 var(--accent)' : undefined,
        transition: 'background 0.15s, opacity 0.15s',
      }}
    >
      <TeamMark short={tbd ? '?' : team} logo={logo ?? null} size={18} />
      <span
        className="flex-1 truncate"
        style={{
          fontSize: 11.5,
          color: tbd ? 'var(--text-faint)' : (win || highlight) ? 'var(--text-h)' : 'var(--text)',
          fontWeight: (win || highlight) ? 700 : 500,
        }}
      >
        {tbd ? 'TBD' : label}
      </span>
      {score !== null && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: win ? 'var(--accent-2)' : 'var(--text-dim)',
            fontVariantNumeric: 'tabular-nums',
            minWidth: 10,
            textAlign: 'right',
          }}
        >
          {score}
        </span>
      )}
    </div>
  );
}

function ResultRail({
  title, tone, teams, logos, label, hovered, onHover, dim,
}: {
  title: string;
  tone: 'green' | 'red';
  teams: Standing[];
  logos: Record<string, string | null>;
  label: (s: string) => string;
  hovered: string | null;
  onHover: (t: string | null) => void;
  dim?: boolean;
}) {
  const fg = tone === 'green' ? 'var(--green)' : 'var(--red)';
  const bg = tone === 'green' ? 'var(--green-muted)' : 'var(--red-muted)';
  return (
    <div
      style={{
        borderRadius: 11,
        border: `1px solid color-mix(in srgb, ${fg} 30%, transparent)`,
        background: bg,
        overflow: 'hidden',
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ padding: '7px 11px', borderBottom: `1px solid color-mix(in srgb, ${fg} 18%, transparent)` }}
      >
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: fg }}>
          {title}
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: fg, fontVariantNumeric: 'tabular-nums' }}>
          {teams.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {teams.map((t, i) => {
          const involved = hovered === t.name;
          const faded = hovered != null && !involved;
          return (
            <div
              key={t.name}
              className="flex items-center"
              onMouseEnter={() => onHover(t.name)}
              onMouseLeave={() => onHover(null)}
              style={{
                padding: '5px 11px',
                gap: 7,
                background: involved ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                opacity: (dim && !involved) || faded ? 0.5 : 1,
                borderTop: i === 0 ? 'none' : '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
                transition: 'background 0.15s, opacity 0.15s',
              }}
            >
              <TeamMark short={t.name} logo={logos[t.name] ?? null} size={18} />
              <span className="flex-1 truncate" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-h)' }}>
                {label(t.name)}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: fg, fontVariantNumeric: 'tabular-nums' }}>
                {t.w}–{t.l}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
