import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { getLeagues } from '../api/core';
import type { League } from '../types/models';
import { slugify } from '../utils/slugs';
import { SideRail } from './Sidebar';

const REGIONAL      = ['LCK', 'LPL', 'LEC', 'LCS', 'CBLOL', 'LCP'];
const INTERNATIONAL = ['Worlds', 'MSI', 'First Stand', 'EWC'];

export default function LeagueSidebar({ style, className }: { style?: React.CSSProperties; className?: string }) {
  const [byShort, setByShort] = useState<Record<string, League>>({});
  const location = useLocation();

  useEffect(() => {
    getLeagues({ page: 1, page_size: 100 }).then((res) => {
      const map: Record<string, League> = {};
      for (const l of res.data.results) {
        if (l.short_name) map[l.short_name] = l;
      }
      setByShort(map);
    }).catch(() => {});
  }, []);

  const renderItem = (short: string, isLast: boolean) => {
    const league = byShort[short];
    if (!league) return null;
    const label = league.short_name ?? league.name;
    const base = slugify(label);
    const active =
      location.pathname === `/leagues/${base}` ||
      location.pathname.startsWith(`/leagues/${base}-20`) ||
      location.pathname.startsWith(`/leagues/${base}/`);

    return (
      <NavLink
        key={league.id}
        to={`/leagues/${base}`}
        className={`league-nav-row${active ? ' active' : ''}`}
        style={{ borderBottom: isLast ? 'none' : '1px solid var(--border)' }}
      >
        <span className="league-nav-logo">
          {league.logo ? (
            <img src={league.logo} alt={label} width={20} height={20} loading="lazy" decoding="async" />
          ) : (
            <span className="league-nav-fallback">{label.slice(0, 3)}</span>
          )}
        </span>
        <span className="league-nav-name">{label}</span>
      </NavLink>
    );
  };

  // Only render groups whose leagues have actually loaded, so the panels never
  // show a hollow border before data arrives.
  const section = (shorts: string[]) => {
    const items = shorts.filter((s) => byShort[s]);
    return items.map((short, i) => renderItem(short, i === items.length - 1));
  };

  const regional = section(REGIONAL);
  const international = section(INTERNATIONAL);

  return (
    <aside className={`league-sidebar${className ? ` ${className}` : ''}`} style={style}>
      {regional.length > 0 && <SideRail title="Regional">{regional}</SideRail>}
      {international.length > 0 && <SideRail title="International">{international}</SideRail>}
    </aside>
  );
}
