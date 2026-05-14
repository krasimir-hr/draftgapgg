import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { getLeagues } from '../api/core';
import type { League } from '../types/models';
import { slugify } from '../utils/slugs';

const ORDER = ['LCK', 'LPL', 'LEC', 'LCS', 'CBLoL', 'LCP'];

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
      className="w-18 shrink-0 border-r border-(--border) bg-(--surface) flex flex-col py-3 gap-0.5"
      style={{ position: 'sticky', top: 52, alignSelf: 'flex-start', height: 'calc(100svh - 52px)', overflowY: 'auto' }}
    >
      {leagues.map((league) => {
        const base = slugify(league.short_name ?? league.name);
        const onThisLeague =
          location.pathname === `/leagues/${base}` ||
          location.pathname.startsWith(`/leagues/${base}-20`);

        return (
          <NavLink
            key={league.id}
            to={`/leagues/${base}`}
            className={() =>
              `flex flex-col items-center gap-1 py-2.5 px-1 mx-1.5 rounded-lg transition-colors text-center ${
                onThisLeague
                  ? 'bg-(--accent-muted) text-(--accent-2)'
                  : 'text-(--text-dim) hover:bg-(--surface-sub) hover:text-(--text-h)'
              }`
            }
          >
            {league.logo ? (
              <img src={league.logo} alt="" className="logo-themed w-6 h-6 object-contain" />
            ) : (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                style={{ background: 'var(--accent)' }}
              >
                {(league.short_name ?? league.name).charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-[10px] font-semibold leading-tight">
              {league.short_name ?? league.name}
            </span>
          </NavLink>
        );
      })}
    </aside>
  );
}
