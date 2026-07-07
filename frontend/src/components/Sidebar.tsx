import { useEffect, useState } from 'react';
import { getMatches } from '../api/core';
import type { Match } from '../types/models';
import { TeamMark } from './league/shared';

// Content-agnostic sidebar column shared by the league and match pages.
export function Sidebar({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 16, ...style }}>
      {children}
    </div>
  );
}

// Upcoming + recent match rails for one or more events.
export function MatchRails({
  eventIds, teamLogos, teamShortNames, onMatchSelect, onViewAll, currentMatchId,
  upcoming: upcomingProp, recent: recentProp,
}: {
  eventIds: number[];
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
  onMatchSelect: (id: number) => void;
  onViewAll?: () => void;
  currentMatchId?: number;
  // Preloaded by the route loader; when provided the rails skip self-fetching.
  upcoming?: Match[];
  recent?: Match[];
}) {
  const preloaded = upcomingProp !== undefined && recentProp !== undefined;
  const [fetchedUpcoming, setFetchedUpcoming] = useState<Match[]>([]);
  const [fetchedRecent, setFetchedRecent] = useState<Match[]>([]);
  const key = eventIds.join(',');

  useEffect(() => {
    if (preloaded) return;
    if (!key) { setFetchedUpcoming([]); setFetchedRecent([]); return; }
    const now = new Date();
    Promise.all([
      getMatches({ event__in: key, has_result: 'false', page_size: 20 }),
      getMatches({ event__in: key, has_result: 'true',  page_size: 20 }),
    ]).then(([upRes, reRes]) => {
      setFetchedUpcoming(
        [...upRes.data.results]
          .filter((m) => m.datetime_utc && new Date(m.datetime_utc) > now)
          .sort((a, b) => (a.datetime_utc ?? '').localeCompare(b.datetime_utc ?? ''))
          .slice(0, 8),
      );
      setFetchedRecent(
        [...reRes.data.results]
          .sort((a, b) => (b.datetime_utc ?? '').localeCompare(a.datetime_utc ?? ''))
          .slice(0, 8),
      );
    }).catch(() => {});
  }, [key, preloaded]);

  const upcoming = (upcomingProp ?? fetchedUpcoming).slice(0, 4);
  const recent = (recentProp ?? fetchedRecent).slice(0, 4);

  return (
    <>
      <SideRail title="Upcoming matches" onViewAll={onViewAll}>
        {upcoming.length === 0
          ? <EmptyRail label="No upcoming matches" />
          : upcoming.map((m, i) => (
            <RailRow
              key={m.id}
              m={m}
              isLast={i === upcoming.length - 1}
              teamLogos={teamLogos}
              teamShortNames={teamShortNames}
              current={m.id === currentMatchId}
              onClick={() => onMatchSelect(m.id)}
            />
          ))
        }
      </SideRail>
      <SideRail title="Recent results" onViewAll={onViewAll}>
        {recent.length === 0
          ? <EmptyRail label="No results yet." />
          : recent.map((m, i) => (
            <RailRow
              key={m.id}
              m={m}
              isLast={i === recent.length - 1}
              teamLogos={teamLogos}
              teamShortNames={teamShortNames}
              current={m.id === currentMatchId}
              result
              onClick={() => onMatchSelect(m.id)}
            />
          ))
        }
      </SideRail>
    </>
  );
}

export function SideRail({
  title, onViewAll, children,
}: {
  title?: string;
  onViewAll?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="side-rail">
      {title && <h3 className="side-rail-header">{title}</h3>}
      <div className="side-rail-body">{children}</div>
      {onViewAll && (
        <button
          type="button"
          className="side-rail-footer w-full text-left transition-colors hover:bg-(--surface-sub)"
          onClick={onViewAll}
        >
          View all →
        </button>
      )}
    </div>
  );
}

function EmptyRail({ label }: { label: string }) {
  return (
    <div
      className="text-(--text-dim) text-center"
      style={{ padding: '10px 18px', fontSize: 12.5 }}
    >
      {label}
    </div>
  );
}

// A single rail row. `result` shows scores; otherwise an upcoming match.
function RailRow({
  m, isLast, teamLogos, teamShortNames, current, result, onClick,
}: {
  m: Match;
  isLast: boolean;
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
  current?: boolean;
  result?: boolean;
  onClick: () => void;
}) {
  const dt = m.datetime_utc ? new Date(m.datetime_utc) : null;
  const name1 = teamShortNames[m.team1] || m.team1;
  const name2 = teamShortNames[m.team2] || m.team2;
  const t1Win = m.winner === 1;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`match-rail-row${current ? ' current' : ''}`}
      style={{ padding: '8px 18px 10px', borderBottom: isLast ? 'none' : '1px solid var(--border)' }}
    >
      <div className="rail-match-meta">
        {dt ? dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : (result ? '—' : 'TBD')}
        {!result && <>{' · '}BO{m.best_of}</>}
      </div>
      <div className="rail-match-team">
        <TeamMark short={name1} logo={teamLogos[m.team1]} size={20} />
        <span className={`rail-match-team-name${result ? (t1Win ? ' winner' : ' loser') : ''}`} style={{ fontSize: 13 }}>{name1}</span>
        {result && <span className={`rail-match-team-score ${t1Win ? 'winner' : 'loser'}`}>{m.team1_score}</span>}
      </div>
      <div className="rail-match-team">
        <TeamMark short={name2} logo={teamLogos[m.team2]} size={20} />
        <span className={`rail-match-team-name${result ? (!t1Win ? ' winner' : ' loser') : ''}`} style={{ fontSize: 13 }}>{name2}</span>
        {result && <span className={`rail-match-team-score ${!t1Win ? 'winner' : 'loser'}`}>{m.team2_score}</span>}
      </div>
    </button>
  );
}
