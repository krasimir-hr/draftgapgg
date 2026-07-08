import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  GameDetail, PlayerPerformance, PerformanceRatingInfo, Champion, Item, Rune, SummonerSpell,
} from '../../types/models';
import { ROLE_ICON, ROLE_ABBR } from '../league/shared';
import { ChampionIcon } from '../ChampionIcon';

export interface TeamMeta {
  name: string;
  short: string;
  logo: string | null;
  color: string | null;
}

const ROLE_ORDER = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'];
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

export function fallbackMeta(name: string): TeamMeta {
  return { name, short: name.toUpperCase().slice(0, 4), logo: null, color: null };
}

const prColor = (pr: number) =>
  pr >= 65 ? 'var(--green)' : pr <= 40 ? 'var(--red)' : 'var(--text-h)';


/* Inline scoreboard (team banners + per-role player rows w/ rating) */

export default function Scoreboard({
  game, teams, onOpenPlayer,
}: {
  game: GameDetail;
  teams: Record<string, TeamMeta>;
  onOpenPlayer: (name: string) => void;
}) {
  /* game.team1 / game.team2 are the blue / red side for THIS game. */
  const blueTeam = teams[game.team1] || fallbackMeta(game.team1);
  const redTeam = teams[game.team2] || fallbackMeta(game.team2);

  const maxDmg = useMemo(() => {
    let m = 1;
    for (const p of game.performances) if (p.damage_to_champions > m) m = p.damage_to_champions;
    return m;
  }, [game]);

  return (
    <div className="card overflow-hidden">
      <TeamBanners game={game} blueTeam={blueTeam} redTeam={redTeam} />
      <TeamBlock
        side="blue"
        team={blueTeam}
        won={game.winner === 1}
        teamName={game.team1}
        perfs={game.performances}
        maxDmg={maxDmg}
        onOpenPlayer={onOpenPlayer}
      />
      <TeamBlock
        side="red"
        team={redTeam}
        won={game.winner === 2}
        teamName={game.team2}
        perfs={game.performances}
        maxDmg={maxDmg}
        onOpenPlayer={onOpenPlayer}
      />
    </div>
  );
}

/* One team's five players, stacked as full-width rows under a side header. The
   two teams (blue then red) sit one under another rather than mirrored across
   the width, so each player row has the whole column to breathe. */
function TeamBlock({
  side, team, won, teamName, perfs, maxDmg, onOpenPlayer,
}: {
  side: 'blue' | 'red';
  team: TeamMeta;
  won: boolean;
  teamName: string;
  perfs: PlayerPerformance[];
  maxDmg: number;
  onOpenPlayer: (name: string) => void;
}) {
  const blue = side === 'blue';
  const accent = blue ? 'var(--blue)' : 'var(--red)';
  const rows = ROLE_ORDER.map((role) => ({ role, row: pickByRole(perfs, teamName, role) }));

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div
        className="flex items-center"
        style={{ gap: 10, padding: '11px 20px', background: 'var(--surface-sub)', borderBottom: '1px solid var(--border)' }}
      >
        <TeamMark team={team} size={22} />
        <span className="font-display truncate" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-h)', letterSpacing: '-0.01em' }}>
          {team.name}
        </span>
        <span className="font-bold uppercase" style={{ fontSize: 9.5, color: accent, letterSpacing: '0.14em' }}>
          {blue ? 'Blue side' : 'Red side'}
        </span>
        {won && (
          <span className="font-bold uppercase" style={{ fontSize: 9, color: 'var(--green)', letterSpacing: '0.14em', padding: '3px 7px', background: 'var(--green-muted)', borderRadius: 999 }}>
            WIN
          </span>
        )}
      </div>

      <div style={{ padding: '0 16px' }}>
        {rows.map(({ role, row }, i) =>
          row ? (
            <PlayerRow
              key={role}
              role={role}
              row={row}
              won={won}
              accent={accent}
              maxDmg={maxDmg}
              onOpenPlayer={onOpenPlayer}
              isLast={i === rows.length - 1}
            />
          ) : (
            <div key={role} style={{ height: 60, borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--border)' }} />
          ),
        )}
      </div>
    </div>
  );
}

