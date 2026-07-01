import { SideRail } from '../Sidebar';

export type Row = { label: string; logo: string | null; value: number; display: string; subLogo?: string | null };

// A leaderboard rail: a featured #1 hero followed by up to 4 more (5 total), every row on
// a shared grid so rank / logo / name / value line up vertically. Reused by the
// team and player stat rails so they stay visually identical.
const GRID = '12px 24px minmax(0, 1fr) auto';

export function StatLeaderboard({ title, rows, bleedImage, champIcon }: { title: string; rows: Row[]; bleedImage?: boolean; champIcon?: boolean }) {
  const [leader, ...others] = rows;
  const rest = others.slice(0, 4); // 5 total including the featured #1

  return (
    <SideRail>
      {/* Featured #1 — highlight card */}
      <div
        style={{
          display: 'flex',
          alignItems: bleedImage ? 'flex-end' : 'center',
          gap: 14,
          // Fixed height so the featured card matches across every rail (Players,
          // Team Stats, Champions) regardless of whether the image bleeds.
          height: 84,
          boxSizing: 'border-box',
          padding: bleedImage ? '0 14px 0' : '0 14px',
          background: 'linear-gradient(135deg, var(--accent-muted) 0%, transparent 100%)',
          borderBottom: rest.length > 0 ? '1px solid var(--border)' : 'none',
        }}
      >
        <LogoCell logo={leader.logo} label={leader.label} size={bleedImage ? 84 : 52} fill={bleedImage} champIcon={champIcon} />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, gap: 1, marginBottom: bleedImage ? 7 : 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0 }}>
            {leader.subLogo && <LogoCell logo={leader.subLogo} label={leader.label} size={16} />}
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-h)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {leader.label}
            </span>
          </span>
          <span className="tabular-nums" style={{ textAlign: 'right', fontSize: 25, fontWeight: 700, color: 'var(--text-h)', lineHeight: 1.05 }}>
            {leader.display}
          </span>
          <span style={{ textAlign: 'right', fontSize: 9.5, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            {title}
          </span>
        </div>
      </div>

      {/* The chasing pack */}
      {rest.map((r, i) => (
        <div
          key={r.label}
          style={{
            display: 'grid',
            gridTemplateColumns: GRID,
            alignItems: 'center',
            columnGap: 9,
            padding: '8px 14px',
            borderBottom: i === rest.length - 1 ? 'none' : '1px solid var(--border)',
          }}
        >
          <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textAlign: 'left' }}>
            {i + 2}
          </span>
          <LogoCell logo={bleedImage ? r.subLogo ?? null : r.logo} label={r.label} size={18} champIcon={champIcon} />
          <span style={{ minWidth: 0, fontSize: 12, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {r.label}
          </span>
          <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', textAlign: 'right' }}>
            {r.display}
          </span>
        </div>
      ))}
    </SideRail>
  );
}

function LogoCell({ logo, label, size, fill, champIcon }: { logo: string | null; label: string; size: number; fill?: boolean; champIcon?: boolean }) {
  if (!logo) return <div style={{ width: size, height: size }} />;
  if (champIcon) {
    const radius = size <= 36 ? 6 : size <= 56 ? 10 : 14;
    return (
      <div style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', flexShrink: 0, border: '1px solid var(--accent-border)', boxShadow: 'var(--shadow-md)' }}>
        <img src={logo} alt={label} width={size} height={size} loading="lazy" decoding="async"
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.14)' }} />
      </div>
    );
  }
  return (
    <img
      src={logo}
      alt={label}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      // `fill` (highlight player photo) crops to a consistent size, anchored to the
      // top so the player's head stays in frame; logos use contain to stay whole.
      style={{ width: size, height: size, objectFit: fill ? 'cover' : 'contain', objectPosition: fill ? 'top' : 'center', display: 'block' }}
    />
  );
}
