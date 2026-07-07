import { useState } from 'react';
import { useParams, useNavigate, useLoaderData, useRouteError, useSearchParams, type LoaderFunctionArgs } from 'react-router-dom';
import { getMatch, getEventRosters, getGame, getMatchH2H } from '../api/core';
import type { MatchDetail, GameDetail, H2HMatch, TeamRoster } from '../types/models';
import { useDrawer } from '../contexts/DrawerContext';
import { Badge } from '../components/league/shared';
import { MatchRails } from '../components/Sidebar';
import EsportsLayout from '../components/EsportsLayout';
import { loadRails, type RailsData } from '../lib/leagueData';
import Scoreboard, { TeamMark, fallbackMeta, type TeamMeta } from '../components/match/Scoreboard';

function parseDurationMinutes(gamelength: string | null | undefined): number {
  if (!gamelength) return 0;
  const [mm] = gamelength.split(':');
  const n = Number(mm);
  return Number.isFinite(n) ? n : 0;
}

function buildTeamMeta(rosters: TeamRoster[]): Record<string, TeamMeta> {
  const next: Record<string, TeamMeta> = {};
  for (const r of rosters) {
    if (!r.name) continue;
    next[r.name] = {
      name: r.name,
      short: (r.org?.short_name || r.name).toUpperCase(),
      logo: r.org?.logo ?? null,
      color: r.org?.color ?? null,
    };
  }
  return next;
}

export interface MatchLoaderData {
  match: MatchDetail;
  teams: Record<string, TeamMeta>;
  h2h: H2HMatch[];
  game: GameDetail | null;
  gameIdx: number;
  rails: RailsData;
}

// Preloads the match, team metadata, head-to-head and the selected game's
// scoreboard. The active game is driven by the `?game=N` search param.
export async function matchLoader({ params, request }: LoaderFunctionArgs): Promise<MatchLoaderData> {
  const matchId = Number(params.id);
  const requestedIdx = Number(new URL(request.url).searchParams.get('game')) || 0;
  const match = (await getMatch(matchId)).data; // throws → route errorElement
  const gameIdx = match.games[requestedIdx] ? requestedIdx : 0;
  const [teams, h2h, game, rails] = await Promise.all([
    getEventRosters(match.event.id).then((res) => buildTeamMeta(res.data.results)).catch(() => ({})),
    getMatchH2H(matchId).then((res) => res.data.results).catch(() => []),
    match.games[gameIdx] ? getGame(match.games[gameIdx].id).then((res) => res.data).catch(() => null) : Promise.resolve(null),
    loadRails([match.event.id]),
  ]);
  return { match, teams, h2h, game, gameIdx, rails };
}

export function MatchLoadError() {
  const error = useRouteError();
  return (
    <div style={{ padding: '40px 28px' }}>
      <p className="text-sm" style={{ color: 'var(--red)' }}>{String(error) || 'Match not found'}</p>
    </div>
  );
}


export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  // Remount per match so all view state resets cleanly from fresh loader data.
  return <MatchDetailView key={id} />;
}