function pickByRole(perfs: PlayerPerformance[], team: string, role: string): PlayerPerformance | null {
  return perfs.find((p) => p.team === team && p.role === role) ?? null;
}

/* Team banners */

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
        borderBottom: '1px solid var(--border)',
      }}
    >
      <TeamSide
        side="blue"
        team={blueTeam}
        won={blueWon}
        bans={game.team1_bans}
        objectives={{ towers: game.team1_towers, drakes: game.team1_dragons, heralds: game.team1_rift_heralds, barons: game.team1_barons, gold: game.team1_gold }}
      />

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
        <div className="font-bold uppercase text-(--text-dim)" style={{ fontSize: 10, letterSpacing: '0.16em' }}>
          Team kills
        </div>
        <div
          className="font-display tabular-nums"
          style={{ fontSize: 'clamp(34px, 9vw, 52px)', fontWeight: 700, color: 'var(--text-h)', letterSpacing: '-0.04em', lineHeight: 1, marginTop: 6 }}
        >
          <span style={{ color: blueWon ? 'var(--text-h)' : 'var(--text)' }}>{game.team1_kills}</span>
          <span style={{ color: 'var(--text-faint)', fontWeight: 400, padding: '0 12px' }}>–</span>
          <span style={{ color: redWon ? 'var(--text-h)' : 'var(--text)' }}>{game.team2_kills}</span>
        </div>
        <div className="flex items-center tabular-nums" style={{ marginTop: 10, fontSize: 12, color: 'var(--text-dim)', gap: 6 }}>
          <span className="font-semibold" style={{ color: goldDiff > 0 ? 'var(--green)' : goldDiff < 0 ? 'var(--red)' : 'var(--text-dim)' }}>
            {goldDiff > 0 ? '+' : ''}{(goldDiff / 1000).toFixed(1)}k gold
          </span>
          {duration > 0 && (<><span style={{ color: 'var(--text-faint)' }}>·</span><span>{duration}m</span></>)}
        </div>
      </div>

      <TeamSide
        side="red"
        team={redTeam}
        won={redWon}
        bans={game.team2_bans}
        objectives={{ towers: game.team2_towers, drakes: game.team2_dragons, heralds: game.team2_rift_heralds, barons: game.team2_barons, gold: game.team2_gold }}
      />
    </div>
  );
}

interface Objectives { towers: number; drakes: number; heralds: number; barons: number; gold: number; }

