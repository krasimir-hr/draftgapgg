import { createBrowserRouter, RouterProvider, Outlet, Link, NavLink, redirect } from 'react-router-dom';
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
import DrawerHost from './components/drawers/DrawerHost';
import TopLoadingBar from './components/TopLoadingBar';
import RouteError from './components/RouteError';
import './App.css';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `nav-link${isActive ? ' active' : ''}`;

function RootLayout() {
  return (
    <DrawerProvider>
      <TopLoadingBar />
      <nav className="app-nav">
        <Link to="/" className="nav-logo">
          <img src="/draftgap-logo.webp" alt="DraftGap" className="h-7 w-auto" width={28} height={28} decoding="async" fetchPriority="high" />
        </Link>
        <NavLink to="/matches" className={navClass}>Matches</NavLink>
        <NavLink to="/fantasy" className={navClass}>Fantasy</NavLink>
        <div className="flex-1" />
        <a
          href={`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/admin/`}
          target="_blank"
          rel="noreferrer"
          className="nav-link"
        >
          Admin
        </a>
        <span className="nav-patch">Patch 16.10</span>
        <Link to="/fantasy" className="nav-cta">My team →</Link>
      </nav>

      <div className="flex flex-1" style={{ position: 'relative', zIndex: 1 }}>
        <main className="flex-1 min-w-0 overflow-hidden" style={{ height: 'calc(100svh - 56px)' }}>
          <Outlet />
        </main>
      </div>

      <DrawerHost />
    </DrawerProvider>
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
