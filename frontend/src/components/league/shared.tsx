import React, { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChampionIcon } from '../ChampionIcon';
import type { EventStage, FormGame, ChampStat, FormMatch } from '../../types/models';

/* Role tokens */

export const ROLE_ABBR: Record<string, string> = {
  Top: 'TOP', Jungle: 'JGL', Mid: 'MID', Bot: 'BOT', Support: 'SUP',
};

export const ROLE_COLOR: Record<string, string> = {
  Top: 'var(--role-top)',
  Jungle: 'var(--role-jgl)',
  Mid: 'var(--role-mid)',
  Bot: 'var(--role-bot)',
  Support: 'var(--role-sup)',
};

const CD_POS = 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg';

export const ROLE_ICON: Record<string, string> = {
  Top:     `${CD_POS}/position-top.svg`,
  Jungle:  `${CD_POS}/position-jungle.svg`,
  Mid:     `${CD_POS}/position-middle.svg`,
  Bot:     `${CD_POS}/position-bottom.svg`,
  Support: `${CD_POS}/position-utility.svg`,
};

export const ROLE_OPTIONS = [
  { key: 'All',     label: 'All' },
  { key: 'Top',     label: 'TOP' },
  { key: 'Jungle',  label: 'JGL' },
  { key: 'Mid',     label: 'MID' },
  { key: 'Bot',     label: 'BOT' },
  { key: 'Support', label: 'SUP' },
] as const;

export type RoleFilter = typeof ROLE_OPTIONS[number]['key'];

/* Missing-data registry */

export const MISSING_PLAYER_FIELDS = [
  'win rate per player',
  'damage share per player',
  'form / trend (last 6 games)',
  'best champion per player (with stats)',
] as const;

export const MISSING_CHAMPION_FIELDS = [
  'champion presence trend (last 6 patches)',
  'blue/red side win-rate split',
] as const;

/* Atoms */

/**
 * Role position icon tinted with the role color (no background box). The SVG is
 * applied as a CSS mask so we can paint it in any color; falls back to the
 * role's letter when no icon is known.
 */
