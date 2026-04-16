import { Link } from 'react-router-dom';

export default function HomePage() {
  const links = [
    { to: '/champions', label: 'Champions', desc: 'Browse all League champions' },
    { to: '/events', label: 'Events', desc: 'Esports events & leagues' },
    { to: '/matches', label: 'Matches', desc: 'Recent professional matches' },
  ];

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-4xl font-bold mb-2">DraftGap.gg</h1>
      <p className="text-[var(--text)] mb-8">Professional League of Legends esports data</p>

      <div className="space-y-4">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="block border border-[var(--border)] rounded-lg p-5 hover:shadow-md transition"
          >
            <h2 className="text-xl font-semibold text-[var(--text-h)]">{l.label}</h2>
            <p className="text-sm text-[var(--text)]">{l.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
