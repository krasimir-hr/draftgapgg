import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
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

type SearchResult = { key: string; label: string; category: string; to: string; logo: string | null };
const PAGES: SearchResult[] = [
  { key: 'predictions', label: 'Worlds 2026 Predictions', category: 'Page', to: '/worlds-2026/predictions', logo: null },
  { key: 'matches', label: 'Matches', category: 'Page', to: '/matches', logo: null },
  { key: 'leagues', label: 'All leagues', category: 'Page', to: '/leagues', logo: null },
  { key: 'events', label: 'Events', category: 'Page', to: '/events', logo: null },
  { key: 'champions', label: 'Champions', category: 'Page', to: '/champions', logo: null },
  { key: 'fantasy', label: 'Fantasy', category: 'Page', to: '/fantasy', logo: null },
];
const WHITE_LOGOS = new Set(['lck', 'cblol', 'worlds', 'msi']);

function SearchIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>;
}

function SearchPanel({ leagues, onClose }: { leagues: TopNavLeague[]; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const index = useMemo(() => [
    ...PAGES,
    ...leagues.map((league) => ({ key: league.slug, label: league.label, category: 'League', to: `/leagues/${league.slug}`, logo: league.logo })),
  ], [leagues]);
  const results = index.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8);
  const activeIndex = Math.min(active, Math.max(0, results.length - 1));
  function go(item: SearchResult) {
    onClose();
    navigate(item.to);
  }
  return (
    <section className="dg-search-panel" id="dg-search-panel" aria-label="Search DraftGap">
      <div className="dg-search-input">
        <SearchIcon />
        <input
          autoFocus
          role="combobox"
          aria-label="Search leagues and pages"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls="dg-search-results"
          aria-activedescendant={results.length ? `dg-result-${activeIndex}` : undefined}
          placeholder="Find a league or page…"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setActive(0); }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setActive(event.key === 'ArrowDown' ? Math.min(activeIndex + 1, Math.max(0, results.length - 1)) : Math.max(activeIndex - 1, 0));
            } else if (event.key === 'Enter' && results[activeIndex]) {
              event.preventDefault();
              go(results[activeIndex]);
            }
          }}
        />
        <button type="button" className="dg-search-close" aria-label="Close search" onClick={onClose}>Esc</button>
      </div>
      <p className="dg-panel-label">{query.trim() ? 'Search results' : 'Quick access'}</p>
      <div role="listbox" id="dg-search-results" aria-label="Destinations">
        {results.map((item, index) => (
          <button
            key={item.key}
            id={`dg-result-${index}`}
            role="option"
            type="button"
            aria-selected={index === activeIndex}
            className="dg-search-result"
            onMouseEnter={() => setActive(index)}
            onClick={() => go(item)}
          >
            <span className="dg-result-symbol" aria-hidden="true">{item.logo ? <img src={item.logo} alt="" className={WHITE_LOGOS.has(item.key) ? 'dg-white-logo' : undefined} /> : '↗'}</span>
            <span>{item.label}</span><small>{item.category}</small>
          </button>
        ))}
      </div>
      {!results.length && <p className="dg-no-results" role="status">No results for “{query}”. Try a league or page name.</p>}
      <div className="dg-search-hint">↑ ↓ to browse <span>Enter to open</span></div>
    </section>
  );
}

export default function TopNav({ logo, logoAlt = 'DraftGap', leagues }: TopNavProps) {
  const { pathname } = useLocation();
  const [panel, setPanel] = useState<'search' | 'leagues' | null>(null);
  const ref = useRef<HTMLElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const leaguesTrigger = useRef<HTMLButtonElement>(null);
  const leagueActive = pathname.startsWith('/leagues');
  const predictionsActive = pathname.startsWith('/worlds-2026/predictions');

  function closePanel() {
    setPanel(null);
    (panel === 'search' ? searchTrigger : leaguesTrigger).current?.focus();
  }

  useEffect(() => {
    if (!panel) return;
    const outside = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setPanel(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPanel(null);
        (panel === 'search' ? searchTrigger : leaguesTrigger).current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [panel]);

  return (
    <header className="dg-header" ref={ref}>
      <div className="dg-header-inner">
        <Link to="/" className="dg-brand" aria-label="DraftGap home" onClick={() => setPanel(null)}>
          <span className="dg-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="24" height="24" fill="none"><path d="M5 8h15l-5 7H3L5 8Zm12 9h12l-2 7H12l5-7Z" fill="currentColor" /></svg>
          </span>
          <span className="dg-brand-text"><img src={logo} alt={logoAlt} width={156} height={20} /><span>League of Legends esports</span></span>
        </Link>

        <nav className="dg-primary-nav" aria-label="Primary navigation">
          <div className="dg-leagues">
            <button
              ref={leaguesTrigger}
              type="button"
              className={`dg-nav-link${leagueActive || panel === 'leagues' ? ' is-active' : ''}`}
              aria-expanded={panel === 'leagues'}
              aria-controls="dg-league-panel"
              onClick={() => setPanel(panel === 'leagues' ? null : 'leagues')}
            >Leagues <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></button>
            {panel === 'leagues' && (
              <section id="dg-league-panel" className="dg-league-panel" aria-label="Browse leagues">
                <div className="dg-panel-heading"><strong>Find your league</strong><Link to="/leagues" onClick={closePanel}>View all ↗</Link></div>
                {(['regional', 'international'] as const).map((group) => (
                  leagues.some((league) => league.group === group) && <div key={group}>
                    <p className="dg-panel-label">{group === 'regional' ? 'Regional leagues' : 'International events'}</p>
                    <div className="dg-league-grid">{leagues.filter((league) => league.group === group).map((league) => (
                      <Link key={league.slug} to={`/leagues/${league.slug}`} className="dg-league-item" onClick={closePanel}>
                        {league.logo ? <img src={league.logo} alt="" className={WHITE_LOGOS.has(league.slug) ? 'dg-white-logo' : undefined} /> : <span className="dg-league-monogram" aria-hidden="true">{league.label.slice(0, 3)}</span>}
                        {league.label}
                      </Link>
                    ))}</div>
                  </div>
                ))}
                {!leagues.length && <p className="dg-no-results">League listings are currently unavailable. You can still explore the tournament pages.</p>}
              </section>
            )}
          </div>
          <Link to="/matches" className={`dg-nav-link${pathname.startsWith('/matches') ? ' is-active' : ''}`} aria-current={pathname.startsWith('/matches') ? 'page' : undefined} onClick={() => setPanel(null)}>Matches</Link>
          <Link to="/worlds-2026/predictions" className={`dg-nav-link dg-predictions-link${predictionsActive ? ' is-active' : ''}`} aria-current={predictionsActive ? 'page' : undefined} onClick={() => setPanel(null)}>
            Predictions <span className="dg-season">2026</span>
          </Link>
        </nav>

        <div className="dg-header-actions">
          <button ref={searchTrigger} type="button" className={`dg-search-trigger${panel === 'search' ? ' is-open' : ''}`} aria-label="Open search" aria-expanded={panel === 'search'} aria-controls="dg-search-panel" onClick={() => setPanel(panel === 'search' ? null : 'search')}>
            <SearchIcon /><span>Search</span>
          </button>
          <span className="dg-action-divider" aria-hidden="true" />
          <ThemeToggle />
        </div>
        {panel === 'search' && <SearchPanel leagues={leagues} onClose={closePanel} />}
      </div>
    </header>
  );
}
