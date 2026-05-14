import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDetail } from '../hooks/useApi';
import { getMatch, getGame, getEventPlayers, getMatches } from '../api/core';
import type { MatchDetail, GameDetail, GoldGraphPoint, Match } from '../types/models';
import Spinner from './Spinner';

const ROLE_ORDER = ['Top', 'Jungle', 'Mid', 'Bot', 'Support', 'Coach'];

const ROLE_ICON: Record<string, string> = {
  Top:     'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-top.svg',
  Jungle:  'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-jungle.svg',
  Mid:     'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-middle.svg',
  Bot:     'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-bottom.svg',
  Support: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-utility.svg',
};

const COUNTRY_CODES: Record<string, string> = {
  'Argentina': 'AR', 'Australia': 'AU', 'Belgium': 'BE', 'Brazil': 'BR',
  'Bulgaria': 'BG', 'Canada': 'CA', 'Chile': 'CL', 'China': 'CN',
  'Colombia': 'CO', 'Costa Rica': 'CR', 'Croatia': 'HR', 'Czech Republic': 'CZ',
  'Denmark': 'DK', 'El Salvador': 'SV', 'France': 'FR', 'Germany': 'DE',
  'Greece': 'GR', 'Hong Kong': 'HK', 'Iran': 'IR', 'Italy': 'IT',
  'Japan': 'JP', 'Lithuania': 'LT', 'Malaysia': 'MY', 'Mexico': 'MX',
  'Mongolia': 'MN', 'New Zealand': 'NZ', 'Norway': 'NO', 'Peru': 'PE',
  'Philippines': 'PH', 'Poland': 'PL', 'Portugal': 'PT', 'Romania': 'RO',
  'Serbia': 'RS', 'Singapore': 'SG', 'Slovenia': 'SI', 'South Korea': 'KR',
  'Spain': 'ES', 'Sweden': 'SE', 'Taiwan': 'TW', 'Turkey': 'TR',
  'Ukraine': 'UA', 'United Kingdom': 'GB', 'United States': 'US',
  'Uruguay': 'UY', 'Venezuela': 'VE', 'Vietnam': 'VN',
};

function flagEmoji(nationality: string | null): string {
  if (!nationality) return '';
  const code = COUNTRY_CODES[nationality];
  if (!code) return '';
  return [...code].map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))).join('');
}