function MatchDetailView() {
  const { match, teams, h2h, game, gameIdx, rails } = useLoaderData() as MatchLoaderData;
  const matchId = match.id;
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const { openTeam, openPlayer } = useDrawer();

  const [view, setView] = useState<'scoreboard' | 'h2h'>('scoreboard');

  function selectGame(i: number) {
    setSearchParams(i > 0 ? { game: String(i) } : {}, { preventScrollReset: true });
  }

  const played = match.winner !== null;
  const t1Win = match.winner === 1;
  const t2Win = match.winner === 2;
  const dt = match.datetime_utc ? new Date(match.datetime_utc) : null;
  const t1 = teams[match.team1] || fallbackMeta(match.team1);
  const t2 = teams[match.team2] || fallbackMeta(match.team2);

  // The shared rails take flat logo/short-name maps; derive them here.
  const teamLogos = Object.fromEntries(Object.entries(teams).map(([n, m]) => [n, m.logo]));
  const teamShortNames = Object.fromEntries(Object.entries(teams).map(([n, m]) => [n, m.short]));

  return (
    <EsportsLayout
      right={
        <MatchRails
          eventIds={[match.event.id]}
          upcoming={rails.upcoming}
          recent={rails.recent}
          teamLogos={teamLogos}
          teamShortNames={teamShortNames}
          onMatchSelect={(id) => navigate(`/matches/${id}`)}
          currentMatchId={matchId}
        />
      }
    >
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, var(--accent-muted) 0%, transparent 50%, var(--accent-muted) 100%), var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '24px 28px 12px' }}>
          <div className="grid items-center" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', gap: 18 }}>
            <TeamHeader team={t1} won={t1Win} played={played} align="left" onClick={() => openTeam(t1.name)} />
            <div className="font-display tabular-nums text-center" style={{ fontSize: 'clamp(32px, 9vw, 56px)', fontWeight: 700, color: 'var(--text-h)', letterSpacing: '-0.04em', lineHeight: 1, padding: '0 12px' }}>
              {played ? (
                <>{match.team1_score} <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>–</span> {match.team2_score}</>
              ) : (
                <span style={{ fontSize: 26, color: 'var(--text-dim)', letterSpacing: '0.04em' }}>vs</span>
              )}
            </div>
            <TeamHeader team={t2} won={t2Win} played={played} align="right" onClick={() => openTeam(t2.name)} />
          </div>
        </div>

        <div
          className="flex items-center justify-center flex-wrap"
          style={{ padding: '11px 20px', gap: 9 }}
        >
          <span className="inline-flex items-center" style={{ gap: 5 }}>
            {match.event.league.logo && (
              <img src={match.event.league.logo} alt="" className="logo-themed" style={{ width: 13, height: 13, objectFit: 'contain', opacity: 0.6 }} />
            )}
            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {match.event.league.short_name ?? match.event.league.name}
            </span>
          </span>

          <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>|</span>

          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400 }}>{match.tab || match.event.name}</span>
          <Dot />
          <span className="tabular-nums" style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400 }}>BO{match.best_of}</span>
          {dt && (
            <>
              <Dot />
              <span className="tabular-nums" style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400 }}>
                {dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            </>
          )}
          {match.patch && (
            <>
              <Dot />
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400 }}>Patch {match.patch}</span>
            </>
          )}
        </div>

        {/* View switcher */}
        <div className="flex items-center border-t border-(--border)" style={{ padding: '0 14px' }}>
          <button
            type="button"
            onClick={() => setView('scoreboard')}
            className={`section-tab${view === 'scoreboard' ? ' active' : ''}`}
          >
            Scoreboard
          </button>
          {h2h.length > 0 && (
            <button
              type="button"
              onClick={() => setView('h2h')}
              className={`section-tab${view === 'h2h' ? ' active' : ''}`}
            >
              Head-to-head
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {view === 'h2h' && h2h.length > 0 ? (
        <div style={{ marginTop: 22 }}>
          <PastMeetings meetings={h2h} t1={t1} t2={t2} />
        </div>
      ) : match.games.length > 0 ? (
        <>
          <div className="flex items-center justify-center flex-wrap" style={{ margin: '22px 2px 12px', gap: 8 }}>
            {match.games.map((g, i) => (
              <GameButton key={g.id} index={i} game={g} active={i === gameIdx} teams={teams} fallback1={t1} fallback2={t2} onClick={() => selectGame(i)} />
            ))}
          </div>

          {/* Inline full scoreboard — preloaded by the route loader */}
          {!game ? (
            <div className="flex items-center justify-center" style={{ padding: 80 }}><div className="spinner" /></div>
          ) : (
            <Scoreboard game={game} teams={teams} onOpenPlayer={openPlayer} />
          )}
        </>
      ) : (
        <div className="text-center text-(--text-dim)" style={{ padding: '40px 24px', fontSize: 13 }}>
          Games haven't started yet. Picks and stats will appear once the series begins.
        </div>
      )}
    </EsportsLayout>
  );
}

