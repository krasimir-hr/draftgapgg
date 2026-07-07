import { useMemo, useState } from 'react';
import EsportsLayout from '../components/EsportsLayout';
import { SideRail } from '../components/Sidebar';
import { PlayerAvatar, RoleIcon, ROLE_ABBR, ROLE_COLOR } from '../components/league/shared';

/* ────────────────────────────────────────────────────────────────
 * Fantasy "My Team" page.
 *
 * Pure front-end design for now — every value below is mock data held
 * in component state. Wiring (loaders, API, persistence) comes later;
 * the shapes here are deliberately close to what the backend will need
 * (a roster of picks, per-gameweek scoring, a mini-league table).
 * ──────────────────────────────────────────────────────────────── */

type Role = 'Top' | 'Jungle' | 'Mid' | 'Bot' | 'Support';
const ROLE_ORDER: Role[] = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'];

interface FantasyPlayer {
  id: number;
  name: string;
  role: Role;
  team: string;
  teamColor: string;
  image?: string | null;
  price: number;       // roster cost, in "M"
  selectedBy: number;  // % of managers who own them
  // Latest gameweek raw stats — points are derived from these.
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  bonus: { label: string; points: number }[];
  form: number[];      // points across recent gameweeks (oldest → newest)
}

/* ── Scoring ──────────────────────────────────────────────────────
 * One place that turns raw stats into fantasy points, so the points
 * shown everywhere stay consistent. Mirrors a typical LoL fantasy
 * scoring sheet — easy to swap for the real ruleset later. */
const SCORING = {
  kill: 2,
  death: -0.5,
  assist: 1.5,
  csPer: 0.02, // per creep
} as const;

function scoreLines(p: FantasyPlayer) {
  const lines = [
    { label: 'Kills', detail: `${p.kills} × ${SCORING.kill}`, points: p.kills * SCORING.kill },
    { label: 'Deaths', detail: `${p.deaths} × ${SCORING.death}`, points: p.deaths * SCORING.death },
    { label: 'Assists', detail: `${p.assists} × ${SCORING.assist}`, points: p.assists * SCORING.assist },
    { label: 'Creep score', detail: `${p.cs} × ${SCORING.csPer}`, points: p.cs * SCORING.csPer },
    ...p.bonus.map((b) => ({ label: b.label, detail: 'bonus', points: b.points })),
  ];
  return lines;
}

function totalPoints(p: FantasyPlayer) {
  return Math.round(scoreLines(p).reduce((s, l) => s + l.points, 0) * 10) / 10;
}

/* ── Mock data ────────────────────────────────────────────────────*/

const STARTERS: FantasyPlayer[] = [
  { id: 1, name: 'Zeus', role: 'Top', team: 'T1', teamColor: '#e2012d', price: 9.5, selectedBy: 41, kills: 4, deaths: 2, assists: 6, cs: 312, bonus: [], form: [38, 51, 44, 62] },
  { id: 2, name: 'Oner', role: 'Jungle', team: 'T1', teamColor: '#e2012d', price: 9.0, selectedBy: 33, kills: 3, deaths: 3, assists: 11, cs: 198, bonus: [{ label: '10+ assists', points: 2 }], form: [29, 47, 39, 55] },
  { id: 3, name: 'Faker', role: 'Mid', team: 'T1', teamColor: '#e2012d', price: 11.5, selectedBy: 67, kills: 6, deaths: 1, assists: 8, cs: 341, bonus: [{ label: 'Triple kill', points: 2 }], form: [52, 60, 58, 71] },
  { id: 4, name: 'Gumayusi', role: 'Bot', team: 'T1', teamColor: '#e2012d', price: 10.5, selectedBy: 58, kills: 8, deaths: 2, assists: 5, cs: 358, bonus: [{ label: 'Quadra kill', points: 5 }], form: [61, 44, 66, 73] },
  { id: 5, name: 'Keria', role: 'Support', team: 'T1', teamColor: '#e2012d', price: 8.5, selectedBy: 49, kills: 1, deaths: 4, assists: 15, cs: 64, bonus: [{ label: '10+ assists', points: 2 }], form: [40, 33, 48, 51] },
];

