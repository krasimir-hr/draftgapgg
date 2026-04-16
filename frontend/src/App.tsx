import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ChampionsPage from './pages/ChampionsPage';
import ChampionDetailPage from './pages/ChampionDetailPage';
import EventsPage from './pages/EventsPage';
import MatchesPage from './pages/MatchesPage';
import MatchDetailPage from './pages/MatchDetailPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      {/* Top nav */}
      <nav className="flex items-center gap-4 px-6 py-3 border-b border-[var(--border)] text-sm">
        <Link to="/" className="font-bold text-[var(--text-h)]">DraftGap.gg</Link>
        <Link to="/champions" className="hover:text-[var(--accent)]">Champions</Link>
        <Link to="/events" className="hover:text-[var(--accent)]">Events</Link>
        <Link to="/matches" className="hover:text-[var(--accent)]">Matches</Link>
      </nav>

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/champions" element={<ChampionsPage />} />
        <Route path="/champions/:id" element={<ChampionDetailPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/events/:id" element={<EventsPage />} />
        <Route path="/matches" element={<MatchesPage />} />
        <Route path="/matches/:id" element={<MatchDetailPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
