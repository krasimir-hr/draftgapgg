import { useState } from 'react';
import type { PlayerProfileTraits } from '../types/models';

/* ─────────────────────────────────────────────────────────────
   Hexagonal percentile radar. Six axes, each a player trait ranked
   against every other player in the same role + season. The filled
   polygon is the player's percentile profile; big numbers at each
   vertex read the rank out loud (matching the reference design).
   ───────────────────────────────────────────────────────────── */

const W = 460;
const H = 380;
const CX = W / 2;
const CY = H / 2 + 4;
const R = 116;            // outer ring radius
const LABEL_R = R + 30;   // where vertex labels sit

function polar(r: number, angleDeg: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

// Six vertices, pointy-top, going clockwise from the top.
const ANGLES = Array.from({ length: 6 }, (_, i) => -90 + i * 60);

function pctColor(p: number | null): string {
  if (p == null) return 'var(--text-faint)';
  if (p >= 66) return 'var(--text-h)';
  if (p >= 33) return 'var(--text)';
  return 'var(--text-dim)';
}

export default function PlayerTraits({ data }: { data: PlayerProfileTraits }) {
  const [hover, setHover] = useState<number | null>(null);
  const traits = data.traits.slice(0, 6);
  if (traits.length < 6) return null;

  const rings = [0.25, 0.5, 0.75, 1];

  // Player polygon points (percentile → radius).
  const pts = traits.map((t, i) => {
    const v = Math.max(0, Math.min(100, t.percentile ?? 0)) / 100;
    return polar(R * v, ANGLES[i]);
  });
  const polygon = pts.map(([x, y]) => `${x},${y}`).join(' ');

  return (
    <div
      className="card"
      style={{ borderRadius: 14, padding: '18px 20px 8px', background: 'var(--surface)' }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 2 }}>
        <div>
          <h3 className="text-(--text-h)" style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
            Player traits
          </h3>
          <p className="text-(--text-dim)" style={{ fontSize: 11.5, margin: '3px 0 0' }}>
            Percentile vs other {roleLabel(data.role)}
            {data.sample > 0 && (
              <span className="text-(--text-faint)"> · {data.sample} players</span>
            )}
          </p>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
        {/* grid rings */}
        {rings.map((lvl) => (
          <polygon
            key={lvl}
            points={ANGLES.map((a) => polar(R * lvl, a).join(',')).join(' ')}
            fill="none"
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}
        {/* spokes */}
        {ANGLES.map((a, i) => {
          const [x, y] = polar(R, a);
          return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="var(--border)" strokeWidth={1} />;
        })}

        {/* player polygon */}
        <polygon
          points={polygon}
          fill="var(--accent)"
          fillOpacity={0.16}
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {/* vertex dots */}
        {pts.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={hover === i ? 4.5 : 3}
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth={1.5}
          />
        ))}

        {/* labels */}
        {traits.map((t, i) => {
          const a = ANGLES[i];
          const [lx, ly] = polar(LABEL_R, a);
          const dx = Math.cos((a * Math.PI) / 180);
          const anchor = Math.abs(dx) < 0.3 ? 'middle' : dx > 0 ? 'start' : 'end';
          // Nudge top/bottom labels vertically so the two text lines clear the ring.
          const topRow = ly < CY ? ly - 6 : ly + 2;
          return (
            <g
              key={t.key}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'default' }}
            >
              <text
                x={lx}
                y={topRow}
                textAnchor={anchor}
                style={{ fontSize: 19, fontWeight: 700, fill: pctColor(t.percentile) }}
                className="tabular-nums font-display"
              >
                {t.percentile != null ? `${t.percentile}%` : '—'}
              </text>
              <text
                x={lx}
                y={topRow + 15}
                textAnchor={anchor}
                style={{ fontSize: 11, fill: 'var(--text-dim)' }}
              >
                {t.label}
              </text>
              <text
                x={lx}
                y={topRow + 28}
                textAnchor={anchor}
                style={{ fontSize: 10.5, fill: 'var(--text-faint)' }}
                className="tabular-nums"
              >
                {t.display}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    Top: 'top laners',
    Jungle: 'junglers',
    Mid: 'mid laners',
    Bot: 'bot laners',
    Support: 'supports',
  };
  return map[role] ?? `${role.toLowerCase()} players`;
}
