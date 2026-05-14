import { useParams } from 'react-router-dom';
import { useDetail } from '../hooks/useApi';
import { getChampion } from '../api/lol';
import type { ChampionDetail } from '../types/models';
import Spinner from '../components/Spinner';

export default function ChampionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: champion, loading, error } = useDetail<ChampionDetail>(getChampion, Number(id));

  if (loading) return <Spinner />;
  if (error || !champion) return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <p className="text-sm text-red-400">{error ?? 'Not found'}</p>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-5">
          <img src={champion.icon_url} alt={champion.name} className="w-20 h-20 rounded-xl shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-(--text-h) mb-1">{champion.name}</h1>
            <p className="text-sm text-(--text) italic mb-3">{champion.title}</p>
            <div className="flex gap-1.5 flex-wrap">
              {champion.tags.map((tag) => (
                <span key={tag} className="badge badge-accent">{tag}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-base font-semibold text-(--text-h) mb-3">Abilities</h2>
      <div className="space-y-2">
        {champion.abilities.map((a) => (
          <div key={a.id} className="card p-4">
            <div className="flex items-start gap-3">
              <span className="badge badge-accent shrink-0 mt-0.5">{a.ability_type}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-(--text-h) mb-1">{a.name}</p>
                <p className="text-sm text-(--text) leading-relaxed">{a.description}</p>
                {a.cooldown.length > 0 && (
                  <p className="text-xs text-(--text-dim) mt-2">
                    CD: {a.cooldown.join(' / ')}s
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