function GoldDiffGraph({ data, team1, team2, uid }: {
  data: GoldGraphPoint[];
  team1: string;
  team2: string;
  uid: string;
}) {
  if (data.length < 2) return null;

  const maxMinute = data[data.length - 1].m;
  const maxAbsDiff = Math.max(...data.map(d => Math.abs(d.t1 - d.t2)), 1000);
  const yMax = Math.ceil(maxAbsDiff / 2000) * 2000;

  const W = 600, H = 110;
  const PAD = { top: 10, right: 10, bottom: 20, left: 44 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const midY = PAD.top + plotH / 2;

  const xS = (m: number) => PAD.left + (m / maxMinute) * plotW;
  const yS = (diff: number) => midY - (diff / yMax) * (plotH / 2);

  const pts = data.map(d => ({ x: xS(d.m), y: yS(d.t1 - d.t2) }));

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = [
    `M ${pts[0].x.toFixed(1)} ${midY}`,
    ...pts.map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
    `L ${pts[pts.length - 1].x.toFixed(1)} ${midY}`,
    'Z',
  ].join(' ');

  const xTicks = Array.from({ length: Math.floor(maxMinute / 5) + 1 }, (_, i) => i * 5);
  const yLabels = [
    { val: yMax,  label: `+${(yMax / 1000).toFixed(0)}k` },
    { val: 0,     label: '0' },
    { val: -yMax, label: `-${(yMax / 1000).toFixed(0)}k` },
  ];

  return (
    <div>
      <div className="h-px bg-(--border) mb-4" />
      <p className="text-[10px] font-semibold uppercase tracking-widest text-(--text-dim) mb-2">Gold Difference</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 110 }}>
        <defs>
          <clipPath id={`${uid}-above`}>
            <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH / 2} />
          </clipPath>
          <clipPath id={`${uid}-below`}>
            <rect x={PAD.left} y={midY} width={plotW} height={plotH / 2} />
          </clipPath>
        </defs>

        {/* filled areas */}
        <path d={areaPath} fill="var(--accent)" fillOpacity={0.2} clipPath={`url(#${uid}-above)`} />
        <path d={areaPath} fill="#ef4444" fillOpacity={0.2} clipPath={`url(#${uid}-below)`} />

        {/* zero baseline */}
        <line x1={PAD.left} y1={midY} x2={PAD.left + plotW} y2={midY}
              stroke="var(--border)" strokeWidth={1} />

        {/* gold diff line */}
        <path d={linePath} fill="none" stroke="var(--text-dim)" strokeWidth={1.5}
              strokeLinecap="round" strokeLinejoin="round" />

        {/* x-axis minute ticks */}
        {xTicks.map(m => (
          <g key={m}>
            <line x1={xS(m)} y1={midY - 2} x2={xS(m)} y2={midY + 2}
                  stroke="var(--border)" strokeWidth={1} />
            {m > 0 && (
              <text x={xS(m)} y={H - 4} textAnchor="middle" fontSize={8}
                    fill="var(--text-dim)" opacity={0.6}>{m}'</text>
            )}
          </g>
        ))}

        {/* y-axis labels */}
        {yLabels.map(({ val, label }) => (
          <text key={val} x={PAD.left - 4} y={yS(val) + 3} textAnchor="end"
                fontSize={8} fill="var(--text-dim)" opacity={0.6}>{label}</text>
        ))}

        {/* team labels */}
        <text x={PAD.left + 4} y={PAD.top + 9} fontSize={8} fill="var(--accent)" opacity={0.75}>{team1} ahead</text>
        <text x={PAD.left + 4} y={H - PAD.bottom - 3} fontSize={8} fill="#ef4444" opacity={0.75}>{team2} ahead</text>
      </svg>
    </div>
  );
}

interface LineupPlayer { side: 1 | 2; team: string; name: string; role: string; link: string; }
interface PlayerMeta { image: string | null; nationality: string | null; }

