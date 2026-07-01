import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Link, useLoaderData } from 'react-router-dom';
import { getHomeMatches } from '../api/core';
import type { HomeMatches, Match } from '../types/models';
import { useDrawer } from '../contexts/DrawerContext';
import { RAIL_SURFACE } from '../lib/surfaces';
import { slugify } from '../utils/slugs';
import EsportsLayout from '../components/EsportsLayout';

export interface HomeData {
  matches: HomeMatches;
}

export async function homeLoader(): Promise<HomeData> {
  const matches = await getHomeMatches();
  return { matches: matches.data };
}

const LEAGUE_COLOR: Record<string, string> = {
  LCK:   '#a78bfa',
  LPL:   '#dc2626',
  LEC:   '#3b82f6',
  LCS:   '#06b6d4',
  CBLoL: '#10b981',
  LCP:   '#f59e0b',
};

/* date helpers */

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtTime(dt: string | null): string {
  if (!dt) return 'TBD';
  return new Date(dt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

function dateCellParts(key: string): { weekday: string; day: number; month: string } {
  const d = keyToDate(key);
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    day: d.getDate(),
    month: d.toLocaleDateString(undefined, { month: 'short' }),
  };
}

/* league sub-grouping */

interface LeagueBlock {
  key: string;
  name: string;
  short: string | null;
  logo: string | null;
  matches: Match[];
}

function groupByLeague(matches: Match[]): LeagueBlock[] {
  const order: string[] = [];
  const map = new Map<string, LeagueBlock>();
  for (const m of matches) {
    const key = m.league_short_name ?? 'Other';
    let blk = map.get(key);
    if (!blk) {
      blk = { key, name: key, short: m.league_short_name, logo: m.league_logo, matches: [] };
      map.set(key, blk);
      order.push(key);
    }
    blk.matches.push(m);
  }
  return order.map((k) => map.get(k)!);
}

/* sub-components */

function LeagueBadge({ block, size = 22 }: { block: LeagueBlock; size?: number }) {
  const label = block.short ?? block.name;
  const color = LEAGUE_COLOR[label] ?? 'var(--accent)';
  if (block.logo) {
    return (
      <img
        src={block.logo}
        alt={label}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className="shrink-0"
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center shrink-0 text-white font-bold"
      style={{
        width: size, height: size, borderRadius: Math.round(size / 4), background: color,
        fontFamily: 'var(--font-sans)', fontSize: size * 0.36, letterSpacing: '-0.02em',
      }}
    >
      {label.slice(0, 3)}
    </div>
  );
}

function TeamCrest({ name, logo, size = 18 }: { name: string; logo?: string | null; size?: number }) {
  if (logo) {
    return (
      <img
        src={logo}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className="shrink-0"
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
    );
  }
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center"
      style={{ width: size, height: size, borderRadius: Math.round(size / 3.6), background: 'var(--surface-sub)', color: 'var(--text-faint)', fontSize: size * 0.5, fontWeight: 700 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d={dir === 'left' ? 'M10 3.5L5.5 8l4.5 4.5' : 'M6 3.5L10.5 8 6 12.5'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DatePicker({ days, todayKey, selectedKey, onSelect }: {
  days: { key: string }[];
  todayKey: string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [selectedKey]);

  const idx = days.findIndex((d) => d.key === selectedKey);
  const step = (delta: number) => {
    const next = days[idx + delta];
    if (next) onSelect(next.key);
  };

  const navBtn = (dir: 'left' | 'right', disabled: boolean) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => step(dir === 'left' ? -1 : 1)}
      className="shrink-0 flex items-center justify-center transition-colors"
      style={{
        width: 30, height: 30, borderRadius: '50%',
        color: disabled ? 'var(--text-faint)' : 'var(--text-dim)',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--surface-sub)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <Chevron dir={dir} />
    </button>
  );

  return (
    <div
      className="flex items-center gap-1"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        marginBottom: 16,
        padding: '6px 0',
      }}
    >
      {navBtn('left', idx <= 0)}
      <div
        ref={stripRef}
        className="flex flex-1"
        style={{ overflowX: 'auto', scrollbarWidth: 'none', gap: 2 }}
      >
        {days.map((d, i) => {
          const isActive = d.key === selectedKey;
          const isToday = d.key === todayKey;
          const { weekday, day, month } = dateCellParts(d.key);
          const showMonth = i === 0 || dateCellParts(days[i - 1].key).month !== month;
          const accentText = isActive ? 'var(--accent-2)' : isToday ? 'var(--text-h)' : 'var(--text-dim)';
          return (
            <button
              key={d.key}
              ref={isActive ? activeRef : undefined}
              type="button"
              onClick={() => onSelect(d.key)}
              className="shrink-0 flex flex-col items-center justify-center transition-colors relative"
              style={{
                minWidth: 52,
                padding: '5px 8px 8px',
                cursor: 'pointer',
                borderRadius: 10,
                background: isActive ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--surface-sub)'; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              <span
                className="uppercase"
                style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.06em', color: isActive ? 'var(--accent-2)' : 'var(--text-faint)', lineHeight: 1.4 }}
              >
                {weekday}
              </span>
              <span
                className="tabular-nums flex items-baseline"
                style={{ fontSize: 16, fontWeight: isActive || isToday ? 700 : 500, color: accentText, lineHeight: 1.15, gap: 3 }}
              >
                {day}
                {showMonth && (
                  <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-faint)' }}>{month}</span>
                )}
              </span>
              {isToday && (
                <span
                  className="absolute rounded-full"
                  style={{ bottom: 3, width: 4, height: 4, background: 'var(--accent)' }}
                />
              )}
            </button>
          );
        })}
      </div>
      {navBtn('right', idx < 0 || idx >= days.length - 1)}
    </div>
  );
}

function TeamName({ short, full, win, align }: { short: string; full: string | null; win: boolean; align: 'left' | 'right' }) {
  return (
    <div className={`min-w-0 flex flex-col ${align === 'right' ? 'items-end' : 'items-start'}`}>
      <span
        className={`truncate font-display ${win ? 'font-bold' : 'font-medium'}`}
        style={{ fontSize: 14, color: 'var(--text-h)', textAlign: align, maxWidth: '100%' }}
      >
        {short}
      </span>
      {full && (
        <span
          className="truncate"
          style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: align, maxWidth: '100%', marginTop: 1 }}
        >
          {full}
        </span>
      )}
    </div>
  );
}

function MatchRow({ m, isLast }: { m: Match; isLast: boolean }) {
  const { openMatch } = useDrawer();
  const played = m.winner !== null;
  const t1Win = m.winner === 1;
  const t2Win = m.winner === 2;

  // Show the full name as a dimmed second line only when a short name exists.
  const t1Full = m.team1_short ? m.team1 : null;
  const t2Full = m.team2_short ? m.team2 : null;

  return (
    <button
      type="button"
      onClick={() => openMatch(m.id)}
      className="w-full flex items-center transition-colors hover:bg-(--surface-sub) text-left"
      style={{ padding: '20px 14px', borderBottom: isLast ? 'none' : '1px solid var(--border)' }}
    >
      {/* Left: time */}
      <div className="shrink-0" style={{ width: 56 }}>
        <span className="tabular-nums whitespace-nowrap" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>
          {fmtTime(m.datetime_utc)}
        </span>
      </div>

      {/* Home team */}
      <div className="flex-1 min-w-0 flex items-center justify-end gap-3">
        <TeamName short={m.team1_short ?? m.team1} full={t1Full} win={t1Win} align="right" />
        <TeamCrest name={m.team1} logo={m.team1_logo} size={32} />
      </div>

      {/* Centre: score or vs */}
      <div className="shrink-0 flex items-center justify-center" style={{ minWidth: 80, padding: '0 8px' }}>
        {played ? (
          <span className="flex items-center tabular-nums" style={{ gap: 7 }}>
            <span style={{ fontSize: 20, fontWeight: t1Win ? 700 : 400, color: 'var(--text-h)' }}>{m.team1_score}</span>
            <span style={{ color: 'var(--text-faint)', fontSize: 14, fontWeight: 300 }}>–</span>
            <span style={{ fontSize: 20, fontWeight: t2Win ? 700 : 400, color: 'var(--text-h)' }}>{m.team2_score}</span>
          </span>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-faint)' }}>vs</span>
        )}
      </div>

      {/* Away team */}
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <TeamCrest name={m.team2} logo={m.team2_logo} size={32} />
        <TeamName short={m.team2_short ?? m.team2} full={t2Full} win={t2Win} align="left" />
      </div>

      {/* Right: BO */}
      <div className="shrink-0 flex items-center justify-end" style={{ width: 40 }}>
        <span className="font-semibold tracking-wide" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
          BO{m.best_of}
        </span>
      </div>
    </button>
  );
}