function TeamSide({
  side, team, won, bans, objectives,
}: {
  side: 'blue' | 'red';
  team: TeamMeta;
  won: boolean;
  bans: Champion[];
  objectives: Objectives;
}) {
  const blueSide = side === 'blue';
  const accent = blueSide ? 'var(--blue)' : 'var(--red)';

  return (
    <div
      className="flex flex-col"
      style={{ padding: '20px 24px 18px', gap: 14, background: 'var(--surface)' }}
    >
      <div className="flex items-center" style={{ gap: 14, flexDirection: blueSide ? 'row' : 'row-reverse', textAlign: blueSide ? 'left' : 'right' }}>
        <TeamMark team={team} size={44} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center" style={{ gap: 8, flexDirection: blueSide ? 'row' : 'row-reverse' }}>
            <span className="font-display truncate" style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-h)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {team.name}
            </span>
            {won && (
              <span className="font-bold uppercase" style={{ fontSize: 9.5, color: 'var(--green)', letterSpacing: '0.14em', padding: '3px 7px', background: 'var(--green-muted)', borderRadius: 999 }}>
                WIN
              </span>
            )}
          </div>
          <div className="flex items-center" style={{ gap: 8, marginTop: 3, flexDirection: blueSide ? 'row' : 'row-reverse' }}>
            <span className="font-bold uppercase" style={{ fontSize: 10, color: accent, letterSpacing: '0.14em' }}>
              {blueSide ? 'Blue side' : 'Red side'}
            </span>
            <span style={{ color: 'var(--text-faint)' }}>·</span>
            <span className="text-(--text-dim) tabular-nums" style={{ fontSize: 11 }}>{team.short}</span>
          </div>
        </div>
      </div>

      {bans.length > 0 && (
        <div className="flex flex-wrap" style={{ gap: 4, justifyContent: blueSide ? 'flex-start' : 'flex-end' }}>
          {bans.map((c) => (
            <div key={c.id} className="relative" title={c.name}>
              <ChampionIcon src={c.icon_url} alt={c.name} size={28} style={{ opacity: 0.45, filter: 'saturate(0.3)' }} />
              <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: 'none' }}>
                <div style={{ width: '85%', height: 2, background: 'var(--red)', transform: 'rotate(-30deg)', borderRadius: 2, boxShadow: '0 0 0 1.5px var(--surface)' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap" style={{ gap: 6, justifyContent: blueSide ? 'flex-start' : 'flex-end' }}>
        <ObjChip icon="tower" value={objectives.towers} label="Towers" />
        <ObjChip icon="drake" value={objectives.drakes} label="Drakes" />
        <ObjChip icon="herald" value={objectives.heralds} label="Herald" />
        <ObjChip icon="baron" value={objectives.barons} label="Baron" />
        <ObjChip icon="gold" value={`${(objectives.gold / 1000).toFixed(1)}k`} label="Gold" />
      </div>
    </div>
  );
}

export function TeamMark({ team, size }: { team: TeamMeta; size: number }) {
  if (team.logo) {
    return (
      <div className="shrink-0 flex items-center justify-center overflow-hidden" style={{ width: size, height: size }}>
        <img src={team.logo} alt={team.short} className="max-w-full max-h-full object-contain" />
      </div>
    );
  }
  return (
    <div
      className="shrink-0 flex items-center justify-center text-white"
      style={{ width: size, height: size, borderRadius: Math.max(4, size * 0.22), background: team.color || 'var(--accent)', fontWeight: 700, fontSize: size * 0.38, fontFamily: 'var(--font-sans)', letterSpacing: '-0.04em' }}
    >
      {team.short.slice(0, 3)}
    </div>
  );
}

/* Objective chip + icons */

type ObjKind = 'tower' | 'drake' | 'herald' | 'baron' | 'gold' | 'cs';

const CD_UX = 'https://raw.communitydragon.org/latest/game/assets/ux';
const OBJ_ICON_URL: Partial<Record<ObjKind, string>> = {
  tower: `${CD_UX}/minimap/icons/tower.png`,
  drake: `${CD_UX}/scoreboard/_dragon.png`,
  herald: `${CD_UX}/scoreboard/_riftherald.png`,
  baron: `${CD_UX}/scoreboard/_baronnashor.png`,
  gold: 'https://wiki.leagueoflegends.com/en-us/images/Gold_colored_icon.svg?103a5',
  cs: `${CD_UX}/deathrecap/autoattack.png`,
};

function ObjChip({ icon, value, label }: { icon: ObjKind; value: number | string; label: string }) {
  const off = value === 0 || value === '0.0k' || value === '0';
  return (
    <div
      title={label}
      className="inline-flex items-center tabular-nums font-semibold"
      style={{ gap: 5, padding: '5px 9px 5px 7px', background: 'var(--surface-sub)', border: '1px solid var(--border)', borderRadius: 999, fontFamily: 'var(--font-sans)', fontSize: 12, color: off ? 'var(--text-faint)' : 'var(--text-h)' }}
    >
      <ObjIcon kind={icon} off={off} />
      <span>{value}</span>
    </div>
  );
}

function ObjIcon({ kind, off, size = 14 }: { kind: ObjKind; off?: boolean; size?: number }) {
  const url = OBJ_ICON_URL[kind];
  const cs = kind === 'cs';
  if (url) {
    return (
      <img
        src={url}
        alt={kind}
        style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0, opacity: off ? 0.35 : cs ? 0.6 : 1, filter: cs ? 'brightness(0) opacity(0.6)' : undefined, display: 'block' }}
      />
    );
  }
  return null;
}

/* Player row — one player across the full column width, left-aligned so blue
   and red rows read as one consistent table (see TeamBlock). */

function PlayerRow({
  role, row, won, accent, maxDmg, onOpenPlayer, isLast,
}: {
  role: string;
  row: PlayerPerformance;
  won: boolean;
  accent: string;
  maxDmg: number;
  onOpenPlayer: (name: string) => void;
  isLast: boolean;
}) {
  return (
    <div
      className="grid items-center"
      style={{
        // The mid-row PR breakdown (KeyMetrics) is the flexible track, so the
        // leftover width is filled with real content rather than blank space.
        gridTemplateColumns: '28px 44px 120px 44px 84px 116px minmax(0, 1fr) auto auto',
        alignItems: 'center',
        gap: 16,
        padding: '11px 4px',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
      }}
    >
      <RoleMark role={role} />
      <ChampBlock champion={row.champion} won={won} />
      <NameBlock playerName={row.name} championName={row.champion?.name ?? ''} blue fluid onClick={() => onOpenPlayer(row.name)} />
      <RatingBadge rating={row.rating} role={row.role} blue />
      <KDABlock kills={row.kills} deaths={row.deaths} assists={row.assists} blue />
      <StatBlock cs={row.cs} gold={row.gold} dmg={row.damage_to_champions} vision={row.vision_score} maxDmg={maxDmg} accent={accent} blue fluid />
      <KeyMetrics rating={row.rating} />
      <Loadout spellD={row.summoner_spell_d} spellF={row.summoner_spell_f} keystone={row.keystone_rune} runes={row.runes} blue />
      <Inventory items={row.items} trinket={row.trinket} blue />
    </div>
  );
}

function RoleMark({ role }: { role: string }) {
  const icon = ROLE_ICON[role];
  const color = 'var(--text-faint)';
  return (
    <div className="flex items-center justify-center" title={role}>
      {icon ? (
        <span
          aria-label={role}
          style={{ display: 'block', width: 16, height: 16, backgroundColor: color, WebkitMaskImage: `url(${icon})`, maskImage: `url(${icon})`, WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center', WebkitMaskSize: 'contain', maskSize: 'contain' }}
        />
      ) : (
        <span className="font-bold" style={{ fontSize: 9, color, letterSpacing: '0.08em' }}>
          {ROLE_SHORT[role] || role.slice(0, 3).toUpperCase()}
        </span>
      )}
    </div>
  );
}

/* Sub-blocks */

const METRIC_LABELS: Record<string, string> = {
  kda: 'KDA',
  kp: 'Kill participation',
  dmg_share: 'Damage share',
  cs_min: 'CS / min',
  gold_eff: 'Gold efficiency',
  survive: 'Survivability',
  vision_min: 'Vision',
  objective: 'Objectives',
  lane_diff15: 'Lane @15',
  dmg_mitig: 'Damage mitigated',
  dpm: 'Damage / min',
};

// Compact labels for the inline per-row breakdown (hover shows full names).
const METRIC_SHORT: Record<string, string> = {
  kda: 'KDA',
  kp: 'KP',
  dmg_share: 'DMG%',
  cs_min: 'CS/M',
  gold_eff: 'GOLD',
  survive: 'SURV',
  vision_min: 'VIS',
  objective: 'OBJ',
  lane_diff15: 'LANE',
  dmg_mitig: 'MIT',
  dpm: 'DPM',
};

/* Inline PR breakdown: the role's primary metrics (the same ★ key stats the
   hover card highlights) as mini score bars, filling the row's mid-width. */
function KeyMetrics({ rating }: { rating: PerformanceRatingInfo | null }) {
  const top = (rating?.metrics ?? [])
    .filter((m) => m.weight >= 0.15)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);
  if (top.length === 0) return <div />;

  return (
    <div className="flex items-center" style={{ gap: 16, minWidth: 0 }}>
      {top.map((m) => (
        <div key={m.key} className="flex flex-col" style={{ gap: 4, flex: '1 1 0', minWidth: 0 }}>
          <div className="flex items-center justify-between" style={{ gap: 6 }}>
            <span className="font-bold uppercase truncate" style={{ fontSize: 8.5, letterSpacing: '0.07em', color: 'var(--text-faint)' }}>
              {METRIC_SHORT[m.key] ?? m.key}
            </span>
            <span className="tabular-nums font-semibold" style={{ fontSize: 10.5, color: prColor(m.score) }}>
              {m.score.toFixed(0)}
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 999, background: 'var(--surface-sub)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(2, Math.min(100, m.score))}%`, height: '100%', background: prColor(m.score) }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RatingBadge({ rating, role, blue }: { rating: PlayerPerformance['rating']; role: string; blue: boolean }) {
  const pr = rating?.pr;
  const has = pr !== undefined && pr !== null;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const el = ref.current;
    if (!el || !rating) return;
    const r = el.getBoundingClientRect();
    const half = 160;
    const left = Math.min(window.innerWidth - half - 8, Math.max(half + 8, r.left + r.width / 2));
    setPos({ top: r.bottom + 8, left });
  };
  const hide = () => setPos(null);

  return (
    <div
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={hide}
      className="flex flex-col items-center shrink-0"
      style={{ width: 42, minWidth: 42, [blue ? 'marginRight' : 'marginLeft']: 2, cursor: has ? 'help' : 'default' } as React.CSSProperties}
    >
      <div
        className="flex items-center justify-center font-bold tabular-nums"
        style={{
          width: 36, height: 28, borderRadius: 7,
          background: has ? 'var(--surface-sub)' : 'transparent',
          border: `1px solid ${rating?.is_mvp ? 'var(--accent-border)' : 'var(--border)'}`,
          color: has ? prColor(pr!) : 'var(--text-faint)',
          fontSize: 13.5, lineHeight: 1,
        }}
      >
        {has ? pr!.toFixed(0) : '—'}
      </div>
      <span
        className="font-bold uppercase"
        style={{ fontSize: 8, letterSpacing: '0.1em', marginTop: 3, color: rating?.is_mvp ? 'var(--accent-2)' : 'var(--text-faint)' }}
      >
        {rating?.is_mvp ? 'MVP' : 'PR'}
      </span>
      {pos && rating && <RatingBreakdown rating={rating} role={role} pos={pos} />}
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  Top: 'top laners', Jungle: 'junglers', Mid: 'mid laners', Bot: 'bot laners', Support: 'supports',
};

function RatingBreakdown({ rating, role, pos }: { rating: PerformanceRatingInfo; role: string; pos: { top: number; left: number } }) {
  const metrics = rating.metrics ?? [];
  /* Drivers: weight×(score−50) lifts (>0) or drags (<0) the rating. */
  const withImpact = metrics.map((m) => ({
    ...m,
    label: METRIC_LABELS[m.key] ?? m.key,
    lift: m.weight * (m.score - 50),
  }));
  const lifted = [...withImpact].filter((m) => m.lift > 0).sort((a, b) => b.lift - a.lift)[0];
  const dragged = [...withImpact].filter((m) => m.lift < 0).sort((a, b) => a.lift - b.lift)[0];
  const base = rating.pr / 10;

  return createPortal(
    <div
      style={{
        position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-50%)',
        width: 320, zIndex: 200, pointerEvents: 'none',
        background: 'var(--bg)', border: '1px solid var(--border-strong)', borderRadius: 12,
        boxShadow: 'var(--shadow-lg)', padding: '13px 15px',
        fontFamily: 'var(--font-sans)',
        animation: 'drawerFadeIn 120ms ease-out',
      }}
    >
      {/* Header */}
      <div className="flex items-center" style={{ gap: 10 }}>
        <span className="font-display tabular-nums" style={{ fontSize: 30, fontWeight: 700, lineHeight: 1, color: prColor(rating.pr) }}>
          {rating.pr.toFixed(0)}
        </span>
        <div className="flex flex-col" style={{ gap: 2 }}>
          <span className="font-bold uppercase text-(--text-dim)" style={{ fontSize: 8.5, letterSpacing: '0.12em' }}>
            Performance rating
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
            vs other {ROLE_LABEL[role] ?? 'players'} this event
          </span>
        </div>
        {rating.is_mvp && (
          <span className="font-bold uppercase" style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--accent-2)', letterSpacing: '0.08em' }}>★ MVP</span>
        )}
      </div>

      {/* Plain-language driver summary */}
      {(lifted || dragged) && (
        <div style={{ fontSize: 10.5, color: 'var(--text-dim)', lineHeight: 1.45, margin: '9px 0 10px' }}>
          {lifted && <>Lifted by <b style={{ color: 'var(--green)' }}>{lifted.label}</b></>}
          {lifted && dragged && ' · '}
          {dragged && <>held back by <b style={{ color: 'var(--red)' }}>{dragged.label}</b></>}
        </div>
      )}

      {/* Column headers */}
      <div className="flex items-center text-(--text-faint) uppercase" style={{ fontSize: 8, letterSpacing: '0.1em', gap: 8, marginBottom: 4 }}>
        <span style={{ width: 28, flexShrink: 0, textAlign: 'right' }}>Wt</span>
        <span style={{ width: 100, flexShrink: 0 }}>Stat</span>
        <span style={{ flex: 1 }}>Score vs peers</span>
        <span style={{ width: 18 }} />
      </div>

      {/* Metric rows — only stats that count for this role, sorted by weight */}
      <div className="flex flex-col" style={{ gap: 4 }}>
        {metrics.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>No breakdown available.</span>}
        {withImpact.filter((m) => m.weight > 0).map((m) => {
          const key = m.weight >= 0.15; // primary stat for this role
          return (
            <div key={m.key} className="flex items-center" style={{ gap: 8 }}>
              <span className="tabular-nums font-semibold" style={{ width: 28, flexShrink: 0, textAlign: 'right', fontSize: 10, color: key ? 'var(--accent-2)' : 'var(--text-faint)' }}>
                {Math.round(m.weight * 100)}%
              </span>
              <span className="truncate" style={{ width: 100, flexShrink: 0, fontSize: 10.5, color: key ? 'var(--text-h)' : 'var(--text-dim)', fontWeight: key ? 600 : 400 }}>
                {key && <span style={{ color: 'var(--accent-2)', marginRight: 3 }}>★</span>}
                {m.label}
              </span>
              <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--surface-sub)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(2, Math.min(100, m.score))}%`, height: '100%', background: prColor(m.score), opacity: key ? 1 : 0.55 }} />
              </div>
              <span className="tabular-nums font-semibold" style={{ width: 18, textAlign: 'right', fontSize: 10.5, color: prColor(m.score) }}>
                {m.score.toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Points math */}
      <div className="flex items-center justify-between tabular-nums" style={{ marginTop: 11, paddingTop: 9, borderTop: '1px solid var(--border)', fontSize: 10.5, color: 'var(--text-dim)' }}>
        <span style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
          <span className="font-semibold text-(--text-h)">{base.toFixed(1)}</span>
          <span style={{ color: 'var(--text-faint)', fontSize: 9 }}>base</span>
          {rating.won && <span style={{ color: 'var(--green)' }}>+2 win</span>}
          {rating.is_mvp && <span style={{ color: 'var(--accent-2)' }}>+1 MVP</span>}
          <span style={{ color: 'var(--text-faint)' }}>=</span>
          <span className="font-bold text-(--text-h)">{rating.points.toFixed(1)} pts</span>
        </span>
        <span>Carry <span className="font-semibold text-(--text-h)">{(rating.contribution * 100).toFixed(0)}%</span></span>
      </div>

      <div style={{ marginTop: 7, fontSize: 9, color: 'var(--text-faint)', lineHeight: 1.4 }}>
        <b style={{ color: 'var(--text-dim)' }}>Wt</b> = how much each stat counts for {ROLE_LABEL[role] ?? 'this role'} · ★ key stats ·
        score 0–100 vs same-role peers ({rating.tier === 'enriched' ? 'incl. laning & vision' : 'scoreboard only'}).
      </div>
    </div>,
    document.body,
  );
}

function ChampBlock({ champion, won }: { champion: Champion | null; won: boolean }) {
  return (
    <div className="relative shrink-0">
      {champion?.icon_url ? (
        <ChampionIcon
          src={champion.icon_url}
          alt={champion.name}
          size={44}
          style={{ opacity: won ? 1 : 0.72 }}
        />
      ) : (
        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--surface-sub)' }} />
      )}
    </div>
  );
}

function NameBlock({ playerName, championName, blue, onClick, fluid = false }: { playerName: string; championName: string; blue: boolean; onClick: () => void; fluid?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ width: fluid ? '100%' : 62, minWidth: fluid ? 0 : 62, maxWidth: fluid ? 'none' : 62, overflow: 'hidden', textAlign: blue ? 'left' : 'right', cursor: 'pointer', background: 'transparent', border: 0, padding: 0 }}
    >
      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-h)', letterSpacing: '-0.01em', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {playerName}
      </div>
      <div className="text-(--text-dim) tabular-nums" style={{ fontSize: 11, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {championName || '—'}
      </div>
    </button>
  );
}

function KDABlock({ kills, deaths, assists, blue }: { kills: number; deaths: number; assists: number; blue: boolean }) {
  const ratio = ((kills + assists) / Math.max(1, deaths)).toFixed(2);
  const r = Number(ratio);
  const ratioColor = r >= 4 ? 'var(--green)' : r < 1.5 ? 'var(--red)' : 'var(--text-dim)';
  return (
    <div className="flex flex-col" style={{ width: 72, minWidth: 72, maxWidth: 72, alignItems: blue ? 'flex-start' : 'flex-end' }}>
      <div className="flex items-baseline font-bold tabular-nums" style={{ gap: 3, fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-h)', lineHeight: 1, letterSpacing: '-0.01em' }}>
        <span>{kills}</span>
        <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>/</span>
        <span style={{ color: 'var(--red)', fontWeight: 700 }}>{deaths}</span>
        <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>/</span>
        <span>{assists}</span>
      </div>
      <div className="tabular-nums font-semibold" style={{ marginTop: 4, fontSize: 10.5, color: ratioColor, letterSpacing: '0.04em' }}>
        {ratio} KDA
      </div>
    </div>
  );
}

function StatBlock({
  cs, gold, dmg, vision, maxDmg, accent, blue, fluid = false,
}: {
  cs: number;
  gold: number;
  dmg: number;
  vision: number;
  maxDmg: number;
  accent: string;
  blue: boolean;
  fluid?: boolean;
}) {
  const dmgPct = Math.max(0.04, dmg / Math.max(1, maxDmg));
  return (
    <div className="flex flex-col" style={{ width: fluid ? '100%' : undefined, minWidth: 84, gap: 4, alignItems: blue ? 'flex-start' : 'flex-end' }}>
      <div className="flex items-center tabular-nums font-semibold" style={{ gap: 7, fontSize: 11.5, color: 'var(--text-h)', flexDirection: blue ? 'row' : 'row-reverse' }}>
        <span className="inline-flex items-center" style={{ gap: 3 }}><ObjIcon kind="cs" size={11} />{cs}</span>
        <span style={{ color: 'var(--text-faint)' }}>·</span>
        <span className="inline-flex items-center" style={{ gap: 3 }}><ObjIcon kind="gold" size={11} />{(gold / 1000).toFixed(1)}k</span>
      </div>
      <div className="flex" style={{ width: fluid ? '100%' : 84, height: 5, borderRadius: 999, background: 'var(--surface-sub)', overflow: 'hidden', alignSelf: blue ? 'flex-start' : 'flex-end', flexDirection: blue ? 'row' : 'row-reverse' }}>
        <div style={{ width: `${dmgPct * 100}%`, height: '100%', background: accent, opacity: 0.85 }} />
      </div>
      <div className="flex items-center tabular-nums" style={{ fontSize: 9.5, color: 'var(--text-dim)', gap: 5, flexDirection: blue ? 'row' : 'row-reverse' }}>
        <span><span style={{ color: 'var(--text-faint)' }}>DMG</span> {(dmg / 1000).toFixed(1)}k</span>
        <span style={{ color: 'var(--text-faint)' }}>·</span>
        <span><span style={{ color: 'var(--text-faint)' }}>VIS</span> {vision}</span>
      </div>
    </div>
  );
}

function Loadout({ spellD, spellF, keystone, runes, blue }: { spellD: SummonerSpell | null; spellF: SummonerSpell | null; keystone: Rune | null; runes: Rune[]; blue: boolean }) {
  const secondary = keystone ? runes.find((r) => r.path_riot_id !== keystone.path_riot_id) ?? null : runes[0] ?? null;
  return (
    <div className="flex items-center shrink-0" style={{ gap: 4, flexDirection: blue ? 'row' : 'row-reverse' }}>
      <div className="grid" style={{ gridTemplateRows: 'auto auto', gap: 2 }}>
        <SpellSlot spell={spellD} />
        <SpellSlot spell={spellF} />
      </div>
      <div className="grid" style={{ gridTemplateRows: 'auto auto', gap: 2 }}>
        <RuneSlot rune={keystone} size={20} kind="keystone" />
        <RuneSlot rune={secondary} size={16} kind="secondary" />
      </div>
    </div>
  );
}

function SpellSlot({ spell }: { spell: SummonerSpell | null }) {
  if (!spell?.icon_url) return <div style={{ width: 16, height: 16, borderRadius: 3, background: 'var(--surface-sub)', opacity: 0.4 }} />;
  return <img src={spell.icon_url} alt={spell.name} title={spell.name} style={{ width: 16, height: 16, borderRadius: 3, display: 'block' }} />;
}

function RuneSlot({ rune, size, kind }: { rune: Rune | null; size: number; kind: 'keystone' | 'secondary' }) {
  if (!rune) return <div style={{ width: size, height: size, borderRadius: kind === 'keystone' ? 999 : 3, background: 'var(--surface-sub)', opacity: 0.4 }} />;
  const src = kind === 'keystone' ? ddragonRune(rune.icon) : ddragonRune(rune.path_icon);
  return <img src={src} alt={rune.name} title={rune.name} style={{ width: size, height: size, display: 'block', marginLeft: kind === 'secondary' ? 2 : 0 }} />;
}

function Inventory({ items, trinket, blue }: { items: Item[]; trinket: Item | null; blue: boolean }) {
  return (
    <div className="flex items-center shrink-0" style={{ gap: 4, flexDirection: blue ? 'row' : 'row-reverse' }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 18px)', gridAutoRows: '18px', gap: 2 }}>
        {Array.from({ length: 6 }, (_, i) => {
          const it = items[i];
          if (!it?.icon_url) return <div key={i} style={{ width: 18, height: 18, borderRadius: 3, background: 'var(--surface-sub)', opacity: 0.4 }} />;
          return <img key={i} src={it.icon_url} alt={it.name} title={it.name} style={{ width: 18, height: 18, borderRadius: 3, objectFit: 'cover', display: 'block' }} />;
        })}
      </div>
      {trinket?.icon_url ? (
        <img src={trinket.icon_url} alt={trinket.name} title={trinket.name} style={{ width: 18, height: 18, borderRadius: 999, objectFit: 'cover', display: 'block', boxShadow: 'inset 0 0 0 1px var(--border-strong)' }} />
      ) : (
        <div style={{ width: 18, height: 18, borderRadius: 999, background: 'var(--surface-sub)', opacity: 0.4 }} />
      )}
    </div>
  );
}