export function RoleIcon({ role, size = 16, color }: { role: string; size?: number; color?: string }) {
  const icon = ROLE_ICON[role];
  const c = color ?? 'var(--text-h)';
  if (!icon) {
    return (
      <span className="font-bold shrink-0" style={{ fontSize: size * 0.62, color: c, letterSpacing: '0.04em' }}>
        {role.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <span
      title={role}
      className="inline-block shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: c,
        WebkitMaskImage: `url(${icon})`,
        maskImage: `url(${icon})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  );
}

export function RoleChip({ role, size = 'md' }: { role: string; size?: 'sm' | 'md' }) {
  return <RoleIcon role={role} size={size === 'sm' ? 14 : 18} />;
}

export function TeamMark({
  short,
  logo,
  color,
  size = 28,
}: {
  short: string;
  logo?: string | null;
  color?: string | null;
  size?: number;
}) {
  if (logo) {
    return (
      <div
        className="shrink-0 flex items-center justify-center overflow-hidden"
        style={{ width: size, height: size }}
      >
        <img src={logo} alt={short} width={size} height={size} loading="lazy" decoding="async" className="max-w-full max-h-full object-contain" />
      </div>
    );
  }
  return (
    <div
      className="shrink-0 flex items-center justify-center text-white"
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(4, size * 0.22),
        background: color || '#171717',
        fontWeight: 700,
        fontSize: size * 0.38,
        fontFamily: 'var(--font-sans)',
        letterSpacing: '-0.04em',
      }}
    >
      {short.length > 2 ? short.slice(0, 2) : short}
    </div>
  );
}

export function PlayerAvatar({
  name,
  image,
  teamColor,
  size = 36,
}: {
  name: string;
  image?: string | null;
  role?: string;
  teamColor?: string | null;
  size?: number;
}) {
  const radius = Math.max(4, size * 0.18);

  if (image) {
    return (
      <div
        className="shrink-0 overflow-hidden"
        style={{
          width: size, height: size, borderRadius: radius,
          boxSizing: 'border-box',
          border: '1px solid var(--border)',
          background: 'var(--surface-sub)',
        }}
      >
        <img
          src={image}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover object-top"
        />
      </div>
    );
  }

  const tc = teamColor || '#171717';
  return (
    <div
      className="shrink-0 flex items-center justify-center text-white"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: tc,
        fontWeight: 700,
        fontSize: size * 0.32,
        fontFamily: 'var(--font-sans)',
        letterSpacing: '-0.03em',
      }}
    >
      {name.slice(0, 2)}
    </div>
  );
}

export function WinRateBar({ wr, width = 80, neutral = false }: { wr: number; width?: number; neutral?: boolean }) {
  const color = neutral
    ? 'var(--text-h)'
    : wr >= 55 ? 'var(--green)' : wr <= 45 ? 'var(--red)' : 'var(--text-dim)';
  const barColor = neutral ? 'var(--accent)' : color;
  return (
    <div className="inline-flex items-center" style={{ gap: 8 }}>
      <span
        className="tabular-nums font-semibold"
        style={{ color, fontSize: 13, minWidth: 42, textAlign: 'right' }}
      >
        {wr.toFixed(1)}%
      </span>
      <div
        style={{
          width,
          height: 4,
          borderRadius: 999,
          background: 'var(--surface-sub)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${Math.min(100, Math.max(0, wr))}%`,
            background: barColor,
            opacity: 0.65,
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  );
}

// Per-game form graph: each point is hoverable and reveals a portal tooltip
// (champion, opponent, result, KDA, PR) that isn't clipped by table overflow.
export function FormGraph({
  games,
  width = 64,
  height = 22,
  stroke = 'var(--accent)',
  teamShortNames = {},
}: {
  games: FormGame[];
  width?: number;
  height?: number;
  stroke?: string;
  teamShortNames?: Record<string, string>;
}) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  if (!games || games.length < 2) {
    return (
      <div
        style={{ width, height, opacity: 0.3 }}
        className="flex items-center justify-center text-(--text-dim)"
      >
        <span style={{ fontSize: 9 }}>—</span>
      </div>
    );
  }

  const values = games.map((g) => g.pr);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const pad = 2;
  const step = (width - pad * 2) / (values.length - 1);
  const norm = (v: number) => height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2);
  const pts = values.map((v, i) => ({ x: pad + i * step, y: norm(v) }));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y.toFixed(1)}`).join(' ');
  const area = `${d} L ${pts[pts.length - 1].x} ${height - pad} L ${pad} ${height - pad} Z`;

  const hovered = hover ? games[hover.i] : null;

  return (
    <div style={{ position: 'relative', display: 'inline-block', lineHeight: 0, verticalAlign: 'middle' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        <path d={area} fill={stroke} opacity={0.12} />
        <path d={d} stroke={stroke} strokeWidth={1.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle
            key={`pt${i}`}
            cx={p.x}
            cy={p.y}
            r={hover?.i === i ? 2.8 : 0}
            fill={stroke}
            stroke="var(--surface)"
            strokeWidth={1}
          />
        ))}
        {/* Wide transparent hit areas so the tiny points are easy to hover. */}
        {pts.map((p, i) => (
          <rect
            key={`hit${i}`}
            x={p.x - step / 2}
            y={0}
            width={step}
            height={height}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onMouseEnter={(e) => {
              const svg = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
              setHover({ i, x: svg.left + p.x, y: svg.top });
            }}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hovered && createPortal(
        <FormTooltip g={hovered} x={hover!.x} y={hover!.y} teamShortNames={teamShortNames} />,
        document.body,
      )}
    </div>
  );
}

function FormTooltip({
  g, x, y, teamShortNames,
}: {
  g: FormGame;
  x: number;
  y: number;
  teamShortNames: Record<string, string>;
}) {
  const oppShort = teamShortNames[g.opponent] || g.opponent;
  const dateLabel = g.date
    ? new Date(g.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;
  return (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        transform: 'translate(-50%, calc(-100% - 10px))',
        zIndex: 1000,
        pointerEvents: 'none',
      }}
    >
      <div
        className="card"
        style={{ padding: '8px 10px', borderRadius: 9, boxShadow: 'var(--shadow-md)', minWidth: 142, background: 'var(--surface)' }}
      >
        <div className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
          {g.champion_icon && <ChampionIcon src={g.champion_icon} alt={g.champion ?? ''} size={20} />}
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-h)' }}>{g.champion ?? '—'}</span>
          {g.win != null && (
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: g.win ? 'var(--accent-2)' : 'var(--text-dim)',
              }}
            >
              {g.win ? 'WIN' : 'LOSS'}
            </span>
          )}
        </div>
        <TipRow label={`vs ${oppShort}`} value={`${g.kills}/${g.deaths}/${g.assists}`} />
        <TipRow label="PR" value={g.pr.toFixed(1)} valueColor="var(--accent-2)" />
        {dateLabel && <TipRow label="Date" value={dateLabel} />}
      </div>
    </div>
  );
}

function TipRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between" style={{ fontSize: 11, gap: 12, marginTop: 2 }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span className="tabular-nums" style={{ color: valueColor ?? 'var(--text)', fontWeight: valueColor ? 600 : 500 }}>{value}</span>
    </div>
  );
}

/**
 * A row of champion icons (a player's best champions). Each icon is hoverable
 * and reveals the same style of portal tooltip as the form graph, showing the
 * champion, games on it and average PR.
 */
export function ChampCluster({ champs, size = 30 }: { champs: ChampStat[]; size?: number }) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  if (!champs || champs.length === 0) return <span className="text-(--text-dim)">—</span>;
  const hovered = hover ? champs[hover.i] : null;
  return (
    <div className="inline-flex items-center" style={{ gap: 6, verticalAlign: 'middle' }}>
      {champs.map((c, i) => (
        <span
          key={c.name}
          onMouseEnter={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setHover({ i, x: r.left + r.width / 2, y: r.top });
          }}
          onMouseLeave={() => setHover(null)}
          style={{
            display: 'inline-flex',
            cursor: 'pointer',
            transition: 'transform var(--t-fast)',
            transform: hover?.i === i ? 'translateY(-2px)' : 'none',
          }}
        >
          {c.icon ? (
            <ChampionIcon src={c.icon} alt={c.name} size={size} />
          ) : (
            <span style={{ width: size, height: size, borderRadius: 6, border: '1px solid var(--border)', display: 'inline-block' }} />
          )}
        </span>
      ))}
      {hovered && createPortal(<ChampTooltip c={hovered} x={hover!.x} y={hover!.y} />, document.body)}
    </div>
  );
}

function ChampTooltip({ c, x, y }: { c: ChampStat; x: number; y: number }) {
  return (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        transform: 'translate(-50%, calc(-100% - 10px))',
        zIndex: 1000,
        pointerEvents: 'none',
      }}
    >
      <div
        className="card"
        style={{ padding: '8px 10px', borderRadius: 9, boxShadow: 'var(--shadow-md)', minWidth: 142, background: 'var(--surface)' }}
      >
        <div className="flex items-center" style={{ gap: 7, marginBottom: 6 }}>
          {c.icon && <ChampionIcon src={c.icon} alt={c.name} size={22} />}
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-h)' }}>{c.name}</span>
        </div>
        <TipRow label="Games" value={String(c.games)} />
        <TipRow label="PR" value={c.pr.toFixed(1)} valueColor="var(--accent-2)" />
      </div>
    </div>
  );
}

export function FormChips({ form }: { form: ('W' | 'L')[] }) {
  return (
    <span className="inline-flex" style={{ gap: 3 }}>
      {form.map((c, i) => (
        <span
          key={i}
          className="form-chip"
          style={{
            background: c === 'W' ? 'var(--green-muted)' : 'var(--red-muted)',
            color: c === 'W' ? 'var(--green)' : 'var(--red)',
          }}
        >
          {c}
        </span>
      ))}
    </span>
  );
}

/** Like FormChips, but each chip reveals a tooltip with match detail on hover. */
export function FormHistory({
  form, teamShortNames = {},
}: {
  form: FormMatch[];
  teamShortNames?: Record<string, string>;
}) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  if (!form.length) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
  const hovered = hover ? form[hover.i] : null;

  return (
    <span className="inline-flex" style={{ gap: 3 }}>
      {form.map((f, i) => (
        <span
          key={i}
          className="form-chip"
          style={{
            background: f.result === 'W' ? 'var(--green-muted)' : 'var(--red-muted)',
            color: f.result === 'W' ? 'var(--green)' : 'var(--red)',
            cursor: 'default',
          }}
          onMouseEnter={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setHover({ i, x: r.left + r.width / 2, y: r.top });
          }}
          onMouseLeave={() => setHover(null)}
        >
          {f.result}
        </span>
      ))}
      {hovered && createPortal(
        <FormMatchTooltip f={hovered} x={hover!.x} y={hover!.y} teamShortNames={teamShortNames} />,
        document.body,
      )}
    </span>
  );
}

function FormMatchTooltip({
  f, x, y, teamShortNames,
}: {
  f: FormMatch;
  x: number;
  y: number;
  teamShortNames: Record<string, string>;
}) {
  const oppShort = teamShortNames[f.opponent] || f.opponent;
  const dateLabel = f.datetime_utc
    ? new Date(f.datetime_utc).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;
  return (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        transform: 'translate(-50%, calc(-100% - 10px))',
        zIndex: 1000,
        pointerEvents: 'none',
      }}
    >
      <div
        className="card"
        style={{ padding: '8px 10px', borderRadius: 9, boxShadow: 'var(--shadow-md)', minWidth: 150, background: 'var(--surface)' }}
      >
        <div className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)' }}>vs</span>
          {f.opponent_logo && (
            <img src={f.opponent_logo} alt={oppShort} style={{ width: 18, height: 18, objectFit: 'contain' }} />
          )}
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-h)' }}>{oppShort}</span>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: f.result === 'W' ? 'var(--accent-2)' : 'var(--text-dim)',
            }}
          >
            {f.result === 'W' ? 'WIN' : 'LOSS'}
          </span>
        </div>
        <div className="flex items-center" style={{ gap: 8, fontSize: 11, color: 'var(--text-dim)' }}>
          <span className="tabular-nums" style={{ fontWeight: 700, color: 'var(--text)' }}>{f.score}</span>
          {f.tab && <span>{f.tab}</span>}
          {dateLabel && <span style={{ marginLeft: 'auto' }}>{dateLabel}</span>}
        </div>
      </div>
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'accent' | 'green' | 'red' | 'amber' | 'neutral';
  children: ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function RoleFilterBar({
  selected,
  onChange,
}: {
  selected: RoleFilter;
  onChange: (r: RoleFilter) => void;
}) {
  return (
    <div className="flex items-center gap-1 px-5 py-3 border-b border-(--border)">
      {ROLE_OPTIONS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`px-2.5 py-1 rounded-md text-xs font-semibold tracking-wide transition-colors ${
            selected === key
              ? 'bg-(--accent-muted) text-(--accent-2)'
              : 'text-(--text-dim) hover:text-(--text-h) hover:bg-(--surface-sub)'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}


