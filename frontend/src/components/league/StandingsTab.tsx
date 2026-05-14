import type { StandingsEntry } from '../../types/models';

interface Props {
  loading: boolean;
  error: string | null;
  list: StandingsEntry[];
}

export default function StandingsTab({ loading, error, list }: Props) {
  if (loading) return <div className="py-8 flex items-center justify-center"><div className="spinner" /></div>;
  if (error)   return <p className="text-sm text-red-400 py-6 px-6">{error}</p>;
  if (list.length === 0) return <p className="text-sm text-(--text-dim) py-6 px-6">No standings data yet.</p>;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-(--border)">
          <th className="text-left px-6 py-3 text-xs font-semibold text-(--text-dim) uppercase tracking-wide w-10">#</th>
          <th className="text-left px-4 py-3 text-xs font-semibold text-(--text-dim) uppercase tracking-wide">Team</th>
          <th className="text-center px-4 py-3 text-xs font-semibold text-(--text-dim) uppercase tracking-wide">W</th>
          <th className="text-center px-4 py-3 text-xs font-semibold text-(--text-dim) uppercase tracking-wide">L</th>
          <th className="text-center px-4 py-3 text-xs font-semibold text-(--text-dim) uppercase tracking-wide">W/L%</th>
          <th className="text-center px-6 py-3 text-xs font-semibold text-(--text-dim) uppercase tracking-wide">Kills</th>
        </tr>
      </thead>
      <tbody>
        {list.map((entry, i) => {
          const total = entry.wins + entry.losses;
          const pct = total > 0 ? Math.round((entry.wins / total) * 100) : 0;
          return (
            <tr key={entry.team} className={`hover:bg-(--surface-hover) transition-colors ${i > 0 ? 'border-t border-(--border)' : ''}`}>
              <td className="px-6 py-3.5 text-(--text-dim) tabular-nums text-xs">{entry.placement}</td>
              <td className="px-4 py-3.5">
                <div className="flex items-center gap-3">
                  {entry.logo ? (
                    <img src={entry.logo} alt={entry.team} className="w-6 h-6 object-contain shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: 'var(--accent)' }}>
                      {entry.team.charAt(0)}
                    </div>
                  )}
                  <span className="font-semibold text-(--text-h)">{entry.team}</span>
                </div>
              </td>
              <td className="px-4 py-3.5 text-center font-semibold tabular-nums" style={{ color: 'var(--green)' }}>{entry.wins}</td>
              <td className="px-4 py-3.5 text-center text-red-400 font-semibold tabular-nums">{entry.losses}</td>
              <td className="px-4 py-3.5 text-center text-(--text-dim) tabular-nums">{pct}%</td>
              <td className="px-6 py-3.5 text-center text-(--text) tabular-nums">{entry.kills.toLocaleString()}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
