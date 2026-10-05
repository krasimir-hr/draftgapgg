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

function NavGlyph({ kind }: { kind: 'matches' | 'predictions' }) {
  return <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    {kind === 'matches' ? <><rect x="3" y="4" width="14" height="13" rx="2"/><path d="M7 2v4m6-4v4M3 9h14m-10 4h2m3 0h2"/></> : <><path d="m11 2-7 9h6l-1 7 7-10h-6l1-6Z"/></>}
  </svg>;
}

export default function TopNav({ logo, logoAlt = 'DraftGap', leagues }: TopNavProps) {
  const { pathname } = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const section = pathname.startsWith('/worlds') ? 'Predictions' : pathname.startsWith('/matches') ? 'Matches' : pathname.startsWith('/players') ? 'Players' : pathname.startsWith('/teams') ? 'Teams' : pathname.startsWith('/champions') ? 'Champions' : 'Competition';
  function closeSearch() { setSearchOpen(false); searchTrigger.current?.focus(); }
  function navigateAway() { setMobileOpen(false); setSearchOpen(false); }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSearchOpen(false); setMobileOpen(false); searchTrigger.current?.focus(); } };
    const outside = (event: PointerEvent) => { if (searchRef.current && !searchRef.current.contains(event.target as Node)) setSearchOpen(false); };
    document.addEventListener('keydown', escape);
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', escape); document.removeEventListener('pointerdown', outside); };
  }, []);
  return <>
    {mobileOpen && <button className="dg-nav-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <header className={`dg-header${mobileOpen ? ' is-mobile-open' : ''}`}>
      <Link to="/" className="dg-brand" aria-label="DraftGap home" onClick={navigateAway}>
        <span className="dg-brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" width="24" height="24"><path d="M5 8h15l-5 7H3L5 8Zm12 9h12l-2 7H12l5-7Z" fill="currentColor"/></svg></span>
        <img src={logo} alt={logoAlt} width={134} height={20} />
      </Link>
      <nav className="dg-primary-nav" aria-label="Primary navigation">
        <p className="dg-nav-label">Explore</p>
        {([
          {to:'/matches',label:'Matches',kind:'matches'},
          {to:'/worlds-2026/predictions',label:'Predictions',kind:'predictions'},
        ] as const).map(item => <Link key={item.to} to={item.to} onClick={navigateAway} className={`dg-nav-link${pathname.startsWith(item.to) ? ' is-active' : ''}`} aria-current={pathname.startsWith(item.to) ? 'page' : undefined}>
          <NavGlyph kind={item.kind}/>{item.label}{item.kind === 'predictions' && <small>2026</small>}
        </Link>)}
        <div className="dg-league-list">
          <p className="dg-nav-label">Competitions</p>
          {leagues.map(league => <Link key={league.slug} to={`/leagues/${league.slug}`} onClick={navigateAway} className={`dg-league-link${pathname.startsWith(`/leagues/${league.slug}`) ? ' is-active' : ''}`} aria-current={pathname.startsWith(`/leagues/${league.slug}`) ? 'page' : undefined}>
            <span>{league.logo ? <img src={league.logo} alt="" className={WHITE_LOGOS.has(league.slug) ? '' : 'dg-invert-logo'} /> : league.label.slice(0,2)}</span>{league.label}<span className="dg-league-arrow" aria-hidden="true">↗</span>
          </Link>)}
        </div>
      </nav>
      <div className="dg-nav-footer"><span>Appearance</span><ThemeToggle /></div>
    </header>
    <div className="dg-utility-bar" ref={searchRef}>
      <div className="dg-utility-context"><button className="dg-mobile-menu" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14"/></svg></button><span className="dg-utility-brand">DraftGap</span><span className="dg-context-slash">/</span><strong>{section}</strong></div>
      <button ref={searchTrigger} className="dg-search-trigger" type="button" aria-label="Open search" aria-expanded={searchOpen} aria-controls="dg-search-panel" onClick={() => setSearchOpen(!searchOpen)}><SearchIcon/><span>Search competitions</span><span className="dg-search-key">↵</span></button>
      {searchOpen && <SearchPanel leagues={leagues} onClose={closeSearch} />}
    </div>
  </>;
}