function DaySection({ matches }: { matches: Match[] }) {
  const blocks = groupByLeague(matches);
  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      {blocks.map((blk) => (
        <section
          key={blk.key}
          className="card-soft-shadow"
          style={{ background: RAIL_SURFACE, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}
        >
          {/* League header — centered with accent background */}
          <Link
            to={`/leagues/${slugify(blk.short ?? blk.name)}`}
            className="flex items-center justify-center gap-2.5 group w-full"
            style={{
              padding: '10px 16px',
              background: 'color-mix(in srgb, var(--accent) 10%, var(--surface-sub))',
              borderBottom: '1px solid color-mix(in srgb, var(--accent) 20%, var(--border))',
            }}
          >
            <LeagueBadge block={blk} size={20} />
            <span className="font-semibold text-(--text-h) group-hover:text-(--accent-2) transition-colors" style={{ fontSize: 13 }}>
              {blk.short ?? blk.name}
            </span>
          </Link>
          {blk.matches.map((m, i) => (
            <MatchRow
              key={m.id}
              m={m}
              isLast={i === blk.matches.length - 1}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

/* main page */

export default function HomePage() {
  const { matches: matchData } = useLoaderData() as HomeData;
  const { matches } = matchData;

  const { days, todayKey, boundaryKey } = useMemo(() => {
    const byDay = new Map<string, Match[]>();
    for (const m of matches) {
      if (!m.datetime_utc) continue;
      const k = dayKey(new Date(m.datetime_utc));
      const arr = byDay.get(k);
      if (arr) arr.push(m);
      else byDay.set(k, [m]);
    }
    for (const arr of byDay.values()) {
      arr.sort((a, b) => (a.datetime_utc ?? '').localeCompare(b.datetime_utc ?? ''));
    }
    const dayKeys = [...byDay.keys()].sort();
    const todayKey = dayKey(new Date());
    const boundaryKey = dayKeys.find((k) => k >= todayKey) ?? null;
    const days = dayKeys.map((k) => ({ key: k, matches: byDay.get(k)! }));
    return { days, todayKey, boundaryKey };
  }, [matches]);

  const [selectedKey, setSelectedKey] = useState<string | null>(boundaryKey);

  const scrollToDay = useCallback((key: string) => {
    setSelectedKey(key);
  }, []);

  const selectedMatches = useMemo(
    () => days.find((d) => d.key === selectedKey)?.matches ?? [],
    [days, selectedKey],
  );

  return (
    <EsportsLayout>
      {days.length > 0 ? (
        <>
          <DatePicker days={days} todayKey={todayKey} selectedKey={selectedKey} onSelect={scrollToDay} />
          {selectedMatches.length > 0 ? (
            <DaySection matches={selectedMatches} />
          ) : (
            <div className="card text-center text-sm text-(--text-dim)" style={{ padding: 40 }}>
              No matches on this day.
            </div>
          )}
        </>
      ) : (
        <div className="card text-center text-sm text-(--text-dim)" style={{ padding: 60 }}>
          No matches to show.
        </div>
      )}
    </EsportsLayout>
  );
}
