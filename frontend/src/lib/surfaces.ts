// Shared card surfaces, kept in one place so the home day-card headers and the
// League page hero header stay visually identical.

// The side-rail / standings card surface (subtle diagonal accent wash).
export const RAIL_SURFACE =
  'linear-gradient(135deg, color-mix(in srgb, var(--accent-muted) 40%, transparent) 0%, transparent 55%, color-mix(in srgb, var(--accent-muted) 40%, transparent) 100%), var(--surface)';

// The side-rail leaderboard's featured (#1) row — an accent-muted fade layered
// over the rail surface. Opaque, so it reads as a solid header on the DarkVeil.
export const RAIL_FEATURED = `linear-gradient(135deg, var(--accent-muted) 0%, transparent 100%), ${RAIL_SURFACE}`;
