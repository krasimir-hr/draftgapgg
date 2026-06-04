import { useEffect, useState } from 'react';
import { getMatch, getEventRosters, getGame } from '../../api/core';
import type { MatchDetail, GameDetail, PlayerPerformance, Champion } from '../../types/models';
import { useDrawer } from '../../contexts/DrawerContext';
import { RoleChip } from '../league/shared';
import { ChampionIcon } from '../ChampionIcon';

interface Props {
  matchId: number;
}

interface TeamMeta {
  name: string;
  short: string;
  logo: string | null;
  color: string | null;
}

/* ── helpers ─────────────────────────────────────────────────────────── */

/** "31:24" → 31 */
function parseDurationMinutes(gamelength: string | null | undefined): number {
  if (!gamelength) return 0;
  const [mm] = gamelength.split(':');
  const n = Number(mm);
  return Number.isFinite(n) ? n : 0;
}

function withAlpha(color: string | null | undefined, alphaHex: string): string {
  /* "#ab12cd" → "#ab12cd14"; if non-hex, fall back to current --accent-muted */
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return 'var(--accent-muted)';
  return `${color}${alphaHex}`;
}

/* ── Drawer ──────────────────────────────────────────────────────────── */

export default function MatchDrawer({ matchId }: Props) {
  const { openTeam, openPlayer, openScoreboard } = useDrawer();
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teams, setTeams] = useState<Record<string, TeamMeta>>({});
  const [activeIdx, setActiveIdx] = useState(0);
  const [game, setGame] = useState<GameDetail | null>(null);
  const [gameLoading, setGameLoading] = useState(false);

  /* Match fetch */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setActiveIdx(0);
    getMatch(matchId)
      .then((res) => { if (!cancelled) { setMatch(res.data); setLoading(false); } })
      .catch((e: unknown) => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [matchId]);

  /* Roster fetch (logos + short names + colors) */
  useEffect(() => {
    if (!match) return;
    getEventRosters(match.event.id).then((res) => {
      const next: Record<string, TeamMeta> = {};
      for (const r of res.data.results) {
        if (!r.name) continue;
        next[r.name] = {
          name: r.name,
          short: (r.org?.short_name || r.name).toUpperCase(),
          logo: r.org?.logo ?? null,
          color: r.org?.color ?? null,
        };
      }
      setTeams(next);
    }).catch(() => {});
  }, [match?.id]);

  /* Selected game detail (for MVP + picks/bans + objectives + perf) */
  useEffect(() => {
    if (!match || !match.games[activeIdx]) { setGame(null); return; }
    const gameId = match.games[activeIdx].id;
    let cancelled = false;
    setGameLoading(true);
    getGame(gameId)
      .then((res) => { if (!cancelled) { setGame(res.data); setGameLoading(false); } })
      .catch(() => { if (!cancelled) setGameLoading(false); });
    return () => { cancelled = true; };
  }, [match?.id, activeIdx]);

  if (loading) {
    return <div className="flex items-center justify-center" style={{ padding: 80 }}><div className="spinner" /></div>;
  }
  if (error || !match) {
    return (
      <div style={{ padding: '40px 28px' }}>
        <p className="text-sm" style={{ color: 'var(--red)' }}>{error ?? 'Match not found'}</p>
      </div>
    );
  }

  const played = match.winner !== null;
  const t1Win = match.winner === 1;
  const t2Win = match.winner === 2;
  const dt = match.datetime_utc ? new Date(match.datetime_utc) : null;
  const t1 = teams[match.team1] || fallbackTeam(match.team1);
  const t2 = teams[match.team2] || fallbackTeam(match.team2);

  const mvp = pickMvp(match, game);

  return (
    <>
      {/* Header */}
      <div
        style={{
          padding: '24px 28px 22px',
          background: `linear-gradient(135deg, ${withAlpha(t1.color, '14')} 0%, transparent 50%, ${withAlpha(t2.color, '14')} 100%)`,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center flex-wrap" style={{ marginBottom: 14, paddingRight: 40, gap: 10 }}>
          <span
            className="font-bold uppercase"
            style={{ fontSize: 10.5, letterSpacing: '0.12em', color: 'var(--accent)' }}
          >
            {played ? 'Final' : 'Upcoming'}
          </span>
          <span style={{ color: 'var(--text-faint)' }}>·</span>
          <span
            className="text-(--text-dim) font-semibold uppercase"
            style={{ fontSize: 11, letterSpacing: '0.08em' }}
          >
            {match.tab || match.event.name} · BO{match.best_of}
          </span>
          {dt && (
            <>
              <span style={{ color: 'var(--text-faint)' }}>·</span>
              <span className="text-(--text-dim) tabular-nums" style={{ fontSize: 11 }}>
                {dt.toLocaleString(undefined, {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </span>
            </>
          )}
          {match.patch && (
            <span
              className="ml-auto text-(--text-dim) font-mono"
              style={{ fontSize: 11 }}
            >
              Patch {match.patch}
            </span>
          )}
        </div>

        {/* Score block */}
        <div
          className="grid items-center"
          style={{ gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', gap: 18 }}
        >
          <TeamHeader team={t1} won={t1Win} played={played} align="left" onClick={() => openTeam(t1.name)} />
          <div
            className="font-display tabular-nums text-center"
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: 'var(--text-h)',
              letterSpacing: '-0.04em',
              lineHeight: 1,
              padding: '0 12px',
            }}
          >
            {played ? (
              <>
                {match.team1_score}{' '}
                <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>–</span>{' '}
                {match.team2_score}
              </>
            ) : (
              <span style={{ fontSize: 26, color: 'var(--text-dim)', letterSpacing: '0.04em' }}>vs</span>
            )}
          </div>
          <TeamHeader team={t2} won={t2Win} played={played} align="right" onClick={() => openTeam(t2.name)} />
        </div>

        {/* MVP card — always shown for played matches (defaults until API ships it) */}
        {played && (
          <MvpCard
            mvp={mvp}
            winningTeam={t1Win ? t1 : t2}
            onClick={() => mvp && openPlayer(mvp.name)}
          />
        )}
      </div>

      {/* Games (button row with prev/next arrows) */}
      {match.games.length > 0 ? (
        <>
          <div style={{ padding: '20px 24px 0' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
              <h3 className="drawer-section-label">Games · {match.games.length}</h3>
              <div className="flex items-center" style={{ gap: 4 }}>
                <ArrowBtn
                  dir="left"
                  disabled={activeIdx === 0}
                  onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
                />
                <ArrowBtn
                  dir="right"
                  disabled={activeIdx >= match.games.length - 1}
                  onClick={() => setActiveIdx((i) => Math.min(match.games.length - 1, i + 1))}
                />
              </div>
            </div>

            <div className="flex flex-wrap" style={{ gap: 8 }}>
              {match.games.map((g, i) => (
                <GameButton
                  key={g.id}
                  index={i}
                  game={g}
                  active={i === activeIdx}
                  teams={teams}
                  fallback1={t1}
                  fallback2={t2}
                  onClick={() => setActiveIdx(i)}
                />
              ))}
            </div>
          </div>

          <GamePanel
            match={match}
            game={game}
            gameIdx={activeIdx}
            t1={t1}
            t2={t2}
            loading={gameLoading}
            onOpenScoreboard={() => openScoreboard(match.id, activeIdx)}
          />
        </>
      ) : (
        <div
          className="text-center text-(--text-dim)"
          style={{ padding: '40px 24px', fontSize: 13 }}
        >
          Games haven't started yet. Picks and stats will appear once the series begins.
        </div>
      )}
    </>
  );
}

function fallbackTeam(name: string): TeamMeta {
  return { name, short: name.toUpperCase().slice(0, 4), logo: null, color: null };
}

function pickMvp(match: MatchDetail, game: GameDetail | null): PlayerPerformance | null {
  if (!game || game.performances.length === 0) return null;
  const winningTeam = match.winner === 1 ? match.team1 : match.winner === 2 ? match.team2 : null;
  if (!winningTeam) return null;
  const candidates = game.performances.filter((p) => p.team === winningTeam);
  if (candidates.length === 0) return null;
  return [...candidates].sort(
    (a, b) => (b.kills + b.assists - b.deaths) - (a.kills + a.assists - a.deaths),
  )[0];
}

/* ── Team header ─────────────────────────────────────────────────────── */

function TeamHeader({
  team, won, played, align, onClick,
}: {
  team: TeamMeta;
  won: boolean;
  played: boolean;
  align: 'left' | 'right';
  onClick: () => void;
}) {
  const right = align === 'right';
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center min-w-0 hover:opacity-80 transition-opacity"
      style={{
        flexDirection: right ? 'row-reverse' : 'row',
        textAlign: right ? 'right' : 'left',
        gap: 14,
      }}
    >
      <TeamMark team={team} size={56} />
      <div className="min-w-0">
        <div
          className="font-display truncate"
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--text-h)',
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            opacity: played && !won ? 0.7 : 1,
          }}
        >
          {team.name}
        </div>
        <div
          className="text-(--text-dim) flex items-center"
          style={{
            fontSize: 11,
            letterSpacing: '0.06em',
            marginTop: 2,
            gap: 6,
            justifyContent: right ? 'flex-end' : 'flex-start',
          }}
        >
          <span>{team.short}</span>
          {won && played && (
            <span style={{ color: 'var(--green)', fontWeight: 700, letterSpacing: '0.12em' }}>
              WINNER
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/* ── Team mark (logo or coloured initials) ──────────────────────────── */

function TeamMark({ team, size }: { team: TeamMeta; size: number }) {
  if (team.logo) {
    return (
      <div
        className="shrink-0 flex items-center justify-center overflow-hidden"
        style={{ width: size, height: size }}
      >
        <img src={team.logo} alt={team.short} className="max-w-full max-h-full object-contain" />
      </div>
    );
  }
  return (
    <div
      className="shrink-0 flex items-center justify-center text-white"
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(4, size * 0.22),
        background: team.color || 'var(--accent)',
        fontWeight: 700,
        fontSize: size * 0.38,
        fontFamily: 'var(--font-sans)',
        letterSpacing: '-0.04em',
      }}
    >
      {team.short.length > 2 ? team.short.slice(0, 2) : team.short}
    </div>
  );
}

/* ── MVP card ────────────────────────────────────────────────────────── */

function MvpCard({
  mvp, winningTeam, onClick,
}: {
  mvp: PlayerPerformance | null;
  winningTeam: TeamMeta;
  onClick: () => void;
}) {
  const kda = mvp
    ? ((mvp.kills + mvp.assists) / Math.max(0.1, mvp.deaths)).toFixed(2)
    : '—';
  const stat = mvp ? `${mvp.kills} / ${mvp.deaths} / ${mvp.assists}` : '—';
  const name = mvp?.name ?? '—';
  const role = mvp?.role ?? null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!mvp}
      className="flex items-center w-full transition-colors hover:bg-(--surface-hover)"
      style={{
        marginTop: 18,
        padding: '10px 14px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        gap: 12,
        textAlign: 'left',
        cursor: mvp ? 'pointer' : 'default',
      }}
    >
      <span
        className="font-bold uppercase text-(--text-dim) shrink-0"
        style={{ fontSize: 9.5, letterSpacing: '0.12em' }}
      >
        ★ MVP
      </span>
      <PlayerAvatar name={name} image={null} color={winningTeam.color} size={28} />
      <div className="flex-1 min-w-0">
        <div
          className="flex items-center text-(--text-h) font-semibold"
          style={{ fontSize: 13, gap: 6 }}
        >
          <span className="truncate">{name}</span>
          {role && <RoleChip role={role} size="sm" />}
        </div>
        <div
          className="text-(--text-dim)"
          style={{ fontSize: 11 }}
        >
          {winningTeam.short} · KDA {kda} · K/D/A {stat}
        </div>
      </div>
      {mvp && (
        <span style={{ color: 'var(--accent-2)', fontSize: 12, fontWeight: 600 }}>
          View →
        </span>
      )}
    </button>
  );
}

/* ── Player avatar (simple coloured tile) ───────────────────────────── */

function PlayerAvatar({
  name, image, color, size,
}: {
  name: string;
  image?: string | null;
  color?: string | null;
  size: number;
}) {
  const radius = Math.max(4, size * 0.18);

  if (image) {
    return (
      <div
        style={{
          width: size, height: size, borderRadius: radius, flexShrink: 0,
          boxSizing: 'border-box', overflow: 'hidden',
          border: '1px solid var(--accent-border)',
          boxShadow: 'var(--shadow-md)',
          background: 'linear-gradient(160deg, #1e1830 0%, #0e0c18 100%)',
        }}
      >
        <img
          src={image}
          alt={name}
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
        />
      </div>
    );
  }
  return (
    <div
      className="flex items-center justify-center text-white"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        background: color || 'var(--accent)',
        fontWeight: 700,
        fontSize: size * 0.4,
        fontFamily: 'var(--font-sans)',
      }}
    >
      {name.slice(0, 1)}
    </div>
  );
}