const BENCH: FantasyPlayer[] = [
  { id: 6, name: 'Canyon', role: 'Jungle', team: 'GEN', teamColor: '#aa8a5a', price: 9.5, selectedBy: 38, kills: 2, deaths: 5, assists: 9, cs: 205, bonus: [], form: [31, 28, 42, 36] },
  { id: 7, name: 'Ruler', role: 'Bot', team: 'GEN', teamColor: '#aa8a5a', price: 10.0, selectedBy: 51, kills: 5, deaths: 3, assists: 7, cs: 332, bonus: [], form: [49, 55, 41, 47] },
];

// Candidate pool used by the swap drawer — grouped by role.
const TRANSFER_POOL: FantasyPlayer[] = [
  { id: 11, name: 'Kiin', role: 'Top', team: 'GEN', teamColor: '#aa8a5a', price: 9.0, selectedBy: 29, kills: 3, deaths: 2, assists: 8, cs: 298, bonus: [], form: [42, 39, 51, 58] },
  { id: 12, name: 'Doran', role: 'Top', team: 'HLE', teamColor: '#ff6b35', price: 7.5, selectedBy: 14, kills: 2, deaths: 3, assists: 7, cs: 281, bonus: [], form: [33, 41, 36, 44] },
  { id: 13, name: 'Peanut', role: 'Jungle', team: 'HLE', teamColor: '#ff6b35', price: 8.5, selectedBy: 26, kills: 3, deaths: 2, assists: 12, cs: 189, bonus: [{ label: '10+ assists', points: 2 }], form: [44, 50, 47, 53] },
  { id: 14, name: 'Chovy', role: 'Mid', team: 'GEN', teamColor: '#aa8a5a', price: 11.0, selectedBy: 62, kills: 5, deaths: 1, assists: 9, cs: 366, bonus: [], form: [58, 64, 61, 69] },
  { id: 15, name: 'Zeka', role: 'Mid', team: 'HLE', teamColor: '#ff6b35', price: 9.5, selectedBy: 31, kills: 4, deaths: 2, assists: 8, cs: 329, bonus: [], form: [47, 52, 49, 57] },
  { id: 16, name: 'Viper', role: 'Bot', team: 'HLE', teamColor: '#ff6b35', price: 10.0, selectedBy: 44, kills: 7, deaths: 2, assists: 6, cs: 351, bonus: [], form: [55, 48, 62, 60] },
  { id: 17, name: 'Lehends', role: 'Support', team: 'GEN', teamColor: '#aa8a5a', price: 7.5, selectedBy: 22, kills: 0, deaths: 3, assists: 14, cs: 58, bonus: [{ label: '10+ assists', points: 2 }], form: [37, 44, 39, 46] },
  { id: 18, name: 'Delight', role: 'Support', team: 'HLE', teamColor: '#ff6b35', price: 7.0, selectedBy: 17, kills: 1, deaths: 4, assists: 11, cs: 51, bonus: [{ label: '10+ assists', points: 2 }], form: [34, 31, 40, 43] },
];

interface Rival {
  rank: number;
  manager: string;
  teamName: string;
  gw: number;
  total: number;
  you?: boolean;
}

const LEAGUE: Rival[] = [
  { rank: 1, manager: 'minlee', teamName: 'Baron Steal Co.', gw: 312, total: 2841 },
  { rank: 2, manager: 'you', teamName: 'Gap Enjoyers', gw: 297, total: 2788, you: true },
  { rank: 3, manager: 'hwang', teamName: 'Backdoor Bandits', gw: 305, total: 2764 },
  { rank: 4, manager: 'pengu', teamName: 'Inting Sion', gw: 281, total: 2702 },
  { rank: 5, manager: 'sora', teamName: 'Tower Diver Tactics', gw: 290, total: 2655 },
  { rank: 6, manager: 'jin', teamName: 'Lane Kingdom', gw: 268, total: 2588 },
  { rank: 7, manager: 'arix', teamName: 'Flash Gods', gw: 274, total: 2531 },
  { rank: 8, manager: 'nokia', teamName: 'Smite Stealers', gw: 259, total: 2470 },
];

const GAMEWEEK = 7;
const BUDGET = 100; // total cap, in "M"
const TRANSFERS_LEFT = 2;

/* ── Small primitives ─────────────────────────────────────────────*/

const SECTION = 'text-(--text-dim) uppercase font-semibold';
const sectionStyle = { fontSize: 10.5, letterSpacing: '0.1em' } as const;