function Dot() {
  return <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>|</span>;
}

/* Team header */

function TeamHeader({ team, won, played, align, onClick }: { team: TeamMeta; won: boolean; played: boolean; align: 'left' | 'right'; onClick: () => void }) {
  const right = align === 'right';
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center min-w-0 hover:opacity-80 transition-opacity"
      style={{ flexDirection: right ? 'row-reverse' : 'row', textAlign: right ? 'right' : 'left', gap: 14, background: 'transparent', border: 0, cursor: 'pointer' }}
    >
      <TeamMark team={team} size={64} />
      <div className="min-w-0">
        <div className="font-display truncate" style={{ fontSize: 26, fontWeight: 600, color: 'var(--text-h)', letterSpacing: '-0.02em', lineHeight: 1.1, opacity: played && !won ? 0.7 : 1 }}>
          {team.name}
        </div>
        <div className="text-(--text-dim) flex items-center" style={{ fontSize: 11, letterSpacing: '0.06em', marginTop: 2, gap: 6, justifyContent: right ? 'flex-end' : 'flex-start' }}>
          <span>{team.short}</span>
        </div>
      </div>
    </button>
  );
}

/* Game button */

function GameButton({ index, game, active, teams, fallback1, fallback2, onClick }: { index: number; game: MatchDetail['games'][number]; active: boolean; teams: Record<string, TeamMeta>; fallback1: TeamMeta; fallback2: TeamMeta; onClick: () => void }) {
  const winner = game.winner;
  const winnerName = winner === 1 ? game.team1 : winner === 2 ? game.team2 : null;
  const winningTeam = winnerName ? teams[winnerName] || (winnerName === fallback1.name ? fallback1 : fallback2) : null;
  const duration = parseDurationMinutes(game.gamelength);
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center transition-all"
      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid ' + (active ? 'var(--accent-border)' : 'var(--border)'), background: active ? 'var(--accent-muted)' : 'var(--surface)', cursor: 'pointer', gap: 10, fontFamily: 'var(--font-sans)' }}
    >
      <span className="font-bold uppercase" style={{ fontSize: 10.5, letterSpacing: '0.08em', color: active ? 'var(--accent-2)' : 'var(--text-dim)' }}>
        GAME {index + 1}
      </span>
      {winningTeam && (
        <span className="inline-flex items-center tabular-nums" style={{ gap: 5 }}>
          <TeamMark team={winningTeam} size={16} />
          {duration > 0 && <span className="text-(--text-h) font-semibold" style={{ fontSize: 12 }}>{duration}m</span>}
        </span>
      )}
    </button>
  );
}

/* Past meetings */

function PastMeetings({ meetings, t1, t2 }: { meetings: H2HMatch[]; t1: TeamMeta; t2: TeamMeta }) {
  const t1Wins = meetings.filter((m) => m.winner === 1).length;
  const t2Wins = meetings.filter((m) => m.winner === 2).length;

  return (
    <section>
      <div className="flex items-center justify-between" style={{ margin: '0 2px 12px' }}>
        <h3 className="section-label">
          Past meetings · {meetings.length}
        </h3>
        {/* Head-to-head record */}
        <div className="flex items-center" style={{ gap: 8 }}>
          <TeamMark team={t1} size={18} />
          <span
            className="font-display tabular-nums"
            style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: t1Wins > t2Wins ? 'var(--green)' : 'var(--text-h)' }}
          >
            {t1Wins}
          </span>
          <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>–</span>
          <span
            className="font-display tabular-nums"
            style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: t2Wins > t1Wins ? 'var(--green)' : 'var(--text-h)' }}
          >
            {t2Wins}
          </span>
          <TeamMark team={t2} size={18} />
        </div>
      </div>

      <div className="card card-soft-shadow overflow-hidden">
        {meetings.map((m, i) => (
          <PastMeetingRow key={m.id} m={m} t1={t1} t2={t2} isLast={i === meetings.length - 1} />
        ))}
      </div>
    </section>
  );
}

