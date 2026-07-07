import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './TopNav.css';

export type TopNavLeague = {
  label: string;
  slug: string;
  logo: string | null;
  group: 'regional' | 'international';
};

export interface TopNavProps {
  logo: string;
  logoAlt?: string;
  leagues: TopNavLeague[];
}

// Leagues whose crest reads dark and needs whitening on the dark-mode bar.
const WHITE_LOGO_SLUGS = new Set(['lck', 'cblol', 'worlds', 'msi']);

type SearchResult = {
  key: string;
  label: string;
  category: string;
  to: string;
  logo: string | null;
};

// App destinations that aren't leagues, exposed through search.
const PAGES: Omit<SearchResult, 'logo'>[] = [
  { key: 'p-matches', label: 'Matches', category: 'Page', to: '/matches' },
  { key: 'p-events', label: 'Events', category: 'Page', to: '/events' },
  { key: 'p-champions', label: 'Champions', category: 'Page', to: '/champions' },
  { key: 'p-fantasy', label: 'Fantasy', category: 'Page', to: '/fantasy' },
];

const SearchIcon = () => (
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
    <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10.5 10.5 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

function NavSearch({ leagues }: { leagues: TopNavLeague[] }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const index = useMemo<SearchResult[]>(
    () => [
      ...leagues.map((lg) => ({ key: `l-${lg.slug}`, label: lg.label, category: 'League', to: `/leagues/${lg.slug}`, logo: lg.logo })),
      ...PAGES.map((p) => ({ ...p, logo: null })),
    ],
    [leagues],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return index.filter((r) => r.label.toLowerCase().includes(q)).slice(0, 8);
  }, [query, index]);

  // Close the dropdown when clicking outside the search box.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const go = (r: SearchResult) => {
    navigate(r.to);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && results[active]) {
      go(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showResults = open && results.length > 0;

  return (
    <div className="top-nav-search" ref={ref}>
      <div className="top-nav-search-field">
        <SearchIcon />
        <input
          type="text"
          placeholder="Search…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          aria-label="Search leagues and pages"
        />
      </div>

      {showResults && (
        <div className="top-nav-search-results">
          {results.map((r, i) => (
            <button
              key={r.key}
              type="button"
              className={`top-nav-search-item${i === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r)}
            >
              {r.logo ? (
                <img src={r.logo} alt="" aria-hidden="true" width={20} height={20} />
              ) : (
                <span className="top-nav-search-icon" aria-hidden="true">↗</span>
              )}
              <span className="top-nav-search-label">{r.label}</span>
              <span className="top-nav-search-cat">{r.category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The row of league icon-buttons; rendered in the top bar on desktop and in
    its own bottom bar on mobile. */
function LeagueButtons({ leagues }: { leagues: TopNavLeague[] }) {
  const { pathname } = useLocation();

  const isActive = (slug: string) =>
    pathname === `/leagues/${slug}` ||
    pathname.startsWith(`/leagues/${slug}/`) ||
    pathname.startsWith(`/leagues/${slug}-20`);

  return (
    <div className="top-nav-leagues es-scroll">
      {leagues.map((lg, i) => (
        <Fragment key={lg.slug}>
          {i > 0 && leagues[i - 1].group !== lg.group && (
            <span className="top-nav-divider" aria-hidden="true" />
          )}
          <Link
            to={`/leagues/${lg.slug}`}
            className={`league-btn${isActive(lg.slug) ? ' active' : ''}${WHITE_LOGO_SLUGS.has(lg.slug) ? ' league-btn-white' : ''}`}
            title={lg.label}
            aria-label={lg.label}
          >
            {lg.logo ? (
              <img src={lg.logo} alt="" aria-hidden="true" width={24} height={24} loading="lazy" decoding="async" />
            ) : (
              <span className="league-btn-fallback">{lg.label.slice(0, 3)}</span>
            )}
            <span className="league-btn-label">{lg.label}</span>
          </Link>
        </Fragment>
      ))}
    </div>
  );
}

/** Floating pill bar. Desktop stacks two rows: the app logo + search on top,
    and a row of league tabs (crest + label) below. On mobile the league row is
    hidden and the tabs move into a separate bottom bar (see TopNav.css). */
export default function TopNav({ logo, logoAlt = 'Logo', leagues }: TopNavProps) {
  return (
    <>
      <div className="top-nav-container">
        <nav className="top-nav">
          <div className="top-nav-main">
            <Link to="/" className="top-nav-logo" aria-label="Home">
              <img className="top-nav-logo-full" src={logo} alt={logoAlt} width={28} height={28} decoding="async" fetchPriority="high" />
            </Link>

            <NavSearch leagues={leagues} />
          </div>

          <div className="top-nav-leagues-slot">
            <LeagueButtons leagues={leagues} />
          </div>
        </nav>
      </div>

      {/* Mobile-only bottom bar holding the league icon-buttons. */}
      <div className="bottom-nav-container">
        <nav className="top-nav bottom-nav">
          <LeagueButtons leagues={leagues} />
        </nav>
      </div>
    </>
  );
}