function Card({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div className={className} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, ...style }}>
      {children}
    </div>
  );
}

function fmtPts(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Thin sparkline of recent gameweek scores. */
function FormSpark({ form, width = 56, height = 20 }: { form: number[]; width?: number; height?: number }) {
  if (form.length < 2) return null;
  const min = Math.min(...form);
  const max = Math.max(...form);
  const span = max - min || 1;
  const step = width / (form.length - 1);
  const pts = form.map((v, i) => `${i * step},${height - ((v - min) / span) * (height - 4) - 2}`).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
      {form.map((v, i) => (
        <circle key={i} cx={i * step} cy={height - ((v - min) / span) * (height - 4) - 2} r={i === form.length - 1 ? 2.4 : 0} fill="var(--accent)" />
      ))}
    </svg>
  );
}

function RolePill({ role }: { role: Role }) {
  return (
    <span
      className="inline-flex items-center gap-1 font-semibold"
      style={{ fontSize: 10, letterSpacing: '0.06em', color: ROLE_COLOR[role], background: 'var(--surface-sub)', padding: '2px 7px', borderRadius: 5 }}
    >
      <RoleIcon role={role} size={11} color={ROLE_COLOR[role]} />
      {ROLE_ABBR[role]}
    </span>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────*/

function Hero({ teamName, gwTotal, rivals }: { teamName: string; gwTotal: number; rivals: Rival[] }) {
  const me = rivals.find((r) => r.you)!;
  const stats = [
    { label: `Gameweek ${GAMEWEEK}`, value: fmtPts(gwTotal), sub: 'points' },
    { label: 'Overall rank', value: `#${me.rank}`, sub: `of ${rivals.length} in league` },
    { label: 'Total points', value: me.total.toLocaleString(), sub: 'all gameweeks' },
    { label: 'Transfers', value: String(TRANSFERS_LEFT), sub: 'free remaining' },
  ];
  return (
    <div
      className="card card-xl card-soft-shadow overflow-hidden"
      style={{ borderRadius: 16, background: 'var(--surface)' }}
    >
      <div className="flex items-center gap-4 px-7 pt-6 pb-5">
        <div
          className="shrink-0 flex items-center justify-center text-white font-display"
          style={{ width: 64, height: 64, borderRadius: 14, fontSize: 26, fontWeight: 700, background: '#171717', color: '#fafafa' }}
        >
          {teamName.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <div className="eyebrow" style={{ marginBottom: 2 }}>My fantasy team</div>
          <h1 className="h-display" style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.05 }}>{teamName}</h1>
          <div className="text-(--text-dim)" style={{ fontSize: 12.5, marginTop: 4 }}>
            Managed by <span className="text-(--text-h) font-semibold">you</span> · LCK Spring Fantasy
          </div>
        </div>
      </div>

      <div className="grid border-t border-(--border)" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {stats.map((s, i) => (
          <div key={s.label} style={{ padding: '14px 22px', borderLeft: i > 0 ? '1px solid var(--border)' : undefined }}>
            <div className={SECTION} style={sectionStyle}>{s.label}</div>
            <div className="tabular-nums font-display" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-h)', lineHeight: 1, margin: '6px 0 4px' }}>{s.value}</div>
            <div className="text-(--text-dim) tabular-nums" style={{ fontSize: 11 }}>{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Lineup ───────────────────────────────────────────────────────*/

function LineupRow({
  p, captain, onCaptain, onSwap, bench,
}: {
  p: FantasyPlayer;
  captain: boolean;
  onCaptain: () => void;
  onSwap: () => void;
  bench?: boolean;
}) {
  const base = totalPoints(p);
  const shown = captain ? base * 2 : base;
  return (
    <div
      className="grid items-center transition-colors hover:bg-(--surface-sub)"
      style={{ gridTemplateColumns: '52px minmax(0,1fr) 64px 88px 64px 150px', gap: 12, padding: '12px 16px', borderTop: '1px solid var(--border)' }}
    >
      <PlayerAvatar name={p.name} image={p.image} role={p.role} teamColor={p.teamColor} size={42} />

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-(--text-h) truncate" style={{ fontSize: 13.5 }}>{p.name}</span>
          {captain && (
            <span className="font-bold inline-flex items-center justify-center" style={{ width: 17, height: 17, borderRadius: 5, fontSize: 10, color: 'var(--accent)', background: 'var(--accent-muted)' }} title="Captain — points doubled">C</span>
          )}
        </div>
        <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
          <RolePill role={p.role} />
          <span className="text-(--text-dim) font-semibold" style={{ fontSize: 11 }}>{p.team}</span>
        </div>
      </div>

      <div className="text-center">
        <div className="text-(--text-dim)" style={{ fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Price</div>
        <div className="tabular-nums font-semibold text-(--text)" style={{ fontSize: 12.5, marginTop: 2 }}>{p.price.toFixed(1)}M</div>
      </div>

      <div className="flex items-center justify-center" title="Form (recent gameweeks)">
        <FormSpark form={p.form} />
      </div>

      <div className="text-right">
        <div className="tabular-nums font-display font-bold text-(--text-h)" style={{ fontSize: 19, lineHeight: 1 }}>{fmtPts(shown)}</div>
        {captain && <div className="text-(--accent-2) tabular-nums" style={{ fontSize: 9.5, marginTop: 2 }}>2× of {fmtPts(base)}</div>}
      </div>

      <div className="flex items-center justify-end gap-1.5">
        {!bench && (
          <button
            type="button"
            onClick={onCaptain}
            className="fantasy-mini-btn"
            data-active={captain || undefined}
            title="Make captain"
          >
            {captain ? 'Captain' : 'Set C'}
          </button>
        )}
        <button type="button" onClick={onSwap} className="fantasy-mini-btn" title="Swap player">Swap</button>
      </div>
    </div>
  );
}

function Lineup({
  starters, bench, captainId, onCaptain, onSwap,
}: {
  starters: FantasyPlayer[];
  bench: FantasyPlayer[];
  captainId: number;
  onCaptain: (id: number) => void;
  onSwap: (p: FantasyPlayer, bench: boolean) => void;
}) {
  const ordered = [...starters].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <h3 className="section-label">Starting lineup</h3>
        <span className="text-(--text-dim)" style={{ fontSize: 11 }}>Captain scores double · swaps lock at deadline</span>
      </div>
      <Card style={{ overflow: 'hidden' }}>
        {/* header */}
        <div
          className="grid items-center text-(--text-dim) uppercase font-semibold"
          style={{ gridTemplateColumns: '52px minmax(0,1fr) 64px 88px 64px 150px', gap: 12, padding: '9px 16px', fontSize: 9.5, letterSpacing: '0.07em' }}
        >
          <span />
          <span>Player</span>
          <span className="text-center">Cost</span>
          <span className="text-center">Form</span>
          <span className="text-right">Pts</span>
          <span />
        </div>
        {ordered.map((p) => (
          <LineupRow
            key={p.id}
            p={p}
            captain={p.id === captainId}
            onCaptain={() => onCaptain(p.id)}
            onSwap={() => onSwap(p, false)}
          />
        ))}
      </Card>

      <h3 className="section-label" style={{ margin: '22px 0 10px' }}>Bench</h3>
      <Card style={{ overflow: 'hidden' }}>
        {bench.map((p) => (
          <LineupRow key={p.id} p={p} captain={false} onCaptain={() => {}} onSwap={() => onSwap(p, true)} bench />
        ))}
      </Card>
    </div>
  );
}

/* ── Points breakdown ─────────────────────────────────────────────*/

function PointsBreakdown({ starters, captainId }: { starters: FantasyPlayer[]; captainId: number }) {
  const ordered = [...starters].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  const [openId, setOpenId] = useState<number | null>(ordered[0]?.id ?? null);

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <h3 className="section-label">Gameweek {GAMEWEEK} points breakdown</h3>
        <span className="text-(--text-dim)" style={{ fontSize: 11 }}>2 / death · 1.5 / assist · 2 / kill · 0.02 / CS</span>
      </div>
      <Card style={{ overflow: 'hidden' }}>
        {ordered.map((p, idx) => {
          const open = openId === p.id;
          const base = totalPoints(p);
          const cap = p.id === captainId;
          return (
            <div key={p.id} style={{ borderTop: idx > 0 ? '1px solid var(--border)' : undefined }}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : p.id)}
                className="w-full grid items-center transition-colors hover:bg-(--surface-sub)"
                style={{ gridTemplateColumns: '40px minmax(0,1fr) auto 20px', gap: 12, padding: '11px 16px', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer' }}
              >
                <PlayerAvatar name={p.name} image={p.image} role={p.role} teamColor={p.teamColor} size={32} />
                <div className="min-w-0">
                  <div className="font-semibold text-(--text-h) truncate" style={{ fontSize: 13 }}>{p.name}</div>
                  <div className="text-(--text-dim) tabular-nums" style={{ fontSize: 10.5, marginTop: 1 }}>{p.kills}/{p.deaths}/{p.assists} · {p.cs} CS</div>
                </div>
                <div className="text-right">
                  <span className="tabular-nums font-display font-bold text-(--text-h)" style={{ fontSize: 16 }}>{fmtPts(cap ? base * 2 : base)}</span>
                  {cap && <span className="text-(--accent-2)" style={{ fontSize: 10, marginLeft: 5 }}>C</span>}
                </div>
                <span className="text-(--text-faint)" style={{ fontSize: 11, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>›</span>
              </button>

              {open && (
                <div style={{ padding: '4px 16px 14px 68px' }}>
                  {scoreLines(p).map((l) => (
                    <div key={l.label} className="flex items-center justify-between" style={{ padding: '5px 0', fontSize: 12 }}>
                      <span className="text-(--text)">
                        {l.label}
                        <span className="text-(--text-faint)" style={{ marginLeft: 8, fontSize: 10.5 }}>{l.detail}</span>
                      </span>
                      <span className={`tabular-nums font-semibold ${l.points < 0 ? 'text-(--red)' : 'text-(--text-h)'}`}>
                        {l.points > 0 ? '+' : ''}{fmtPts(Math.round(l.points * 10) / 10)}
                      </span>
                    </div>
                  ))}
                  {cap && (
                    <div className="flex items-center justify-between" style={{ padding: '5px 0', fontSize: 12, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                      <span className="text-(--accent-2) font-semibold">Captain multiplier</span>
                      <span className="tabular-nums font-semibold text-(--accent-2)">×2</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

/* ── League table ─────────────────────────────────────────────────*/

function LeagueTable({ rivals }: { rivals: Rival[] }) {
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <h3 className="section-label">League standings</h3>
        <span className="text-(--text-dim)" style={{ fontSize: 11 }}>LCK Spring Fantasy · {rivals.length} managers</span>
      </div>
      <Card style={{ overflow: 'hidden' }}>
        <div
          className="grid items-center text-(--text-dim) uppercase font-semibold"
          style={{ gridTemplateColumns: '40px minmax(0,1fr) 80px 90px', gap: 12, padding: '9px 16px', fontSize: 9.5, letterSpacing: '0.07em', borderBottom: '1px solid var(--border)' }}
        >
          <span className="text-center">#</span>
          <span>Manager</span>
          <span className="text-right">GW{GAMEWEEK}</span>
          <span className="text-right">Total</span>
        </div>
        {rivals.map((r, i) => (
          <div
            key={r.rank}
            className="grid items-center"
            style={{
              gridTemplateColumns: '40px minmax(0,1fr) 80px 90px',
              gap: 12, padding: '11px 16px',
              borderTop: i > 0 ? '1px solid var(--border)' : undefined,
              background: r.you ? 'var(--accent-muted)' : undefined,
            }}
          >
            <span className="text-center tabular-nums font-semibold text-(--text-dim)" style={{ fontSize: 12.5 }}>{r.rank}</span>
            <div className="min-w-0">
              <div className="font-semibold text-(--text-h) truncate" style={{ fontSize: 13 }}>
                {r.teamName}
                {r.you && <span className="badge badge-accent" style={{ marginLeft: 8 }}>You</span>}
              </div>
              <div className="text-(--text-dim) truncate" style={{ fontSize: 10.5, marginTop: 1 }}>{r.manager}</div>
            </div>
            <span className="text-right tabular-nums text-(--text)" style={{ fontSize: 12.5 }}>{r.gw}</span>
            <span className="text-right tabular-nums font-semibold text-(--text-h)" style={{ fontSize: 13 }}>{r.total.toLocaleString()}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ── Swap drawer ──────────────────────────────────────────────────*/

function SwapDrawer({
  target, currentSquad, onClose, onConfirm,
}: {
  target: FantasyPlayer;
  currentSquad: number[];
  onClose: () => void;
  onConfirm: (incoming: FantasyPlayer) => void;
}) {
  const candidates = TRANSFER_POOL
    .filter((c) => c.role === target.role && !currentSquad.includes(c.id))
    .sort((a, b) => totalPoints(b) - totalPoints(a));

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(20,16,30,0.45)', backdropFilter: 'blur(2px)', display: 'flex', justifyContent: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-soft-shadow"
        style={{ width: 420, maxWidth: '92vw', height: '100%', background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="flex items-center justify-between" style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div className="eyebrow">Transfer · {ROLE_ABBR[target.role]}</div>
            <h4 style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>Swap out {target.name}</h4>
          </div>
          <button type="button" onClick={onClose} className="fantasy-mini-btn" style={{ fontSize: 16, padding: '4px 10px' }}>✕</button>
        </div>

        <div className="flex items-center gap-3" style={{ padding: '12px 20px', background: 'var(--surface-sub)', borderBottom: '1px solid var(--border)' }}>
          <PlayerAvatar name={target.name} image={target.image} role={target.role} teamColor={target.teamColor} size={36} />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-(--text-h)" style={{ fontSize: 13 }}>{target.name} · {target.team}</div>
            <div className="text-(--text-dim) tabular-nums" style={{ fontSize: 11 }}>{target.price.toFixed(1)}M · {fmtPts(totalPoints(target))} pts GW{GAMEWEEK}</div>
          </div>
          <span className="text-(--text-faint)" style={{ fontSize: 18 }}>→</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }} className="es-scroll">
          <div className="text-(--text-dim)" style={{ padding: '12px 20px 6px', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
            Available {ROLE_ABBR[target.role]} players
          </div>
          {candidates.length === 0 && (
            <div className="text-(--text-dim) text-center" style={{ padding: '32px 20px', fontSize: 12.5 }}>No alternatives available.</div>
          )}
          {candidates.map((c) => (
            <div key={c.id} className="flex items-center gap-3" style={{ padding: '11px 20px', borderTop: '1px solid var(--border)' }}>
              <PlayerAvatar name={c.name} image={c.image} role={c.role} teamColor={c.teamColor} size={38} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-(--text-h) truncate" style={{ fontSize: 13 }}>{c.name} <span className="text-(--text-dim) font-normal">· {c.team}</span></div>
                <div className="text-(--text-dim) tabular-nums" style={{ fontSize: 10.5, marginTop: 1 }}>{c.price.toFixed(1)}M · {c.selectedBy}% owned</div>
              </div>
              <div className="text-right">
                <div className="tabular-nums font-display font-bold text-(--text-h)" style={{ fontSize: 15, lineHeight: 1 }}>{fmtPts(totalPoints(c))}</div>
                <div className="text-(--text-dim)" style={{ fontSize: 9.5 }}>GW pts</div>
              </div>
              <button
                type="button"
                onClick={() => onConfirm(c)}
                className="fantasy-mini-btn"
                data-active
                style={{ flexShrink: 0 }}
              >
                Transfer in
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Right siderail ───────────────────────────────────────────────*/

function FantasyRail({ squadValue }: { squadValue: number }) {
  const me = LEAGUE.find((r) => r.you)!;
  const ahead = LEAGUE.find((r) => r.rank === me.rank - 1);
  const behind = LEAGUE.find((r) => r.rank === me.rank + 1);
  return (
    <>
      <SideRail title="Next deadline">
        <div style={{ padding: '14px 18px' }}>
          <div className="font-display font-bold text-(--text-h)" style={{ fontSize: 22 }}>Sat 14:00</div>
          <div className="text-(--text-dim)" style={{ fontSize: 12, marginTop: 3 }}>Gameweek {GAMEWEEK + 1} · in 2d 6h</div>
          <div className="flex items-center justify-between" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 12 }}>
            <span className="text-(--text-dim)">Free transfers</span>
            <span className="font-semibold text-(--text-h)">{TRANSFERS_LEFT}</span>
          </div>
          <div className="flex items-center justify-between" style={{ marginTop: 8, fontSize: 12 }}>
            <span className="text-(--text-dim)">Squad value</span>
            <span className="font-semibold text-(--text-h) tabular-nums">{squadValue.toFixed(1)}M</span>
          </div>
          <div className="flex items-center justify-between" style={{ marginTop: 8, fontSize: 12 }}>
            <span className="text-(--text-dim)">In the bank</span>
            <span className="font-semibold text-(--text-h) tabular-nums">{(BUDGET - squadValue).toFixed(1)}M</span>
          </div>
        </div>
      </SideRail>

      <SideRail title="Your rank race">
        {ahead && <RaceRow label={`${ahead.rank}. ${ahead.teamName}`} pts={ahead.total} diff={ahead.total - me.total} />}
        <RaceRow label={`${me.rank}. ${me.teamName}`} pts={me.total} you />
        {behind && <RaceRow label={`${behind.rank}. ${behind.teamName}`} pts={behind.total} diff={behind.total - me.total} />}
      </SideRail>
    </>
  );
}

function RaceRow({ label, pts, diff, you }: { label: string; pts: number; diff?: number; you?: boolean }) {
  return (
    <div
      className="flex items-center justify-between"
      style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', background: you ? 'var(--accent-muted)' : undefined }}
    >
      <div className="min-w-0">
        <div className={`truncate ${you ? 'font-semibold text-(--text-h)' : 'text-(--text)'}`} style={{ fontSize: 12.5 }}>{label}</div>
        {diff !== undefined && (
          <div className={`tabular-nums ${diff > 0 ? 'text-(--red)' : 'text-(--green)'}`} style={{ fontSize: 10.5, marginTop: 1 }}>
            {diff > 0 ? `+${diff}` : diff} pts
          </div>
        )}
      </div>
      <span className="tabular-nums font-semibold text-(--text-h)" style={{ fontSize: 12.5 }}>{pts.toLocaleString()}</span>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────*/

type Tab = 'Lineup' | 'Points' | 'League';

export default function FantasyTeamPage() {
  const [starters, setStarters] = useState<FantasyPlayer[]>(STARTERS);
  const [bench, setBench] = useState<FantasyPlayer[]>(BENCH);
  const [captainId, setCaptainId] = useState<number>(3); // Faker by default
  const [activeTab, setActiveTab] = useState<Tab>('Lineup');
  const [swap, setSwap] = useState<{ player: FantasyPlayer; bench: boolean } | null>(null);

  const squadIds = useMemo(() => [...starters, ...bench].map((p) => p.id), [starters, bench]);
  const squadValue = useMemo(() => [...starters, ...bench].reduce((s, p) => s + p.price, 0), [starters, bench]);

  const gwTotal = useMemo(
    () => starters.reduce((s, p) => s + (p.id === captainId ? totalPoints(p) * 2 : totalPoints(p)), 0),
    [starters, captainId],
  );

  function handleConfirmSwap(incoming: FantasyPlayer) {
    if (!swap) return;
    const replace = (list: FantasyPlayer[]) => list.map((p) => (p.id === swap.player.id ? incoming : p));
    if (swap.bench) setBench(replace);
    else {
      setStarters(replace);
      if (swap.player.id === captainId) setCaptainId(incoming.id);
    }
    setSwap(null);
  }

  const tabs: Tab[] = ['Lineup', 'Points', 'League'];

  return (
    <EsportsLayout right={<FantasyRail squadValue={squadValue} />}>
      <Hero teamName="Gap Enjoyers" gwTotal={gwTotal} rivals={LEAGUE} />

      <div className="section-tabs" style={{ margin: '22px 0 22px' }}>
        {tabs.map((t) => (
          <button key={t} type="button" onClick={() => setActiveTab(t)} className={`section-tab${t === activeTab ? ' active' : ''}`}>
            {t}
          </button>
        ))}
      </div>

      {activeTab === 'Lineup' && (
        <Lineup
          starters={starters}
          bench={bench}
          captainId={captainId}
          onCaptain={setCaptainId}
          onSwap={(player, b) => setSwap({ player, bench: b })}
        />
      )}
      {activeTab === 'Points' && <PointsBreakdown starters={starters} captainId={captainId} />}
      {activeTab === 'League' && <LeagueTable rivals={LEAGUE} />}

      {swap && (
        <SwapDrawer
          target={swap.player}
          currentSquad={squadIds}
          onClose={() => setSwap(null)}
          onConfirm={handleConfirmSwap}
        />
      )}
    </EsportsLayout>
  );
}
