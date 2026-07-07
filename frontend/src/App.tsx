import { useEffect, useMemo, useState } from 'react';
import { createBrowserRouter, RouterProvider, Outlet, redirect } from 'react-router-dom';
import TopNav, { type TopNavLeague } from './components/TopNav';
import { getLeagues } from './api/core';
import { slugify } from './utils/slugs';
import HomePage, { homeLoader } from './pages/HomePage';
import ChampionsPage, { championsLoader } from './pages/ChampionsPage';
import ChampionDetailPage, { championLoader } from './pages/ChampionDetailPage';
import LeaguesPage, { leaguesLoader } from './pages/LeaguesPage';
import LeagueDetailPage, { leagueLoader } from './pages/LeagueDetailPage';
import EventsPage, { eventsLoader } from './pages/EventsPage';
import EventDetailPage, { eventDetailLoader } from './pages/EventDetailPage';
import MatchesPage, { matchesLoader } from './pages/MatchesPage';
import MatchDetailPage, { matchLoader, MatchLoadError } from './pages/MatchDetailPage';
import PlayerDetailPage, { playerLoader } from './pages/PlayerDetailPage';
import TeamDetailPage, { teamLoader } from './pages/TeamDetailPage';
import FantasyTeamPage from './pages/FantasyTeamPage';
import { DrawerProvider } from './contexts/DrawerContext';
import { ThemeProvider } from './contexts/ThemeContext';
import DrawerHost from './components/drawers/DrawerHost';
import TopLoadingBar from './components/TopLoadingBar';
import RouteError from './components/RouteError';
import './App.css';

// League short-names shown as icon-buttons, grouped (a divider separates the two).
const REGIONAL = ['LCK', 'LPL', 'LEC', 'LCS', 'CBLOL', 'LCP'];
const INTERNATIONAL = ['Worlds', 'MSI', 'First Stand', 'EWC'];

/** Loads the leagues shown as icon-buttons in the top bar. */
function useLeagues(): TopNavLeague[] {
  const [byShort, setByShort] = useState<Record<string, { logo: string | null; label: string }>>({});

  useEffect(() => {
    getLeagues({ page: 1, page_size: 100 })
      .then((res) => {
        const map: Record<string, { logo: string | null; label: string }> = {};
        for (const l of res.data.results) {
          const label = l.short_name ?? l.name;
          if (l.short_name) map[l.short_name] = { logo: l.logo, label };
        }
        setByShort(map);
      })
      .catch(() => {});
  }, []);

  return useMemo(() => {
    const build = (shorts: string[], group: TopNavLeague['group']): TopNavLeague[] =>
      shorts
        .filter((s) => byShort[s])
        .map((s) => ({ label: byShort[s].label, slug: slugify(byShort[s].label), logo: byShort[s].logo, group }));
    return [...build(REGIONAL, 'regional'), ...build(INTERNATIONAL, 'international')];
  }, [byShort]);
}

function RootLayout() {
  const leagues = useLeagues();
  return (
    <ThemeProvider>
    <DrawerProvider>
      <TopLoadingBar />
      <TopNav
        logo="/draftgap-logo.webp"
        logoAlt="DraftGap"
        leagues={leagues}
      />

      <div className="flex flex-1" style={{ position: 'relative', zIndex: 1 }}>
        <main className="app-main flex-1 min-w-0 overflow-hidden" style={{ height: '100svh' }}>
          <Outlet />
        </main>
      </div>

      <DrawerHost />
    </DrawerProvider>
    </ThemeProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    // Centered spinner while the initial route loader resolves.
    hydrateFallbackElement: (
      <div className="flex items-center justify-center" style={{ height: '100svh' }}>
        <div className="spinner" />
      </div>
    ),
    children: [
      // Homepage temporarily points at the LCK league.
      { path: '/', loader: () => redirect('/leagues/lck') },
      { path: '/home', element: <HomePage />, loader: homeLoader },
      { path: '/champions', element: <ChampionsPage />, loader: championsLoader },
      { path: '/champions/:id', element: <ChampionDetailPage />, loader: championLoader, errorElement: <RouteError fallback="Champion not found" /> },
      { path: '/leagues', element: <LeaguesPage />, loader: leaguesLoader },
      { path: '/leagues/:slug', element: <LeagueDetailPage />, loader: leagueLoader, errorElement: <RouteError fallback="League not found" /> },
      { path: '/leagues/:slug/:tab', element: <LeagueDetailPage />, loader: leagueLoader, errorElement: <RouteError fallback="League not found" /> },
      { path: '/events', element: <EventsPage />, loader: eventsLoader },
      { path: '/events/:id', element: <EventDetailPage />, loader: eventDetailLoader, errorElement: <RouteError fallback="Event not found" /> },
      { path: '/matches', element: <MatchesPage />, loader: matchesLoader() },
      { path: '/matches/finished', element: <MatchesPage status="finished" />, loader: matchesLoader('finished') },
      { path: '/matches/upcoming', element: <MatchesPage status="upcoming" />, loader: matchesLoader('upcoming') },
      { path: '/matches/:id', element: <MatchDetailPage />, loader: matchLoader, errorElement: <MatchLoadError /> },
      { path: '/players/:name', element: <PlayerDetailPage />, loader: playerLoader, errorElement: <RouteError fallback="Player not found" /> },
      { path: '/teams/:name', element: <TeamDetailPage />, loader: teamLoader, errorElement: <RouteError fallback="Team not found" /> },
      { path: '/fantasy', element: <FantasyTeamPage /> },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
