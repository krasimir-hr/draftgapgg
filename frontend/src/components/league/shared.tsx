import type { ReactNode } from 'react';

/* ── Role tokens ─────────────────────────────────────────────────────── */

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

/* ── Missing-data registry (visible to user, helps API planning) ────── */

export const MISSING_PLAYER_FIELDS = [
  'win rate per player',
  'damage share per player',
  'fantasy points',
  'ownership %',
  'form / trend (last 6 games)',
  'best champion per player (with stats)',
  'rank delta vs. previous week',
] as const;

export const MISSING_CHAMPION_FIELDS = [
  'champion KDA across the event',
  'champion presence trend (last 6 patches)',
  'blue/red side win-rate split',
] as const;

export const MISSING_LEAGUE_FIELDS = [
  'days until playoffs / final',
] as const;

/* ── Atoms ───────────────────────────────────────────────────────────── */

export function RoleChip({ role, size = 'md' }: { role: string; size?: 'sm' | 'md' }) {
  const sm = size === 'sm';
  const dim = sm ? 16 : 20;
  const pad = sm ? 3 : 4;
  const icon = ROLE_ICON[role];
  const color = ROLE_COLOR[role] || 'var(--text-dim)';
  return (
    <span
      title={role}
      className="inline-flex items-center justify-center shrink-0"
      style={{
        width: dim,
        height: dim,
        padding: pad,
        borderRadius: 4,
        background: color,
        lineHeight: 1,
      }}
    >
      {icon ? (
        <img
          src={icon}
          alt={role}
          className="brightness-0 invert"
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      ) : (
        <span
          className="text-white font-bold"
          style={{ fontSize: sm ? 8 : 9, letterSpacing: '0.06em' }}
        >
          {role.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
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
        <img src={logo} alt={short} className="max-w-full max-h-full object-contain" />
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
        background: color || 'var(--accent)',
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
  role,
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
          border: '1px solid var(--accent-border)',
          boxShadow: 'var(--shadow-md)',
          background: 'linear-gradient(160deg, #1e1830 0%, #0e0c18 100%)',
        }}
      >
        <img
          src={image}
          alt={name}
          className="w-full h-full object-cover object-top"
        />
      </div>
    );
  }

  const tc = teamColor || 'var(--accent)';
  const rc = role && ROLE_COLOR[role] ? ROLE_COLOR[role] : tc;
  return (
    <div
      className="shrink-0 flex items-center justify-center text-white"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `linear-gradient(135deg, ${tc} 0%, ${rc} 100%)`,
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

export function WinRateBar({ wr, width = 80 }: { wr: number; width?: number }) {
  const color = wr >= 55 ? 'var(--green)' : wr <= 45 ? 'var(--red)' : 'var(--text-dim)';
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
            background: color,
            opacity: 0.65,
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  );
}

export function Sparkline({
  values,
  width = 64,
  height = 22,
  stroke = 'var(--accent)',
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
}) {
  if (!values || values.length < 2) {
    return (
      <div
        style={{ width, height, opacity: 0.3 }}
        className="flex items-center justify-center text-(--text-dim)"
      >
        <span style={{ fontSize: 9 }}>—</span>
      </div>
    );
  }
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const pad = 2;
  const step = (width - pad * 2) / (values.length - 1);
  const norm = (v: number) => height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2);
  const d = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${pad + i * step} ${norm(v).toFixed(1)}`)
    .join(' ');
  const area = `${d} L ${pad + (values.length - 1) * step} ${height - pad} L ${pad} ${height - pad} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={area} fill={stroke} opacity={0.12} />
      <path d={d} stroke={stroke} strokeWidth={1.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
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

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'accent' | 'green' | 'red' | 'amber' | 'neutral';
  children: ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span className={`ml-0.5 ${active ? 'text-(--accent-2)' : 'opacity-25'}`}>
      {active ? (dir === 'desc' ? '↓' : '↑') : '↕'}
    </span>
  );
}

/* Keep for any callers still using the old role bar (StandingsTab is unaffected). */
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

/* ── Section label (drawer-style eyebrow used inside cards) ─────────── */

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3
      className="font-sans"
      style={{
        margin: 0,
        fontSize: 10.5,
        fontWeight: 600,
        color: 'var(--text-dim)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </h3>
  );
}

/* ── Layout switcher (Table / Cards / Fantasy) ──────────────────────── */

export type ViewLayout = 'table' | 'cards' | 'fantasy';

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
export function IconCrown() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 17h20l-1.5-9-4.5 5L12 5l-4 8-4.5-5z" />
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
              borderRadius: 7,
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

/* ── Filter bar (search + role chips + selects + layout) ─────────────── */

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
  layoutSwitcher,
}: {
  query: string;
  onQuery: (v: string) => void;
  role: RoleFilter;
  onRole: (r: RoleFilter) => void;
  team?: string;
  onTeam?: (t: string) => void;
  teamOptions?: { value: string; label: string }[];
  sort: string;
  onSort: (s: string) => void;
  sortOptions: { key: string; label: string }[];
  layoutSwitcher?: ReactNode;
}) {
  return (
    <div
      className="card card-soft-shadow flex flex-wrap items-center"
      style={{ padding: '12px 14px', gap: 10 }}
    >
      {/* Search */}
      <div
        className="relative flex items-center"
        style={{ flex: '1 1 240px', minWidth: 220 }}
      >
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          className="absolute left-3 pointer-events-none opacity-50"
        >
          <circle cx={11} cy={11} r={7} stroke="currentColor" strokeWidth={2} />
          <path d="m20 20-3-3" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search by name, team, or champion"
          className="w-full outline-none text-(--text-h)"
          style={{
            padding: '8px 12px 8px 32px',
            background: 'var(--surface-sub)',
            border: '1px solid transparent',
            borderRadius: 8,
            fontSize: 13,
            transition: 'all var(--t-fast)',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent-border)';
            e.currentTarget.style.background = 'var(--surface)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'transparent';
            e.currentTarget.style.background = 'var(--surface-sub)';
          }}
        />
      </div>

      {/* Role segmented control */}
      <div className="chip-group">
        {ROLE_OPTIONS.map((r) => {
          const active = role === r.key;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => onRole(r.key)}
              className={`chip${active ? ' active' : ''}`}
              style={{ minWidth: 36, fontSize: 11.5, padding: '5px 10px' }}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {/* Team select */}
      {teamOptions && onTeam && (
        <select
          className="field-select"
          value={team ?? 'All'}
          onChange={(e) => onTeam(e.target.value)}
        >
          {teamOptions.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      )}

      {/* Sort select */}
      <select
        className="field-select"
        value={sort}
        onChange={(e) => onSort(e.target.value)}
      >
        {sortOptions.map((s) => (
          <option key={s.key} value={s.key}>
            Sort: {s.label}
          </option>
        ))}
      </select>

      {layoutSwitcher && <div className="ml-auto">{layoutSwitcher}</div>}
    </div>
  );
}

/* ── Missing-data note (shown at top of tab when defaults are in use) ── */

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
        TODO
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
