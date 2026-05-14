import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ChampionsPage from './pages/ChampionsPage';
import ChampionDetailPage from './pages/ChampionDetailPage';
import LeaguesPage from './pages/LeaguesPage';
import LeagueDetailPage from './pages/LeagueDetailPage';
import EventsPage from './pages/EventsPage';
import EventDetailPage from './pages/EventDetailPage';
import MatchesPage from './pages/MatchesPage';
import MatchDetailPage from './pages/MatchDetailPage';
import PlayerDetailPage from './pages/PlayerDetailPage';
import TeamDetailPage from './pages/TeamDetailPage';
import LeagueSidebar from './components/LeagueSidebar';
import './App.css';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `nav-link${isActive ? ' active' : ''}`;

function App() {
  return (
    <BrowserRouter>
      <nav className="app-nav">
        <Link to="/" className="nav-logo">
          <img src="/draftgap-logo.webp" alt="DraftGap" className="h-7 w-auto" />
        </Link>
        <NavLink to="/champions" className={navClass}>Champions</NavLink>
        <NavLink to="/leagues" className={navClass}>Leagues</NavLink>
        <NavLink to="/matches" className={navClass}>Matches</NavLink>
      </nav>

      <div className="flex flex-1">
        <LeagueSidebar />
        <main className="flex-1 min-w-0 overflow-y-auto" style={{ height: 'calc(100svh - 52px)' }}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/champions" element={<ChampionsPage />} />
            <Route path="/champions/:id" element={<ChampionDetailPage />} />
            <Route path="/leagues" element={<LeaguesPage />} />
            <Route path="/leagues/:slug" element={<LeagueDetailPage />} />
            <Route path="/leagues/:slug/:tab" element={<LeagueDetailPage />} />
            <Route path="/leagues/:slug/match/:matchId" element={<LeagueDetailPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:id" element={<EventDetailPage />} />
            <Route path="/matches" element={<MatchesPage />} />
            <Route path="/matches/finished" element={<MatchesPage status="finished" />} />
            <Route path="/matches/upcoming" element={<MatchesPage status="upcoming" />} />
            <Route path="/matches/:id" element={<MatchDetailPage />} />
            <Route path="/players/:name" element={<PlayerDetailPage />} />
            <Route path="/teams/:name" element={<TeamDetailPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
