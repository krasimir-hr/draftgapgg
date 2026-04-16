import { useParams } from 'react-router-dom';
import { useDetail } from '../hooks/useApi';
import { getChampion } from '../api/lol';
import type { ChampionDetail } from '../types/models';

export default function ChampionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: champion, loading, error } = useDetail<ChampionDetail>(getChampion, Number(id));

  if (loading) return <p className="p-8 text-center">Loading…</p>;
  if (error || !champion) return <p className="p-8 text-red-500">{error ?? 'Not found'}</p>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <img src={champion.icon_url} alt={champion.name} className="w-24 h-24 rounded-lg" />
        <div>
          <h1 className="text-3xl font-bold">{champion.name}</h1>
          <p className="text-[var(--text)] italic">{champion.title}</p>
          <p className="text-sm mt-1">{champion.tags.join(' · ')}</p>
        </div>
      </div>

      <h2 className="text-xl font-semibold mb-3">Abilities</h2>
      <div className="space-y-3">
        {champion.abilities.map((a) => (
          <div key={a.id} className="border border-[var(--border)] rounded-lg p-3">
            <p className="font-medium">
              <span className="text-[var(--accent)]">[{a.ability_type}]</span> {a.name}
            </p>
            <p className="text-sm text-[var(--text)] mt-1">{a.description}</p>
            {a.cooldown.length > 0 && (
              <p className="text-xs mt-1">CD: {a.cooldown.join(' / ')}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
