import { useEffect, useMemo, useState } from 'react';
import { getMatch, getGame, getEventRosters } from '../../api/core';
import type {
  MatchDetail, GameDetail, PlayerPerformance, Champion, Item, Rune, SummonerSpell,
} from '../../types/models';
import { useDrawer } from '../../contexts/DrawerContext';
import { ROLE_COLOR, ROLE_ICON, ROLE_ABBR } from '../league/shared';
import { ChampionIcon } from '../ChampionIcon';

interface Props {
  matchId: number;
  initialGameIdx: number;
}

interface TeamMeta {
  name: string;
  short: string;
  logo: string | null;
  color: string | null;
}

const ROLE_ORDER = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'];

/* Use ROLE_ABBR from shared for short role labels (TOP/JGL/MID/BOT/SUP). */
const ROLE_SHORT = ROLE_ABBR;

function parseDurationMinutes(g: string | null | undefined): number {
  if (!g) return 0;
  const [mm] = g.split(':');
  const n = Number(mm);
  return Number.isFinite(n) ? n : 0;
}

function ddragonRune(path: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/img/${path}`;
}

function fallbackMeta(name: string): TeamMeta {
  return { name, short: name.toUpperCase().slice(0, 4), logo: null, color: null };
}

/* ─── Component ───────────────────────────────────────────────────────── */

export default function MatchScoreboard({ matchId, initialGameIdx }: Props) {
  const { closeScoreboard, openPlayer } = useDrawer();
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [activeIdx, setActiveIdx] = useState(initialGameIdx);
  const [game, setGame] = useState<GameDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Record<string, TeamMeta>>({});

  /* Match */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMatch(matchId)
      .then((res) => { if (!cancelled) { setMatch(res.data); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [matchId]);

  /* Roster */
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

  /* Current game */
  useEffect(() => {
    if (!match || !match.games[activeIdx]) { setGame(null); return; }
    let cancelled = false;
    setGame(null);
    getGame(match.games[activeIdx].id)
      .then((res) => { if (!cancelled) setGame(res.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [match?.id, activeIdx]);

  /* Arrow keys */
  useEffect(() => {
    if (!match) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && activeIdx > 0) setActiveIdx((i) => i - 1);
      if (e.key === 'ArrowRight' && activeIdx < match.games.length - 1) setActiveIdx((i) => i + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [match, activeIdx]);

  /* game.team1 / game.team2 are the actual blue / red side for this specific game
     (sides may flip between games of the same series). Always pull team meta by the
     game's own team strings so the labels match the per-side stats. */
  const blueTeam = (game && (teams[game.team1] || fallbackMeta(game.team1))) || null;
  const redTeam  = (game && (teams[game.team2] || fallbackMeta(game.team2))) || null;

  /* Max damage for proportional bars */
  const maxDmg = useMemo(() => {
    if (!game) return 1;
    let m = 1;
    for (const p of game.performances) if (p.damage_to_champions > m) m = p.damage_to_champions;
    return m;
  }, [game]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeScoreboard}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(20, 16, 8, 0.55)',
          zIndex: 90,
          animation: 'drawerFadeIn 180ms ease-out',
        }}
      />

      {/* Sheet wrapper */}
      <div
        onClick={closeScoreboard}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 91,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '32px 24px',
          overflowY: 'auto',
          animation: 'drawerFadeIn 220ms ease-out',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 1240,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
          }}
        >
          {/* Top bar */}
          {match && (
            <TopBar
              match={match}
              activeIdx={activeIdx}
              onSelectIdx={setActiveIdx}
              onClose={closeScoreboard}
            />
          )}

          {/* Body */}
          {loading || !match || !game || !blueTeam || !redTeam ? (
            <div
              className="flex items-center justify-center"
              style={{ padding: 120 }}
            >
              <div className="spinner" />
            </div>
          ) : (
            <>
              <TeamBanners game={game} blueTeam={blueTeam} redTeam={redTeam} />

              <div style={{ padding: '0 20px 8px' }}>
                {ROLE_ORDER.map((role) => {
                  const blueRow = pickByRole(game.performances, game.team1, role);
                  const redRow = pickByRole(game.performances, game.team2, role);
                  return (
                    <LaneRow
                      key={role}
                      role={role}
                      blueRow={blueRow}
                      redRow={redRow}
                      blueWon={game.winner === 1}
                      redWon={game.winner === 2}
                      maxDmg={maxDmg}
                      onOpenPlayer={openPlayer}
                    />
                  );
                })}
              </div>

              {/* Footer */}
              <div
                className="flex items-center justify-between"
                style={{
                  padding: '14px 24px 18px',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--surface)',
                  fontSize: 11,
                  color: 'var(--text-dim)',
                }}
              >
                <span>← → switch games · Esc close</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>
                  match #{match.id} · g{activeIdx + 1}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function pickByRole(
  perfs: PlayerPerformance[],
  team: string,
  role: string,
): PlayerPerformance | null {
  return perfs.find((p) => p.team === team && p.role === role) ?? null;
}

/* ─── Top bar ─────────────────────────────────────────────────────────── */

function TopBar({
  match, activeIdx, onSelectIdx, onClose,
}: {
  match: MatchDetail;
  activeIdx: number;
  onSelectIdx: (i: number) => void;
  onClose: () => void;
}) {
  const activeGame = match.games[activeIdx];
  const duration = parseDurationMinutes(activeGame?.gamelength);

  return (
    <div
      className="flex items-center flex-wrap"
      style={{
        gap: 12,
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
      }}
    >
      <span
        className="eyebrow"
        style={{ color: 'var(--text-dim)' }}
      >
        Game scoreboard
      </span>
      <span style={{ color: 'var(--text-faint)' }}>·</span>
      <span
        className="font-semibold uppercase text-(--text-dim)"
        style={{ fontSize: 12, letterSpacing: '0.06em' }}
      >
        {match.tab || match.event.name} · BO{match.best_of} · Game {activeIdx + 1} of {match.games.length}
      </span>
      {match.patch && (
        <>
          <span style={{ color: 'var(--text-faint)' }}>·</span>
          <span
            className="text-(--text-dim) font-mono"
            style={{ fontSize: 12 }}
          >
            Patch {match.patch}
          </span>
        </>
      )}

      {match.games.length > 1 && (
        <div className="flex" style={{ gap: 4, marginLeft: 16 }}>
          {match.games.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelectIdx(i)}
              className="font-bold"
              style={{
                width: 28,
                height: 24,
                fontSize: 11,
                border: '1px solid ' + (i === activeIdx ? 'var(--accent-border)' : 'var(--border)'),
                background: i === activeIdx ? 'var(--accent-muted)' : 'var(--surface)',
                color: i === activeIdx ? 'var(--accent-2)' : 'var(--text-dim)',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      <span style={{ flex: 1 }} />

      <span
        className="text-(--text-dim) font-mono tabular-nums"
        style={{ fontSize: 12 }}
      >
        {duration > 0 ? `${duration}:00` : '—'}{' '}
        <span style={{ color: 'var(--text-faint)' }}>min</span>
      </span>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="flex items-center justify-center transition-colors"
        style={{
          width: 32,
          height: 32,
          border: 0,
          background: 'var(--surface-sub)',
          color: 'var(--text)',
          borderRadius: 8,
          fontSize: 18,
          cursor: 'pointer',
        }}
      >
        ×
      </button>
    </div>
  );
}

/* ─── Team banners ────────────────────────────────────────────────────── */

function TeamBanners({
  game, blueTeam, redTeam,
}: {
  game: GameDetail;
  blueTeam: TeamMeta;
  redTeam: TeamMeta;
}) {
  const blueWon = game.winner === 1;
  const redWon = game.winner === 2;
  const goldDiff = game.team1_gold - game.team2_gold;
  const duration = parseDurationMinutes(game.gamelength);

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'stretch',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <TeamSide
        side="blue"
        team={blueTeam}
        won={blueWon}
        objectives={{
          towers: game.team1_towers,
          inhibitors: 0,
          drakes: game.team1_dragons,
          heralds: game.team1_rift_heralds,
          grubs: 0,
          barons: game.team1_barons,
          atakhans: 0,
          gold: game.team1_gold,
        }}
      />

      {/* Center kill score */}
      <div
        className="flex flex-col items-center justify-center"
        style={{
          padding: '22px 28px',
          borderLeft: '1px solid var(--border)',
          borderRight: '1px solid var(--border)',
          minWidth: 220,
          background: 'var(--surface-sub)',
        }}
      >
        <div
          className="font-bold uppercase text-(--text-dim)"
          style={{ fontSize: 10, letterSpacing: '0.16em' }}
        >
          Team kills
        </div>
        <div
          className="font-display tabular-nums"
          style={{
            fontSize: 52,
            fontWeight: 700,
            color: 'var(--text-h)',
            letterSpacing: '-0.04em',
            lineHeight: 1,
            marginTop: 6,
          }}
        >
          <span style={{ color: blueWon ? 'var(--text-h)' : 'var(--text)' }}>
            {game.team1_kills}
          </span>
          <span style={{ color: 'var(--text-faint)', fontWeight: 400, padding: '0 12px' }}>–</span>
          <span style={{ color: redWon ? 'var(--text-h)' : 'var(--text)' }}>
            {game.team2_kills}
          </span>
        </div>
        <div
          className="flex items-center tabular-nums"
          style={{ marginTop: 10, fontSize: 12, color: 'var(--text-dim)', gap: 6 }}
        >
          <span
            className="font-semibold"
            style={{
              color: goldDiff > 0 ? 'var(--green)' : goldDiff < 0 ? 'var(--red)' : 'var(--text-dim)',
            }}
          >
            {goldDiff > 0 ? '+' : ''}
            {(goldDiff / 1000).toFixed(1)}k gold
          </span>
          {duration > 0 && (
            <>
              <span style={{ color: 'var(--text-faint)' }}>·</span>
              <span>{duration}m</span>
            </>
          )}
        </div>
      </div>

      <TeamSide
        side="red"
        team={redTeam}
        won={redWon}
        objectives={{
          towers: game.team2_towers,
          inhibitors: 0,
          drakes: game.team2_dragons,
          heralds: game.team2_rift_heralds,
          grubs: 0,
          barons: game.team2_barons,
          atakhans: 0,
          gold: game.team2_gold,
        }}
      />
    </div>
  );
}

interface Objectives {
  towers: number;
  inhibitors: number;
  drakes: number;
  heralds: number;
  grubs: number;
  barons: number;
  atakhans: number;
  gold: number;
}

function TeamSide({
  side, team, won, objectives,
}: {
  side: 'blue' | 'red';
  team: TeamMeta;
  won: boolean;
  objectives: Objectives;
}) {
  const blueSide = side === 'blue';
  const accent = blueSide ? 'var(--blue)' : 'var(--red)';

  return (
    <div
      className="flex flex-col"
      style={{
        padding: '20px 24px 18px',
        gap: 14,
        background: 'var(--surface)',
        borderTop: `2px solid ${accent}`,
      }}
    >
      <div
        className="flex items-center"
        style={{
          gap: 14,
          flexDirection: blueSide ? 'row' : 'row-reverse',
          textAlign: blueSide ? 'left' : 'right',
        }}
      >
        <TeamMark team={team} size={44} />
        <div className="flex-1 min-w-0">
          <div
            className="flex items-center"
            style={{
              gap: 8,
              flexDirection: blueSide ? 'row' : 'row-reverse',
            }}
          >
            <span
              className="font-display truncate"
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: 'var(--text-h)',
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
              }}
            >
              {team.name}
            </span>
            {won && (
              <span
                className="font-bold uppercase"
                style={{
                  fontSize: 9.5,
                  color: 'var(--green)',
                  letterSpacing: '0.14em',
                  padding: '3px 7px',
                  background: 'var(--green-muted)',
                  borderRadius: 999,
                }}
              >
                WIN
              </span>
            )}
          </div>
          <div
            className="flex items-center"
            style={{
              gap: 8,
              marginTop: 3,
              flexDirection: blueSide ? 'row' : 'row-reverse',
            }}
          >
            <span
              className="font-bold uppercase"
              style={{
                fontSize: 10,
                color: accent,
                letterSpacing: '0.14em',
              }}
            >
              {blueSide ? 'Blue side' : 'Red side'}
            </span>
            <span style={{ color: 'var(--text-faint)' }}>·</span>
            <span
              className="text-(--text-dim) tabular-nums"
              style={{ fontSize: 11 }}
            >
              {team.short}
            </span>
          </div>
        </div>
      </div>

      {/* Objectives strip */}
      <div
        className="flex flex-wrap"
        style={{
          gap: 6,
          justifyContent: blueSide ? 'flex-start' : 'flex-end',
        }}
      >
        <ObjChip icon="tower" value={objectives.towers} label="Towers" />
        <ObjChip icon="inhibitor" value={objectives.inhibitors} label="Inhibs" />
        <ObjChip icon="drake" value={objectives.drakes} label="Drakes" />
        <ObjChip icon="herald" value={objectives.heralds} label="Herald" />
        <ObjChip icon="grub" value={objectives.grubs} label="Grubs" />
        <ObjChip icon="baron" value={objectives.barons} label="Baron" />
        <ObjChip icon="atakhan" value={objectives.atakhans} label="Atakhan" />
        <ObjChip icon="gold" value={`${(objectives.gold / 1000).toFixed(1)}k`} label="Gold" />
      </div>
    </div>
  );
}

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
      {team.short.slice(0, 3)}
    </div>
  );
}

/* ─── Objective chip + tiny icons ─────────────────────────────────────── */

type ObjKind = 'tower' | 'inhibitor' | 'drake' | 'herald' | 'grub' | 'baron' | 'atakhan' | 'gold' | 'cs';

/* Real Riot/Wiki assets — same set the in-game scoreboard used before. */
const CD_UX = 'https://raw.communitydragon.org/latest/game/assets/ux';
const OBJ_ICON_URL: Partial<Record<ObjKind, string>> = {
  tower:     `${CD_UX}/minimap/icons/tower.png`,
  inhibitor: `${CD_UX}/minimap/icons/inhibitor.png`,
  drake:     `${CD_UX}/scoreboard/_dragon.png`,
  herald:    `${CD_UX}/scoreboard/_riftherald.png`,
  baron:     `${CD_UX}/scoreboard/_baronnashor.png`,
  gold:      'https://wiki.leagueoflegends.com/en-us/images/Gold_colored_icon.svg?103a5',
  cs:        `${CD_UX}/deathrecap/autoattack.png`,
  /* grub / atakhan — no first-party icon available; fall back to glyph */
};

function ObjChip({
  icon, value, label,
}: {
  icon: ObjKind;
  value: number | string;
  label: string;
}) {
  const off = value === 0 || value === '0.0k' || value === '0';
  return (
    <div
      title={label}
      className="inline-flex items-center tabular-nums font-semibold"
      style={{
        gap: 5,
        padding: '5px 9px 5px 7px',
        background: 'var(--surface-sub)',
        border: '1px solid var(--border)',
        borderRadius: 999,
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        color: off ? 'var(--text-faint)' : 'var(--text-h)',
      }}
    >
      <ObjIcon kind={icon} off={off} />
      <span>{value}</span>
    </div>
  );
}

function ObjIcon({ kind, off, size = 14 }: { kind: ObjKind; off?: boolean; size?: number }) {
  const url = OBJ_ICON_URL[kind];
  if (url) {
    /* `cs` is a near-black autoattack glyph; invert it for the warm light palette
       so it reads as a soft mid-grey instead of stark black. */
    const cs = kind === 'cs';
    return (
      <img
        src={url}
        alt={kind}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          flexShrink: 0,
          opacity: off ? 0.35 : cs ? 0.6 : 1,
          filter: cs ? 'brightness(0) opacity(0.6)' : undefined,
          display: 'block',
        }}
      />
    );
  }

  /* SVG fallback (voidgrubs, atakhan). */
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      style={{ flexShrink: 0 }}
      fill={off ? 'var(--text-faint)' : 'var(--text-h)'}
    >
      {kind === 'grub' && (
        <>
          <ellipse cx={6} cy={9} rx={3} ry={4} />
          <ellipse cx={11} cy={9} rx={3} ry={4} />
        </>
      )}
      {kind === 'atakhan' && <path d="M3 13 L8 2 L13 13 L8 10 Z" />}
    </svg>
  );
}

/* ─── Lane row ─────────────────────────────────────────────────────────── */

function LaneRow({
  role, blueRow, redRow, blueWon, redWon, maxDmg, onOpenPlayer,
}: {
  role: string;
  blueRow: PlayerPerformance | null;
  redRow: PlayerPerformance | null;
  blueWon: boolean;
  redWon: boolean;
  maxDmg: number;
  onOpenPlayer: (name: string) => void;
}) {
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: 'minmax(0, 1fr) 72px minmax(0, 1fr)',
        alignItems: 'stretch',
        borderBottom: '1px solid var(--border)',
        padding: '14px 0',
      }}
    >
      <PlayerHalf side="blue" row={blueRow} won={blueWon} maxDmg={maxDmg} onOpenPlayer={onOpenPlayer} />
      <RoleDivider role={role} />
      <PlayerHalf side="red" row={redRow} won={redWon} maxDmg={maxDmg} onOpenPlayer={onOpenPlayer} />
    </div>
  );
}

function RoleDivider({ role }: { role: string }) {
  const color = ROLE_COLOR[role] || 'var(--text-dim)';
  const icon = ROLE_ICON[role];
  return (
    <div className="flex items-center justify-center">
      <div
        className="flex items-center justify-center"
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          background: 'var(--surface)',
          border: `1.5px solid ${color}`,
        }}
        title={role}
      >
        {icon ? (
          <span
            aria-label={role}
            style={{
              display: 'block',
              width: 18,
              height: 18,
              backgroundColor: color,
              WebkitMaskImage: `url(${icon})`,
              maskImage: `url(${icon})`,
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskPosition: 'center',
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
            }}
          />
        ) : (
          <span
            className="font-bold"
            style={{ fontSize: 9.5, color, letterSpacing: '0.08em' }}
          >
            {ROLE_SHORT[role] || role.slice(0, 3).toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}

function PlayerHalf({
  side, row, won, maxDmg, onOpenPlayer,
}: {
  side: 'blue' | 'red';
  row: PlayerPerformance | null;
  won: boolean;
  maxDmg: number;
  onOpenPlayer: (name: string) => void;
}) {
  const blue = side === 'blue';
  if (!row) return <div />;
  const accent = blue ? 'var(--blue)' : 'var(--red)';

  return (
    <div
      className="flex items-center"
      style={{
        gap: 12,
        flexDirection: blue ? 'row' : 'row-reverse',
        /* Inner side (towards the role divider) gets generous padding so the
           trinket can never creep under the role icon, regardless of viewport. */
        padding: blue ? '0 16px 0 12px' : '0 12px 0 16px',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <ChampBlock champion={row.champion} won={won} accent={accent} blue={blue} />
      <NameBlock
        playerName={row.name}
        championName={row.champion?.name ?? ''}
        blue={blue}
        onClick={() => onOpenPlayer(row.name)}
      />
      <KDABlock kills={row.kills} deaths={row.deaths} assists={row.assists} blue={blue} />
      <StatBlock
        cs={row.cs}
        gold={row.gold}
        dmg={row.damage_to_champions}
        maxDmg={maxDmg}
        accent={accent}
        blue={blue}
      />
      <Loadout
        spellD={row.summoner_spell_d}
        spellF={row.summoner_spell_f}
        keystone={row.keystone_rune}
        runes={row.runes}
        blue={blue}
      />
      <Inventory items={row.items} trinket={row.trinket} blue={blue} />
    </div>
  );
}

/* ─── Sub-blocks ──────────────────────────────────────────────────────── */

function ChampBlock({
  champion, won, accent, blue,
}: {
  champion: Champion | null;
  won: boolean;
  accent: string;
  blue: boolean;
}) {
  /* Default level "18" since API doesn't have it. */
  const level = 18;
  return (
    <div className="relative shrink-0">
      {champion?.icon_url ? (
        <ChampionIcon
          src={champion.icon_url}
          alt={champion.name}
          size={52}
          style={{ opacity: won ? 1 : 0.72 }}
        />
      ) : (
        <div style={{ width: 52, height: 52, borderRadius: 10, background: 'var(--surface-sub)' }} />
      )}
      <span
        className="absolute font-bold tabular-nums"
        style={{
          bottom: -4,
          [blue ? 'right' : 'left']: -4,
          background: 'var(--text-h)',
          color: 'var(--bg)',
          fontFamily: 'var(--font-sans)',
          fontSize: 10,
          padding: '1.5px 5px',
          borderRadius: 4,
          border: '1.5px solid var(--bg)',
        }}
      >
        {level}
      </span>
    </div>
  );
}

function NameBlock({
  playerName, championName, blue, onClick,
}: {
  playerName: string;
  championName: string;
  blue: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 76,
        minWidth: 76,
        maxWidth: 76,
        overflow: 'hidden',
        textAlign: blue ? 'left' : 'right',
        cursor: 'pointer',
        background: 'transparent',
        border: 0,
        padding: 0,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--text-h)',
          letterSpacing: '-0.005em',
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {playerName}
      </div>
      <div
        className="text-(--text-dim) tabular-nums"
        style={{
          fontSize: 11,
          marginTop: 3,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {championName || '—'}
      </div>
    </button>
  );
}

function KDABlock({
  kills, deaths, assists, blue,
}: {
  kills: number;
  deaths: number;
  assists: number;
  blue: boolean;
}) {
  const ratio = ((kills + assists) / Math.max(1, deaths)).toFixed(2);
  const r = Number(ratio);
  const ratioColor = r >= 4 ? 'var(--green)' : r < 1.5 ? 'var(--red)' : 'var(--text-dim)';

  return (
    <div
      className="flex flex-col"
      style={{
        width: 92,
        minWidth: 92,
        maxWidth: 92,
        alignItems: blue ? 'flex-start' : 'flex-end',
      }}
    >
      <div
        className="flex items-baseline font-bold tabular-nums"
        style={{
          gap: 4,
          fontFamily: 'var(--font-sans)',
          fontSize: 16,
          color: 'var(--text-h)',
          lineHeight: 1,
          letterSpacing: '-0.01em',
        }}
      >
        <span>{kills}</span>
        <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>/</span>
        <span style={{ color: 'var(--red)', fontWeight: 700 }}>{deaths}</span>
        <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>/</span>
        <span>{assists}</span>
      </div>
      <div
        className="tabular-nums font-semibold"
        style={{
          marginTop: 4,
          fontSize: 10.5,
          color: ratioColor,
          letterSpacing: '0.04em',
        }}
      >
        {ratio} KDA
      </div>
    </div>
  );
}

function StatBlock({
  cs, gold, dmg, maxDmg, accent, blue,
}: {
  cs: number;
  gold: number;
  dmg: number;
  maxDmg: number;
  accent: string;
  blue: boolean;
}) {
  const dmgPct = Math.max(0.04, dmg / Math.max(1, maxDmg));
  /* Vision score isn't in the API yet — default to 0 */
  const vis = 0;

  return (
    <div
      className="flex flex-col"
      style={{
        minWidth: 132,
        gap: 4,
        alignItems: blue ? 'flex-start' : 'flex-end',
      }}
    >
      <div
        className="flex items-center tabular-nums font-semibold"
        style={{
          gap: 10,
          fontSize: 12,
          color: 'var(--text-h)',
          flexDirection: blue ? 'row' : 'row-reverse',
        }}
      >
        <span className="inline-flex items-center" style={{ gap: 4 }}>
          <ObjIcon kind="cs" size={12} />
          {cs}
        </span>
        <span style={{ color: 'var(--text-faint)' }}>·</span>
        <span className="inline-flex items-center" style={{ gap: 4 }}>
          <ObjIcon kind="gold" size={12} />
          {(gold / 1000).toFixed(1)}k
        </span>
      </div>

      {/* Damage bar */}
      <div
        className="flex"
        style={{
          width: 116,
          height: 5,
          borderRadius: 999,
          background: 'var(--surface-sub)',
          overflow: 'hidden',
          alignSelf: blue ? 'flex-start' : 'flex-end',
          flexDirection: blue ? 'row' : 'row-reverse',
        }}
      >
        <div
          style={{
            width: `${dmgPct * 100}%`,
            height: '100%',
            background: accent,
            opacity: 0.85,
          }}
        />
      </div>

      <div
        className="flex items-center tabular-nums"
        style={{
          fontSize: 10,
          color: 'var(--text-dim)',
          gap: 6,
          flexDirection: blue ? 'row' : 'row-reverse',
        }}
      >
        <span>
          <span style={{ color: 'var(--text-faint)' }}>DMG</span> {(dmg / 1000).toFixed(1)}k
        </span>
        <span style={{ color: 'var(--text-faint)' }}>·</span>
        <span>
          <span style={{ color: 'var(--text-faint)' }}>VIS</span> {vis}
        </span>
      </div>
    </div>
  );
}

function Loadout({
  spellD, spellF, keystone, runes, blue,
}: {
  spellD: SummonerSpell | null;
  spellF: SummonerSpell | null;
  keystone: Rune | null;
  runes: Rune[];
  blue: boolean;
}) {
  /* Secondary rune path icon = the path of any rune in `runes` whose path differs from the keystone's. */
  const secondary = keystone
    ? runes.find((r) => r.path_riot_id !== keystone.path_riot_id) ?? null
    : runes[0] ?? null;

  return (
    <div
      className="flex items-center shrink-0"
      style={{ gap: 4, flexDirection: blue ? 'row' : 'row-reverse' }}
    >
      <div className="grid" style={{ gridTemplateRows: 'auto auto', gap: 2 }}>
        <SpellSlot spell={spellD} />
        <SpellSlot spell={spellF} />
      </div>
      <div className="grid" style={{ gridTemplateRows: 'auto auto', gap: 2 }}>
        <RuneSlot rune={keystone} size={22} kind="keystone" />
        <RuneSlot rune={secondary} size={18} kind="secondary" />
      </div>
    </div>
  );
}

function SpellSlot({ spell }: { spell: SummonerSpell | null }) {
  if (!spell?.icon_url) {
    return (
      <div
        style={{
          width: 18, height: 18, borderRadius: 3,
          background: 'var(--surface-sub)', opacity: 0.4,
        }}
      />
    );
  }
  return (
    <img
      src={spell.icon_url}
      alt={spell.name}
      title={spell.name}
      style={{ width: 18, height: 18, borderRadius: 3, display: 'block' }}
    />
  );
}

function RuneSlot({
  rune, size, kind,
}: {
  rune: Rune | null;
  size: number;
  kind: 'keystone' | 'secondary';
}) {
  if (!rune) {
    return (
      <div
        style={{
          width: size, height: size, borderRadius: kind === 'keystone' ? 999 : 3,
          background: 'var(--surface-sub)', opacity: 0.4,
        }}
      />
    );
  }
  const src = kind === 'keystone' ? ddragonRune(rune.icon) : ddragonRune(rune.path_icon);
  return (
    <img
      src={src}
      alt={rune.name}
      title={rune.name}
      style={{
        width: size, height: size, display: 'block',
        marginLeft: kind === 'secondary' ? 2 : 0,
      }}
    />
  );
}

function Inventory({
  items, trinket, blue,
}: {
  items: Item[];
  trinket: Item | null;
  blue: boolean;
}) {
  return (
    <div
      className="flex items-center shrink-0"
      style={{ gap: 5, flexDirection: blue ? 'row' : 'row-reverse' }}
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(3, 22px)',
          gridAutoRows: '22px',
          gap: 2,
        }}
      >
        {Array.from({ length: 6 }, (_, i) => {
          const it = items[i];
          if (!it?.icon_url) {
            return (
              <div
                key={i}
                style={{
                  width: 22, height: 22, borderRadius: 3,
                  background: 'var(--surface-sub)', opacity: 0.4,
                }}
              />
            );
          }
          return (
            <img
              key={i}
              src={it.icon_url}
              alt={it.name}
              title={it.name}
              style={{
                width: 22, height: 22, borderRadius: 3,
                objectFit: 'cover', display: 'block',
              }}
            />
          );
        })}
      </div>
      {trinket?.icon_url ? (
        <img
          src={trinket.icon_url}
          alt={trinket.name}
          title={trinket.name}
          style={{
            width: 22, height: 22, borderRadius: 999,
            objectFit: 'cover', display: 'block',
            boxShadow: 'inset 0 0 0 1px var(--border-strong)',
          }}
        />
      ) : (
        <div
          style={{
            width: 22, height: 22, borderRadius: 999,
            background: 'var(--surface-sub)', opacity: 0.4,
          }}
        />
      )}
    </div>
  );
}
