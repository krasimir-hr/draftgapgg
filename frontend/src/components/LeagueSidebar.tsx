import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { getLeagues } from '../api/core';
import type { League } from '../types/models';
import { slugify } from '../utils/slugs';

const ORDER = ['LCK', 'LPL', 'LEC', 'LCS', 'CBLoL', 'LCP'];

const LEAGUE_COLOR: Record<string, string> = {
  LCK:   '#a78bfa',
  LPL:   '#dc2626',
  LEC:   '#3b82f6',
  LCS:   '#06b6d4',
  CBLoL: '#10b981',
  LCP:   '#f59e0b',
};

export default function LeagueSidebar() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const location = useLocation();

  useEffect(() => {
    getLeagues({ page: 1, page_size: 100 }).then((res) => {
      const all = res.data.results;
      const sorted: League[] = [];
      for (const name of ORDER) {
        const found = all.find((l) => l.short_name === name);
        if (found) sorted.push(found);
      }
      setLeagues(sorted);
    }).catch(() => {});
  }, []);

  return (
    <aside
      className="shrink-0 border-r border-(--border) bg-(--surface) flex flex-col py-3.5"
      style={{
        width: 76,
        position: 'sticky',
        top: 56,
        alignSelf: 'flex-start',
        height: 'calc(100svh - 56px)',
        overflowY: 'auto',
        gap: 4,
      }}
    >
      {leagues.map((league) => {
        const label = league.short_name ?? league.name;
        const base = slugify(label);
        const onThisLeague =
          location.pathname === `/leagues/${base}` ||
          location.pathname.startsWith(`/leagues/${base}-20`) ||
          location.pathname.startsWith(`/leagues/${base}/`);

        const color = LEAGUE_COLOR[label] ?? 'var(--accent)';

        return (
          <NavLink
            key={league.id}
            to={`/leagues/${base}`}
            className="flex flex-col items-center"
            style={{
              padding: '7px 0',
              margin: '0 10px',
              borderRadius: 9,
              background: onThisLeague ? 'var(--accent-muted)' : 'transparent',
              transition: 'background var(--t-fast)',
              textDecoration: 'none',
            }}
          >
            <div
              className="flex items-center justify-center"
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: color,
                color: 'white',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                fontSize: 11.5,
                letterSpacing: '-0.02em',
                boxShadow: onThisLeague
                  ? '0 0 0 2px var(--surface), 0 0 0 3px var(--accent-border)'
                  : 'none',
                overflow: 'hidden',
              }}
            >
              {league.logo ? (
                <img
                  src={league.logo}
                  alt={label}
                  className="logo-themed"
                  style={{ width: 26, height: 26, objectFit: 'contain' }}
                />
              ) : (
                label
              )}
            </div>
          </NavLink>
        );
      })}
    </aside>
  );
}