function tabTone(tab: string): 'accent' | 'amber' | 'neutral' {
  const t = tab.toLowerCase();
  if (t.includes('final')) return 'accent';
  if (t.includes('playoff')) return 'amber';
  return 'neutral';
}

function PastMeetingRow({ m, t1, t2, isLast }: { m: H2HMatch; t1: TeamMeta; t2: TeamMeta; isLast: boolean }) {
  const navigate = useNavigate();
  const t1Won = m.winner === 1;
  const t2Won = m.winner === 2;
  const dt = m.datetime_utc ? new Date(m.datetime_utc) : null;

  return (
    <button
      type="button"
      onClick={() => navigate(`/matches/${m.id}`)}
      className="w-full grid items-center transition-colors hover:bg-(--surface-sub) text-left"
      style={{
        padding: '14px 20px',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        gridTemplateColumns: '78px minmax(0, 1fr) auto 116px',
        gap: 16,
      }}
    >
      {/* Date */}
      <div>
        <div className="tabular-nums font-medium" style={{ fontSize: 12.5, color: 'var(--text-h)' }}>
          {dt ? dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
        </div>
        {dt && (
          <div className="tabular-nums" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>
            {dt.getFullYear()}
          </div>
        )}
      </div>

      {/* Matchup */}
      <div className="flex items-center min-w-0" style={{ gap: 14 }}>
        <div className="flex items-center flex-1 min-w-0" style={{ gap: 10, opacity: t1Won ? 1 : 0.62 }}>
          <TeamMark team={t1} size={28} />
          <div className="min-w-0 flex items-center" style={{ gap: 6 }}>
            <span className={`text-sm truncate text-(--text-h) ${t1Won ? 'font-bold' : 'font-medium'}`}>{t1.short}</span>
            {t1Won && <Badge tone="green">W</Badge>}
          </div>
        </div>

        <div
          className="tabular-nums font-bold flex items-center justify-center"
          style={{ fontSize: 17, letterSpacing: '-0.02em', minWidth: 64, padding: '4px 10px', borderRadius: 7, background: 'var(--surface-sub)', color: 'var(--text-h)' }}
        >
          {m.team1_score} <span className="text-(--text-faint) font-normal mx-1">–</span> {m.team2_score}
        </div>

        <div className="flex items-center flex-1 min-w-0 flex-row-reverse" style={{ gap: 10, opacity: t2Won ? 1 : 0.62 }}>
          <TeamMark team={t2} size={28} />
          <div className="min-w-0 text-right flex items-center justify-end" style={{ gap: 6 }}>
            {t2Won && <Badge tone="green">W</Badge>}
            <span className={`text-sm truncate text-(--text-h) ${t2Won ? 'font-bold' : 'font-medium'}`}>{t2.short}</span>
          </div>
        </div>
      </div>

      {/* Stage / BO */}
      <div className="flex items-center gap-2 justify-end text-xs">
        {m.tab && <Badge tone={tabTone(m.tab)}>{m.tab.length > 12 ? m.tab.slice(0, 10) + '…' : m.tab}</Badge>}
        <span className="font-semibold tracking-wide text-(--text-dim)">BO{m.best_of}</span>
      </div>

      {/* Event + patch */}
      <div className="text-right min-w-0">
        <div className="truncate" style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500 }}>{m.event_name}</div>
        {m.patch && <div className="tabular-nums" style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>Patch {m.patch}</div>}
      </div>
    </button>
  );
}