/* ── Game button ─────────────────────────────────────────────────────── */

function GameButton({
  index, game, active, teams, fallback1, fallback2, onClick,
}: {
  index: number;
  game: MatchDetail['games'][number];
  active: boolean;
  teams: Record<string, TeamMeta>;
  fallback1: TeamMeta;
  fallback2: TeamMeta;
  onClick: () => void;
}) {
  /* game.team1/team2 are blue/red for THIS game (may be swapped vs. match.team1/team2).
     game.winner === 1 means game.team1 won; === 2 means game.team2 won. */
  const winner = game.winner;
  const winnerName = winner === 1 ? game.team1 : winner === 2 ? game.team2 : null;
  const winningTeam = winnerName
    ? teams[winnerName] || (winnerName === fallback1.name ? fallback1 : fallback2)
    : null;
  const duration = parseDurationMinutes(game.gamelength);

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center transition-all"
      style={{
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid ' + (active ? 'var(--accent-border)' : 'var(--border)'),
        background: active ? 'var(--accent-muted)' : 'var(--surface)',
        cursor: 'pointer',
        gap: 10,
        fontFamily: 'var(--font-sans)',
      }}
    >
      <span
        className="font-bold uppercase"
        style={{
          fontSize: 10.5,
          letterSpacing: '0.08em',
          color: active ? 'var(--accent-2)' : 'var(--text-dim)',
        }}
      >
        GAME {index + 1}
      </span>
      {winningTeam ? (
        <span className="inline-flex items-center tabular-nums" style={{ gap: 5 }}>
          <TeamMark team={winningTeam} size={16} />
          {duration > 0 && (
            <span
              className="text-(--text-h) font-semibold"
              style={{ fontSize: 12 }}
            >
              {duration}m
            </span>
          )}
        </span>
      ) : null}
    </button>
  );
}

