import { Link, useLoaderData, useSearchParams, type LoaderFunctionArgs } from 'react-router-dom';
import { getChampions } from '../api/lol';
import { getChampionStats } from '../api/core';
import type { Champion, ChampionStats } from '../types/models';
import Pagination from '../components/Pagination';
import { ChampionIcon } from '../components/ChampionIcon';
import EsportsLayout from '../components/EsportsLayout';
import ChampionStatsRail from '../components/ChampionStatsRail';

export interface ChampionsLoaderData {
  champions: Champion[];
  count: number;
  page: number;
  stats: ChampionStats | null;
}

export async function championsLoader({ request }: LoaderFunctionArgs): Promise<ChampionsLoaderData> {
  const page = Number(new URL(request.url).searchParams.get('page')) || 1;
  const [champRes, statsRes] = await Promise.allSettled([
    getChampions(page),
    getChampionStats(6),
  ]);
  const champData = champRes.status === 'fulfilled' ? champRes.value.data : { results: [], count: 0 };
  const stats = statsRes.status === 'fulfilled' ? statsRes.value.data : null;
  return { champions: champData.results, count: champData.count, page, stats };
}

export default function ChampionsPage() {
  const { champions, count, page, stats } = useLoaderData() as ChampionsLoaderData;
  const [, setSearchParams] = useSearchParams();
  const totalPages = Math.ceil(count / 50);

  function setPage(p: number) {
    setSearchParams(p > 1 ? { page: String(p) } : {});
  }

  return (
    <EsportsLayout right={stats ? <ChampionStatsRail stats={stats} /> : undefined}>
      <div className="flex items-baseline gap-3 mb-8">
        <h1 className="text-2xl font-bold text-(--text-h)">Champions</h1>
        {count > 0 && <span className="text-sm text-(--text-dim)">{count} total</span>}
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2">
        {champions.map((c) => (
          <Link
            key={c.id}
            to={`/champions/${c.id}`}
            className="card card-link flex flex-col items-center p-2.5 text-center"
          >
            <ChampionIcon src={c.icon_url} alt={c.name} size={48} style={{ marginBottom: 6 }} />
            <span className="text-xs font-medium text-(--text-h) leading-tight">{c.name}</span>
            <span className="text-[10px] text-(--text-dim) mt-0.5 leading-tight">{c.tags[0]}</span>
          </Link>
        ))}
      </div>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </EsportsLayout>
  );
}