function GamePanel({ gameId, matchTeam1, matchTeam2, teamLogos }: { gameId: number; matchTeam1: string; matchTeam2: string; teamLogos: Record<string, string | null> }) {
  const [game, setGame] = useState<GameDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getGame(gameId).then((res) => { setGame(res.data); setLoading(false); }).catch(() => setLoading(false));
  }, [gameId]);


  return (
    <div className="border-t border-(--border)">
      {loading && <div className="flex items-center justify-center py-8"><div className="spinner" /></div>}
          {game && (
            <div className="space-y-0">
              {/* Scoreboard */}
              {game.performances.length > 0 && (() => {
                const byRole = (ps: typeof game.performances) =>
                  [...ps].sort((a, b) => {
                    const ai = ROLE_ORDER.indexOf(a.role), bi = ROLE_ORDER.indexOf(b.role);
                    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                  });
                // Always left = matchTeam1, always right = matchTeam2; derive side label from synced data
                const t1 = byRole(game.performances.filter(p => p.team === matchTeam1));
                const t2 = byRole(game.performances.filter(p => p.team === matchTeam2));
                const dd = (path: string) => `https://ddragon.leagueoflegends.com/cdn/img/${path}`;
                const CD_UX = 'https://raw.communitydragon.org/latest/game/assets/ux';
                // items | summs | G+CS | KDA | runes | name | champ | ROLE | champ | name | runes | KDA | G+CS | summs | items
                const rowCls = 'grid items-center gap-2 px-3 py-2 transition-colors hover:bg-(--surface-hover) grid-cols-[auto_auto_auto_auto_auto_minmax(0,7rem)_2rem_2.5rem_2rem_minmax(0,7rem)_auto_auto_auto_auto_auto]';

                const Runes = ({ p }: { p: typeof t1[0] }) => {
                  const sec = p.runes.find(r => r.path_riot_id !== p.keystone_rune?.path_riot_id);
                  return (
                    <div className="relative w-8 h-8 shrink-0">
                      {p.keystone_rune
                        ? <img src={dd(p.keystone_rune.icon)} title={p.keystone_rune.name} className="w-8 h-8 rounded" />
                        : <div className="w-8 h-8 rounded bg-(--surface-hover) opacity-30" />}
                      {sec
                        ? <img src={dd(sec.path_icon)} title="Secondary path" className="absolute bottom-0 right-0 w-3.75 h-3.75 rounded translate-x-1/2 translate-y-1/2 ring-[1.5px] ring-(--surface)" />
                        : <div className="absolute bottom-0 right-0 w-3.75 h-3.75 rounded translate-x-1/2 translate-y-1/2 bg-(--surface-hover) opacity-20" />}
                    </div>
                  );
                };
                const Kda = ({ p }: { p: typeof t1[0] }) => (
                  <div className="flex items-baseline gap-px tabular-nums justify-center">
                    <span className="text-sm font-bold text-(--text-h)">{p.kills}</span>
                    <span className="text-xs text-(--text-dim) opacity-40 mx-px">/</span>
                    <span className="text-sm font-bold text-red-400">{p.deaths}</span>
                    <span className="text-xs text-(--text-dim) opacity-40 mx-px">/</span>
                    <span className="text-sm text-(--text-dim)">{p.assists}</span>
                  </div>
                );
                const GoldCs = ({ p }: { p: typeof t1[0] }) => (
                  <div className="flex flex-col items-center gap-0.5 tabular-nums">
                    <div className="flex items-center gap-1">
                      <img src={'https://wiki.leagueoflegends.com/en-us/images/Gold_colored_icon.svg?103a5'} alt="gold" className="w-3 h-3 object-contain" />
                      <span className="text-xs text-(--text-dim)">{(p.gold / 1000).toFixed(1)}k</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <img src={`${CD_UX}/deathrecap/autoattack.png`} alt="cs" className="w-3 h-3 object-contain brightness-0 invert opacity-40" />
                      <span className="text-xs text-(--text-dim)">{p.cs}</span>
                    </div>
                  </div>
                );
                const Summs = ({ p }: { p: typeof t1[0] }) => (
                  <div className="flex flex-col gap-0.5">
                    {[p.summoner_spell_d, p.summoner_spell_f].map((sp, i) =>
                      sp?.icon_url
                        ? <img key={i} src={sp.icon_url} title={sp.name} className="w-6 h-6 rounded" />
                        : <div key={i} className="w-6 h-6 rounded bg-(--surface-hover) opacity-30" />
                    )}
                  </div>
                );
                const Items = ({ p, trinketLeft }: { p: typeof t1[0]; trinketLeft?: boolean }) => {
                  const slot = (item: typeof p.items[0] | undefined | null, key: string, isTrinket = false) =>
                    item?.icon_url
                      ? <img key={key} src={item.icon_url} title={item.name} className={`w-6 h-6 rounded object-cover${isTrinket ? ' opacity-70' : ''}`} />
                      : <div key={key} className="w-6 h-6 rounded bg-(--surface-hover) opacity-20" />;
                  const empty = (key: string) => <div key={key} className="w-6 h-6" />;
                  const t = slot(p.trinket, 'trinket', true);
                  const its = Array.from({ length: 6 }, (_, i) => slot(p.items[i], `item${i}`));
                  const sep = (key: string) => <div key={key} className="w-1.25" />;
                  return (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex gap-0.5">
                        {trinketLeft ? [t, sep('s1'), its[0], its[1], its[2]] : [its[0], its[1], its[2], sep('s1'), t]}
                      </div>
                      <div className="flex gap-0.5">
                        {trinketLeft ? [empty('el'), sep('s2'), its[3], its[4], its[5]] : [its[3], its[4], its[5], sep('s2'), empty('el')]}
                      </div>
                    </div>
                  );
                };

                return (
                  <div className="border-t border-(--border)">
                    {/* Team headers + objectives */}
                    {(() => {
                      const objs = [
                        { key: 'dragons', label: 'Drakes', icon: `${CD_UX}/scoreboard/_dragon.png`,      t1: game.team1_dragons,      t2: game.team2_dragons,      bg: 'rgba(251,146,60,0.18)',  color: '#fb923c', fmt: (v: number) => String(v) },
                        { key: 'barons',  label: 'Barons', icon: `${CD_UX}/scoreboard/_baronnashor.png`, t1: game.team1_barons,       t2: game.team2_barons,       bg: 'rgba(168,85,247,0.18)',  color: '#c084fc', fmt: (v: number) => String(v) },
                        { key: 'heralds', label: 'Herald', icon: `${CD_UX}/scoreboard/_riftherald.png`,  t1: game.team1_rift_heralds, t2: game.team2_rift_heralds, bg: 'rgba(20,184,166,0.18)',  color: '#2dd4bf', fmt: (v: number) => String(v) },
                        { key: 'towers',  label: 'Towers', icon: `${CD_UX}/minimap/icons/tower.png`,     t1: game.team1_towers,       t2: game.team2_towers,       bg: 'rgba(100,116,139,0.18)', color: '#94a3b8', fmt: (v: number) => String(v) },
                        { key: 'gold',    label: 'Gold',   icon: 'https://wiki.leagueoflegends.com/en-us/images/Gold_colored_icon.svg?103a5', t1: game.team1_gold, t2: game.team2_gold, bg: 'rgba(234,179,8,0.18)', color: '#facc15', fmt: (v: number) => `${(v/1000).toFixed(1)}k` },
                      ];
                      return (
                        <div className="grid grid-cols-2 border-b border-(--border)">
                          {[
                            { name: matchTeam1, flip: false, logo: teamLogos[matchTeam1] ?? null, vals: objs.map(o => ({ ...o, val: o.t1 })) },
                            { name: matchTeam2, flip: true,  logo: teamLogos[matchTeam2] ?? null, vals: [...objs].reverse().map(o => ({ ...o, val: o.t2 })) },
                          ].map(({ name, flip, logo, vals }) => (
                            <div key={name} className={`flex items-center gap-2.5 px-4 py-2 ${flip ? 'flex-row-reverse' : ''}`} style={{ background: 'var(--surface-sub)' }}>
                              {logo && <img src={logo} alt={name} className="w-4 h-4 object-contain shrink-0" />}
                              <span className="text-[11px] font-bold uppercase tracking-widest text-(--text-dim)">{name}</span>
                              <div className={`flex items-center gap-1.5 ${flip ? 'mr-auto' : 'ml-auto'}`}>
                                {vals.map(({ key, label, icon, val, bg, color, fmt }) => (
                                  <div key={key} className="flex items-center gap-1.5 px-2 h-7 rounded shrink-0" style={{ background: bg }} title={label}>
                                    <img src={icon} alt={label} className="w-4 h-4 object-contain shrink-0" />
                                    <span className="text-sm font-bold tabular-nums leading-none" style={{ color }}>{fmt(val)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* One row per role matchup */}
                    {t1.map((p1, i) => {
                      const p2 = t2[i];
                      if (!p2) return null;
                      return (
                        <div key={p1.id} className={rowCls}>
                          {/* ── Left (team1): items → champ ── */}
                          <Items p={p1} trinketLeft />
                          <Summs p={p1} />
                          <GoldCs p={p1} />
                          <Kda p={p1} />
                          <Runes p={p1} />
                          <div className="min-w-0 text-right">
                            <div className="text-sm font-semibold text-(--text-h) truncate">{p1.name}</div>
                            {p1.champion && <div className="text-[10px] text-(--text-dim) opacity-50 truncate">{p1.champion.name}</div>}
                          </div>
                          {p1.champion?.icon_url
                            ? <img src={p1.champion.icon_url} title={p1.champion.name} className="w-8 h-8 rounded-md object-cover" />
                            : <div className="w-8 h-8 rounded-md bg-(--surface-hover)" />}

                          {/* ── Center role icon ── */}
                          <div className="flex items-center justify-center">
                            {ROLE_ICON[p1.role]
                              ? <img src={ROLE_ICON[p1.role]} alt={p1.role} className="w-5 h-5 brightness-0 invert opacity-35" />
                              : <span />}
                          </div>

                          {/* ── Right (team2): champ → items ── */}
                          {p2.champion?.icon_url
                            ? <img src={p2.champion.icon_url} title={p2.champion.name} className="w-8 h-8 rounded-md object-cover" />
                            : <div className="w-8 h-8 rounded-md bg-(--surface-hover)" />}
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-(--text-h) truncate">{p2.name}</div>
                            {p2.champion && <div className="text-[10px] text-(--text-dim) opacity-50 truncate">{p2.champion.name}</div>}
                          </div>
                          <Runes p={p2} />
                          <Kda p={p2} />
                          <GoldCs p={p2} />
                          <Summs p={p2} />
                          <Items p={p2} />
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {game.gold_graph && game.gold_graph.length > 1 && (
                <div className="px-5 pt-1 pb-5">
                  <GoldDiffGraph
                    data={game.gold_graph}
                    team1={game.team1}
                    team2={game.team2}
                    uid={`gg-${gameId}`}
                  />
                </div>
              )}
            </div>
          )}
    </div>
  );
}


interface MatchViewProps {
  matchId: number;
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;

  onBack: () => void;
}

export default function MatchView({ matchId, teamLogos, onBack }: Omit<MatchViewProps, 'teamShortNames'> & { teamShortNames?: Record<string, string> }) {
  const { data: match, loading, error } = useDetail<MatchDetail>(getMatch, matchId);
  const [lineup, setLineup] = useState<LineupPlayer[]>([]);
  const [playerMeta, setPlayerMeta] = useState<Record<string, PlayerMeta>>({});
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [h2h, setH2h] = useState<Match[]>([]);
  const [t1Recent, setT1Recent] = useState<Match[]>([]);
  const [t2Recent, setT2Recent] = useState<Match[]>([]);

  useEffect(() => {
    setSelectedGameId(null);
    setLineup([]);
    if (!match) return;
    getEventPlayers(match.event.id).then((res) => {
      const meta: Record<string, PlayerMeta> = {};
      for (const p of res.data) meta[p.name] = { image: p.image, nationality: p.nationality ?? null };
      setPlayerMeta(meta);
    }).catch(() => {});
    if (match.games.length > 0) {
      if (match.winner !== null) setSelectedGameId(match.games[0].id);
      getGame(match.games[0].id).then((res) => {
        setLineup(res.data.performances.map(p => ({
          side: p.side as 1 | 2,
          team: p.team,
          name: p.name,
          role: p.role,
          link: p.link,
        })));
      }).catch(() => {});
    }
    if (match.winner === null) {
      const fetchRecent = (team: string) => Promise.all([
        getMatches({ team1: team, has_result: 'true', page_size: 10 }),
        getMatches({ team2: team, has_result: 'true', page_size: 10 }),
      ]).then(([a, b]) => [...a.data.results, ...b.data.results]
        .filter(m => m.id !== match.id)
        .filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i)
        .sort((x, y) => (y.datetime_utc ?? '').localeCompare(x.datetime_utc ?? '')));
      Promise.all([fetchRecent(match.team1), fetchRecent(match.team2)]).then(([r1, r2]) => {
        setT1Recent(r1.slice(0, 5));
        setT2Recent(r2.slice(0, 5));
        const h = r1.filter(m => m.team1 === match.team2 || m.team2 === match.team2).slice(0, 5);
        setH2h(h);
      }).catch(() => {});
    } else {
      setH2h([]); setT1Recent([]); setT2Recent([]);
    }
  }, [match?.id]);

  if (loading) return <div className="py-16 flex items-center justify-center"><Spinner /></div>;
  if (error || !match) return <p className="text-sm text-red-400 px-6 py-8">{error ?? 'Match not found'}</p>;

  const played = match.winner !== null;

  const time = match.datetime_utc
    ? new Date(match.datetime_utc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : null;
  const date = match.datetime_utc
    ? new Date(match.datetime_utc).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const metaParts = [
    time,
    date,
    `BO${match.best_of}`,
    match.tab || null,
    match.patch ? `Patch ${match.patch}` : null,
  ].filter(Boolean) as string[];

  return (
    <>
      {/* Back button */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-(--border)">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-(--text-dim) hover:text-(--text-h) transition-colors"
        >
          <span>←</span>
          <span>Back</span>
        </button>
      </div>

      {/* Score row */}
      <div className="flex items-center justify-center gap-8 px-10 py-8 border-b border-(--border)" style={{ background: 'radial-gradient(ellipse at 50% 110%, color-mix(in srgb, var(--accent) 14%, transparent) 0%, transparent 80%), var(--surface-sub)' }}>
        {/* Team 1: name → logo */}
        <div className="flex items-center gap-5 justify-end flex-1">
          <span className="text-2xl font-bold text-(--text-h) text-right tracking-tight">{match.team1}</span>
          {teamLogos[match.team1] ? (
            <div className="w-20 h-20 shrink-0 flex items-center justify-center overflow-hidden drop-shadow-lg">
              <img src={teamLogos[match.team1]!} alt={match.team1} className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-xl flex items-center justify-center text-lg font-bold text-white shrink-0" style={{ background: 'var(--accent)' }}>
              {match.team1.charAt(0)}
            </div>
          )}
        </div>

        {/* Score */}
        <div className="flex items-center gap-4 shrink-0 min-w-32 justify-center">
          {played ? (
            <>
              <span className="text-5xl font-bold tabular-nums text-(--text-h)">{match.team1_score}</span>
              <span className="text-xl text-(--text-dim) opacity-30 font-light">–</span>
              <span className="text-5xl font-bold tabular-nums text-(--text-h)">{match.team2_score}</span>
            </>
          ) : (
            <span className="text-sm font-medium text-(--text-dim) tracking-widest uppercase">vs</span>
          )}
        </div>

        {/* Team 2: logo → name */}
        <div className="flex items-center gap-5 justify-start flex-1">
          {teamLogos[match.team2] ? (
            <div className="w-20 h-20 shrink-0 flex items-center justify-center overflow-hidden drop-shadow-lg">
              <img src={teamLogos[match.team2]!} alt={match.team2} className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-xl flex items-center justify-center text-lg font-bold text-white shrink-0" style={{ background: 'var(--accent)' }}>
              {match.team2.charAt(0)}
            </div>
          )}
          <span className="text-2xl font-bold text-(--text-h) tracking-tight">{match.team2}</span>
        </div>
      </div>


      {/* Meta strip */}
      <div className="px-6 py-2.5 border-b border-(--border) grid grid-cols-[1fr_auto_1fr] items-center">
        <div className="flex items-center gap-2">
          {match.event.league.logo && (
            <img src={match.event.league.logo} alt={match.event.league.name} className="w-4 h-4 object-contain shrink-0 logo-themed" />
          )}
          <span className="text-xs text-(--text-dim) truncate">{match.event.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {metaParts.map((part, i) => (
            <span key={i} className="text-xs text-(--text-dim)">
              {i > 0 && <span className="mr-2 opacity-40">·</span>}
              {part}
            </span>
          ))}
        </div>
        <div />
      </div>

      {/* Lineups */}
      {lineup.length > 0 && (() => {
        const sortByRole = (players: LineupPlayer[]) =>
          [...players].sort((a, b) => {
            const ai = ROLE_ORDER.indexOf(a.role);
            const bi = ROLE_ORDER.indexOf(b.role);
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
          });

        const PlayerCard = ({ p }: { p: LineupPlayer }) => {
          const meta = playerMeta[p.name];
          const flag = flagEmoji(meta?.nationality ?? null);
          return (
            <Link
              to={`/players/${encodeURIComponent(p.name)}`}
              className="group relative block"
            >
              <div
                className="relative w-full overflow-hidden transition-all duration-200 ease-out group-hover:-translate-y-1.5"
                style={{ paddingBottom: '145%', boxShadow: '0 0 0 1px var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent), 0 8px 24px color-mix(in srgb, var(--accent) 35%, transparent)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 0 0 1px var(--border)')}
              >
                <div className="absolute inset-0" style={{ background: 'color-mix(in srgb, var(--surface-sub) 60%, black)' }}>

                  {/* Role icon */}
                  {ROLE_ICON[p.role] && (
                    <div className="absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
                      <img src={ROLE_ICON[p.role]} alt={p.role} className="w-3.5 h-3.5 brightness-0 invert opacity-90" />
                    </div>
                  )}

                  {meta?.image ? (
                    <img src={meta.image} alt={p.name} className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl font-bold text-white" style={{ background: 'var(--accent)' }}>
                      {p.name.charAt(0)}
                    </div>
                  )}

                  {/* Bottom gradient + name */}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-black/90 to-transparent" />
                  <div className="absolute bottom-0 inset-x-0 px-1.5 pb-2 flex flex-col items-center gap-0.5">
                    <span className="text-[11px] font-bold text-white leading-tight text-center drop-shadow truncate w-full">{p.name}</span>
                    {flag && <span className="text-xs leading-none">{flag}</span>}
                  </div>
                </div>
              </div>
            </Link>
          );
        };

        return (
          <div className="border-b border-(--border) grid grid-cols-2" style={{ background: 'var(--surface-sub)' }}>
            {([match.team1, match.team2]).map((team) => (
              <div key={team} className="grid grid-cols-5 gap-1.5 p-3">
                {sortByRole(lineup.filter(p => p.team === team)).map(p => <PlayerCard key={p.name} p={p} />)}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Head-to-head + recent form (only for unfinished matches) */}
      {!played && (h2h.length > 0 || t1Recent.length > 0 || t2Recent.length > 0) && (() => {
        const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
        const wonBy = (m: Match, team: string) => (m.team1 === team && m.winner === 1) || (m.team2 === team && m.winner === 2);
        const t1H2hWins = h2h.filter(m => wonBy(m, match.team1)).length;
        const t2H2hWins = h2h.length - t1H2hWins;
        return (
          <>
            {h2h.length > 0 && (
              <div className="border-b border-(--border) px-6 py-3.5">
                <div className="flex items-baseline justify-between mb-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-(--text-dim)">Head-to-Head</span>
                  <div className="text-[11px] tabular-nums">
                    <span className={t1H2hWins >= t2H2hWins ? 'text-(--text-h) font-semibold' : 'text-(--text-dim)'}>{t1H2hWins}</span>
                    <span className="text-(--text-dim) opacity-40 mx-1">–</span>
                    <span className={t2H2hWins > t1H2hWins ? 'text-(--text-h) font-semibold' : 'text-(--text-dim)'}>{t2H2hWins}</span>
                  </div>
                </div>
                <div className="flex flex-col">
                  {h2h.map(m => (
                    <div key={m.id} className="grid grid-cols-[3.5rem_1fr_auto_1fr] items-center gap-3 py-1 text-xs">
                      <span className="text-(--text-dim) opacity-60 tabular-nums">{fmtDate(m.datetime_utc)}</span>
                      <div className="flex items-center gap-2 justify-end min-w-0">
                        <span className={`truncate ${m.winner === 1 ? 'text-(--text-h) font-medium' : 'text-(--text-dim)'}`}>{m.team1}</span>
                        {teamLogos[m.team1] && <img src={teamLogos[m.team1]!} alt={m.team1} className="w-4 h-4 object-contain shrink-0" />}
                      </div>
                      <div className="flex items-center gap-1.5 tabular-nums shrink-0 px-2">
                        <span className={`font-semibold ${m.winner === 1 ? 'text-(--text-h)' : 'text-(--text-dim) opacity-40'}`}>{m.team1_score}</span>
                        <span className="text-(--text-dim) opacity-30">–</span>
                        <span className={`font-semibold ${m.winner === 2 ? 'text-(--text-h)' : 'text-(--text-dim) opacity-40'}`}>{m.team2_score}</span>
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        {teamLogos[m.team2] && <img src={teamLogos[m.team2]!} alt={m.team2} className="w-4 h-4 object-contain shrink-0" />}
                        <span className={`truncate ${m.winner === 2 ? 'text-(--text-h) font-medium' : 'text-(--text-dim)'}`}>{m.team2}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(t1Recent.length > 0 || t2Recent.length > 0) && (
              <div className="grid grid-cols-2 border-b border-(--border)">
                {[
                  { team: match.team1, matches: t1Recent },
                  { team: match.team2, matches: t2Recent },
                ].map(({ team, matches }, idx) => {
                  const wins = matches.filter(m => wonBy(m, team)).length;
                  return (
                    <div key={team} className={`px-6 py-3.5 ${idx === 0 ? 'border-r border-(--border)' : ''}`}>
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {teamLogos[team] && <img src={teamLogos[team]!} alt={team} className="w-3.5 h-3.5 object-contain shrink-0" />}
                          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-(--text-dim) truncate">{team} · Last {matches.length}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {matches.map(m => {
                            const won = wonBy(m, team);
                            return <div key={m.id} className={`w-1.5 h-3.5 rounded-sm ${won ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ opacity: 0.85 }} />;
                          })}
                          <span className="text-[10px] text-(--text-dim) ml-1.5 tabular-nums">{wins}-{matches.length - wins}</span>
                        </div>
                      </div>
                      <div className="flex flex-col">
                        {matches.map(m => {
                          const isT1 = m.team1 === team;
                          const opp = isT1 ? m.team2 : m.team1;
                          const ts = isT1 ? m.team1_score : m.team2_score;
                          const os = isT1 ? m.team2_score : m.team1_score;
                          const won = wonBy(m, team);
                          const oppLogo = teamLogos[opp];
                          return (
                            <div key={m.id} className="grid grid-cols-[auto_1fr_auto_2.5rem] items-center gap-2 py-1 text-xs">
                              <span className={`w-3 text-[10px] font-bold ${won ? 'text-emerald-400' : 'text-red-400'}`}>{won ? 'W' : 'L'}</span>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-(--text-dim) opacity-50 text-[10px]">vs</span>
                                {oppLogo && <img src={oppLogo} alt={opp} className="w-3.5 h-3.5 object-contain shrink-0" />}
                                <span className="text-(--text-h) truncate">{opp}</span>
                              </div>
                              <span className="tabular-nums font-semibold shrink-0">
                                <span className={won ? 'text-(--text-h)' : 'text-(--text-dim) opacity-60'}>{ts}</span>
                                <span className="text-(--text-dim) opacity-30 mx-0.5">–</span>
                                <span className={!won ? 'text-(--text-h)' : 'text-(--text-dim) opacity-60'}>{os}</span>
                              </span>
                              <span className="text-(--text-dim) opacity-50 tabular-nums text-[10px] text-right">{fmtDate(m.datetime_utc)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        );
      })()}

      {/* Game tabs */}
      {match.games.length > 0 && (
        <div className="flex justify-center border-b border-(--border)">
          {match.games.map((g, idx) => {
            const winnerName = g.winner === 1 ? g.team1 : g.winner === 2 ? g.team2 : null;
            const winnerLogo = winnerName ? teamLogos[winnerName] : null;
            const isSelected = selectedGameId === g.id;
            const t1Score = match.games.slice(0, idx + 1).filter(x => x.winner === 1).length;
            const t2Score = match.games.slice(0, idx + 1).filter(x => x.winner === 2).length;
            const hasResult = g.winner !== null;
            return (
              <button
                key={g.id}
                onClick={() => setSelectedGameId(isSelected ? null : g.id)}
                onMouseDown={e => e.preventDefault()}
                className={`flex items-center gap-2 px-4 h-10 -mb-px border-b-2 cursor-pointer transition-colors duration-200 shrink-0 ${
                  isSelected
                    ? 'border-(--accent) text-(--text-h)'
                    : 'border-transparent text-(--text-dim) hover:text-(--text-h) hover:bg-(--surface-hover)'
                }`}
              >
                {winnerLogo && (
                  <img src={winnerLogo} alt={winnerName!} className="w-5 h-5 object-contain shrink-0" />
                )}
                {hasResult && (
                  <span className="text-xs font-bold tabular-nums">{t1Score} - {t2Score}</span>
                )}
                <span className="text-xs font-semibold">
                  {winnerName ? `${winnerName} Win` : `Game ${g.game_number}`}
                </span>
                {g.gamelength && (
                  <span className="text-[10px] opacity-40 tabular-nums">{g.gamelength}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Selected game detail */}
      {selectedGameId !== null && (
        <GamePanel gameId={selectedGameId} matchTeam1={match.team1} matchTeam2={match.team2} teamLogos={teamLogos} />
      )}
    </>
  );
}