function ArrowBtn({
  dir, disabled, onClick,
}: {
  dir: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center justify-center transition-colors"
      style={{
        width: 28,
        height: 28,
        border: '1px solid var(--border)',
        borderRadius: 7,
        background: 'var(--surface)',
        color: 'var(--text)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        fontSize: 14,
        lineHeight: 1,
      }}
      aria-label={dir === 'left' ? 'Previous game' : 'Next game'}
    >
      {dir === 'left' ? '←' : '→'}
    </button>
  );
}

/* ── Game panel (open-scoreboard CTA + stats + picks/bans) ──────────── */

function GamePanel({
  match, game, gameIdx, t1, t2, loading, onOpenScoreboard,
}: {
  match: MatchDetail;
  game: GameDetail | null;
  gameIdx: number;
  t1: TeamMeta;
  t2: TeamMeta;
  loading: boolean;
  onOpenScoreboard: () => void;
}) {
  const gameListItem = match.games[gameIdx];
  const duration = parseDurationMinutes(gameListItem?.gamelength);
  const played = gameListItem?.winner !== null && gameListItem?.winner !== undefined;

  /* game.team1 is THIS game's blue side. Map blue/red onto match team1/team2. */
  const t1IsBlue = gameListItem ? gameListItem.team1 === match.team1 : true;
  const blueKills = gameListItem?.team1_kills ?? 0;
  const redKills = gameListItem?.team2_kills ?? 0;
  const blueTowers = gameListItem?.team1_towers ?? 0;
  const redTowers = gameListItem?.team2_towers ?? 0;
  const blueGold = gameListItem?.team1_gold ?? 0;
  const redGold = gameListItem?.team2_gold ?? 0;

  const t1Kills  = t1IsBlue ? blueKills  : redKills;
  const t2Kills  = t1IsBlue ? redKills   : blueKills;
  const t1Towers = t1IsBlue ? blueTowers : redTowers;
  const t2Towers = t1IsBlue ? redTowers  : blueTowers;
  const t1Gold   = t1IsBlue ? blueGold   : redGold;
  const t2Gold   = t1IsBlue ? redGold    : blueGold;
  const goldDiff = t1Gold - t2Gold;

  const winnerName = gameListItem
    ? gameListItem.winner === 1 ? gameListItem.team1
    : gameListItem.winner === 2 ? gameListItem.team2
    : null
    : null;
  const t1Win = winnerName === match.team1;
  const t2Win = winnerName === match.team2;

  return (
    <div style={{ padding: '14px 24px 24px' }}>
      {/* Open full scoreboard CTA */}
      {played && (
        <button
          type="button"
          onClick={onOpenScoreboard}
          className="w-full transition-colors text-left flex items-center"
          style={{
            padding: '11px 14px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            marginBottom: 14,
            gap: 10,
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
          }}
        >
          <span
            className="flex items-center justify-center font-bold"
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: 'var(--accent-muted)',
              color: 'var(--accent-2)',
              fontSize: 14,
            }}
          >
            ⛬
          </span>
          <div className="flex-1 min-w-0">
            <div
              className="text-(--text-h) font-semibold"
              style={{ fontSize: 13 }}
            >
              Open full scoreboard
            </div>
            <div className="text-(--text-dim)" style={{ fontSize: 11 }}>
              Per-player items, KDA, gold, damage and objectives
            </div>
          </div>
          <span style={{ color: 'var(--accent-2)', fontSize: 13, fontWeight: 600 }}>→</span>
        </button>
      )}

      {/* Game summary stats */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 18,
        }}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: '1fr 1fr 1fr 1fr',
            gap: 1,
            background: 'var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <MicroStat label="Duration" value={duration > 0 ? `${duration}m` : '—'} />
          <MicroStat
            label="Kills"
            value={`${t1Kills} – ${t2Kills}`}
            t1Win={t1Win}
            t2Win={t2Win}
          />
          <MicroStat
            label="Towers"
            value={`${t1Towers} – ${t2Towers}`}
            t1Win={t1Win}
            t2Win={t2Win}
          />
          <MicroStat
            label="Gold diff"
            value={`${goldDiff > 0 ? '+' : ''}${(goldDiff / 1000).toFixed(1)}k`}
            color={goldDiff > 0 ? 'var(--green)' : goldDiff < 0 ? 'var(--red)' : undefined}
          />
        </div>
      </div>

      {/* Picks & bans — always rendered blue (game.team1) on top, red (game.team2) below */}
      <h3 className="drawer-section-label">Picks &amp; bans</h3>
      <div className="flex flex-col" style={{ marginTop: 12, gap: 10 }}>
        {loading && !game && (
          <div className="flex items-center justify-center" style={{ padding: 30 }}>
            <div className="spinner" />
          </div>
        )}
        {game && (() => {
          const blueTeam = teamForName(game.team1, t1, t2);
          const redTeam  = teamForName(game.team2, t1, t2);
          return (
            <>
              <DraftRow
                side="blue"
                team={blueTeam}
                picks={game.team1_picks}
                bans={game.team1_bans}
                won={game.winner === 1}
              />
              <DraftRow
                side="red"
                team={redTeam}
                picks={game.team2_picks}
                bans={game.team2_bans}
                won={game.winner === 2}
              />
            </>
          );
        })()}
      </div>
    </div>
  );
}