/* Layout switcher (Table / Cards / Fantasy) */

export type ViewLayout = 'table' | 'cards';

export function IconTable() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x={3} y={3} width={18} height={18} rx={2} />
      <path d="M3 9h18M3 15h18M9 3v18" />
    </svg>
  );
}
export function IconCards() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x={3} y={3} width={7} height={7} rx={1.5} />
      <rect x={14} y={3} width={7} height={7} rx={1.5} />
      <rect x={3} y={14} width={7} height={7} rx={1.5} />
      <rect x={14} y={14} width={7} height={7} rx={1.5} />
    </svg>
  );
}
export function LayoutSwitcher<L extends ViewLayout>({
  layout,
  onChange,
  options,
}: {
  layout: L;
  onChange: (l: L) => void;
  options: { key: L; label: string; icon: ReactNode }[];
}) {
  return (
    <div className="flex items-center gap-1">
      <span
        className="font-semibold uppercase text-(--text-dim) mr-2"
        style={{ fontSize: 10, letterSpacing: '0.1em' }}
      >
        Layout
      </span>
      {options.map((v) => {
        const active = layout === v.key;
        return (
          <button
            key={v.key}
            type="button"
            title={v.label}
            onClick={() => onChange(v.key)}
            className="transition-all"
            style={{
              width: 32,
              height: 30,
              padding: 0,
              border: '1px solid ' + (active ? 'var(--accent-border)' : 'transparent'),
              borderRadius: 9,
              background: active ? 'var(--accent-muted)' : 'transparent',
              color: active ? 'var(--accent-2)' : 'var(--text-dim)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {v.icon}
          </button>
        );
      })}
    </div>
  );
}

/* Stage picker — same button style as LayoutSwitcher */

const pickerBtnStyle = (active: boolean): React.CSSProperties => ({
  height: 30,
  padding: '0 10px',
  border: '1px solid ' + (active ? 'var(--accent-border)' : 'transparent'),
  borderRadius: 9,
  background: active ? 'var(--accent-muted)' : 'transparent',
  color: active ? 'var(--accent-2)' : 'var(--text-dim)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap',
});

const Pipe = ({ style }: { style?: React.CSSProperties }) => (
  <span aria-hidden style={{ color: 'var(--text-faint)', fontSize: 13, userSelect: 'none', flexShrink: 0, ...style }}>|</span>
);

export function StagePicker({ stages, selected, onSelect }: {
  stages: EventStage[];
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  const options = [
    { id: null as number | null, name: 'Overall' },
    ...[...stages].sort((a, b) => a.order - b.order).map((s) => ({ id: s.id as number | null, name: s.name })),
  ];
  return (
    <div className="flex items-center" style={{ gap: 4 }}>
      {options.map((opt) => (
        <button key={opt.id ?? 'overall'} type="button" onClick={() => onSelect(opt.id)} className="transition-all" style={pickerBtnStyle(selected === opt.id)}>
          {opt.name}
        </button>
      ))}
    </div>
  );
}

/* Filter bar (search + role chips + selects + layout) */

export function FilterBar({
  query,
  onQuery,
  role,
  onRole,
  team,
  onTeam,
  teamOptions,
  sort,
  onSort,
  sortOptions,
  stagePicker,
  layoutSwitcher,
}: {
  query?: string;
  onQuery?: (v: string) => void;
  role: RoleFilter;
  onRole: (r: RoleFilter) => void;
  team?: string;
  onTeam?: (t: string) => void;
  teamOptions?: { value: string; label: string }[];
  sort?: string;
  onSort?: (s: string) => void;
  sortOptions?: { key: string; label: string }[];
  stagePicker?: ReactNode;
  layoutSwitcher?: ReactNode;
}) {
  const hasLeft = stagePicker !== undefined || onQuery !== undefined;
  const hasRight = layoutSwitcher !== undefined || (teamOptions && onTeam) || (sortOptions && sort != null && onSort);

  return (
    <div
      className="card card-soft-shadow flex items-center"
      style={{ padding: '8px 14px', background: 'var(--surface)', border: 'none' }}
    >
      {/* Left: stage picker / search */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
        {stagePicker}
        {onQuery !== undefined && (
          <div className="relative flex items-center" style={{ flex: '1 1 200px', minWidth: 180 }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" className="absolute left-3 pointer-events-none opacity-50">
              <circle cx={11} cy={11} r={7} stroke="currentColor" strokeWidth={2} />
              <path d="m20 20-3-3" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
            <input
              value={query ?? ''}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search by name, team, or champion"
              className="w-full outline-none text-(--text-h)"
              style={{ padding: '8px 12px 8px 32px', background: 'transparent', border: '1px solid transparent', borderRadius: 8, fontSize: 13, transition: 'all var(--t-fast)' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.background = 'var(--surface)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
            />
          </div>
        )}
      </div>

      {hasLeft && <Pipe style={{ margin: '0 14px' }} />}

      {/* Center: roles */}
      <div className="flex items-center" style={{ gap: 4 }}>
        {ROLE_OPTIONS.map((r) => {
          const active = role === r.key;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => onRole(r.key)}
              title={r.key === 'All' ? 'All roles' : r.key}
              className="transition-all"
              style={pickerBtnStyle(active)}
            >
              {r.key === 'All' ? r.label : <RoleIcon role={r.key} size={15} />}
            </button>
          );
        })}
      </div>

      {hasRight && <Pipe style={{ margin: '0 14px' }} />}

      {/* Right: team / sort / layout */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
        {teamOptions && onTeam && (
          <select className="field-select" style={{ height: 30, boxSizing: 'border-box' }} value={team ?? 'All'} onChange={(e) => onTeam(e.target.value)}>
            {teamOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        )}
        {sortOptions && sort != null && onSort && (
          <select className="field-select" style={{ height: 30, boxSizing: 'border-box' }} value={sort} onChange={(e) => onSort(e.target.value)}>
            {sortOptions.map((s) => <option key={s.key} value={s.key}>Sort: {s.label}</option>)}
          </select>
        )}
        {layoutSwitcher}
      </div>
    </div>
  );
}

/* Missing-data note (shown at top of tab when defaults are in use) */

export function MissingDataNote({ items }: { items: readonly string[] }) {
  return (
    <div
      className="card flex items-start gap-3"
      style={{
        padding: '10px 14px',
        background: 'var(--amber-muted)',
        borderColor: 'color-mix(in srgb, var(--amber) 35%, transparent)',
        borderRadius: 10,
      }}
    >
      <span
        className="font-bold"
        style={{ color: 'var(--amber)', fontSize: 11, letterSpacing: '0.1em', marginTop: 1 }}
      >
        NOTE
      </span>
      <div className="flex-1 min-w-0">
        <div
          className="font-semibold text-(--text-h)"
          style={{ fontSize: 12.5 }}
        >
          Showing defaults for fields not yet provided by the API:
        </div>
        <div className="text-(--text)" style={{ fontSize: 12, marginTop: 2 }}>
          {items.join(' · ')}
        </div>
      </div>
    </div>
  );
}