function teamForName(name: string, t1: TeamMeta, t2: TeamMeta): TeamMeta {
  if (name === t1.name) return t1;
  if (name === t2.name) return t2;
  return { name, short: name.toUpperCase().slice(0, 4), logo: null, color: null };
}

function MicroStat({
  label, value, color, t1Win, t2Win,
}: {
  label: string;
  value: string;
  color?: string;
  t1Win?: boolean;
  t2Win?: boolean;
}) {
  return (
    <div style={{ background: 'var(--surface)', padding: '11px 14px' }}>
      <div
        className="text-(--text-dim) font-semibold uppercase"
        style={{ fontSize: 9, letterSpacing: '0.08em', marginBottom: 3 }}
      >
        {label}
      </div>
      <div
        className="font-sans tabular-nums"
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: color || 'var(--text-h)',
          lineHeight: 1.1,
        }}
      >
        {t1Win || t2Win ? (
          <span>
            <span style={{ color: t1Win ? 'var(--green)' : undefined }}>{value.split(' – ')[0]}</span>
            <span style={{ color: 'var(--text-faint)' }}> – </span>
            <span style={{ color: t2Win ? 'var(--green)' : undefined }}>{value.split(' – ')[1]}</span>
          </span>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

/* ── Draft row (picks & bans per side) ──────────────────────────────── */

function DraftRow({
  side, team, picks, bans, won,
}: {
  side: 'blue' | 'red';
  team: TeamMeta;
  picks: Champion[];
  bans: Champion[];
  won: boolean;
}) {
  const sideColor = side === 'blue' ? 'var(--blue)' : 'var(--red)';

  return (
    <div
      className="flex items-center flex-wrap"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${sideColor}`,
        borderRadius: 8,
        padding: '12px 14px',
        gap: 14,
      }}
    >
      <div className="flex items-center shrink-0" style={{ gap: 10, minWidth: 130 }}>
        <TeamMark team={team} size={28} />
        <div>
          <div
            className="text-(--text-h)"
            style={{ fontSize: 13, fontWeight: won ? 700 : 600 }}
          >
            {team.name}
          </div>
          <div
            className="uppercase font-bold"
            style={{
              fontSize: 9.5,
              color: sideColor,
              letterSpacing: '0.12em',
            }}
          >
            {side === 'blue' ? 'Blue side' : 'Red side'}{won && ' · win'}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col" style={{ gap: 8, minWidth: 0 }}>
        <div className="flex items-center" style={{ gap: 6 }}>
          <span
            className="text-(--text-dim) uppercase font-semibold shrink-0"
            style={{ fontSize: 9, letterSpacing: '0.1em', minWidth: 30 }}
          >
            Picks
          </span>
          {picks.length === 0 ? (
            <span className="text-(--text-faint)" style={{ fontSize: 11 }}>—</span>
          ) : (
            picks.map((c) => <ChampIcon key={c.id} champ={c} size={32} />)
          )}
        </div>
        <div className="flex items-center" style={{ gap: 6 }}>
          <span
            className="text-(--text-dim) uppercase font-semibold shrink-0"
            style={{ fontSize: 9, letterSpacing: '0.1em', minWidth: 30 }}
          >
            Bans
          </span>
          {bans.length === 0 ? (
            <span className="text-(--text-faint)" style={{ fontSize: 11 }}>—</span>
          ) : (
            bans.map((c) => <ChampIcon key={c.id} champ={c} size={28} banned />)
          )}
        </div>
      </div>
    </div>
  );
}

function ChampIcon({
  champ, size, banned,
}: {
  champ: Champion;
  size: number;
  banned?: boolean;
}) {
  return (
    <div className="relative" title={champ.name}>
      <ChampionIcon
        src={champ.icon_url}
        alt={champ.name}
        size={size}
        style={{
          opacity: banned ? 0.45 : 1,
          filter: banned ? 'saturate(0.5)' : 'none',
        }}
      />
      {banned && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              width: '85%',
              height: 2,
              background: 'var(--red)',
              transform: 'rotate(-30deg)',
              borderRadius: 2,
              boxShadow: '0 0 0 1.5px var(--surface)',
            }}
          />
        </div>
      )}
    </div>
  );
}
