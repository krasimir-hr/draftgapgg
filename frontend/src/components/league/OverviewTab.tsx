import { useState, Fragment } from 'react';
import type React from 'react';
import type { StandingsEntry, Match } from '../../types/models';
import { FormHistory, TeamMark } from './shared';
import type { OverviewData } from '../../lib/leagueData';
import type { SubStage } from '../../lib/leagueView';
import BracketTab from './BracketTab';
import SwissStage from './SwissStage';

interface Props {
  data: OverviewData;
  teamShortNames: Record<string, string>;
  eventId?: number;
  teamLogos?: Record<string, string | null>;
  onMatchSelect?: (id: number) => void;
  subStages?: SubStage[];
  onViewMatches?: () => void;
  bm?: (eventId: number, stageId?: number) => Match[] | undefined;
}

export default function OverviewTab({
  data, teamShortNames, eventId, teamLogos = {}, onMatchSelect, subStages = [], bm, onViewMatches,
}: Props) {
  const { standings, upcoming, recent } = data;
  const stageOnlySubStages = subStages.filter((ss) => ss.stageOnly);
  // Default to the current/latest stage: the last (most recent) stage that
  // already has a played match, falling back to the last stage overall.
  const [selectedIdx, setSelectedIdx] = useState(() => {
    for (let i = stageOnlySubStages.length - 1; i >= 0; i--) {
      const ss = stageOnlySubStages[i];
      const matches = bm?.(ss.event.id, ss.swiss ? undefined : ss.stageId) ?? [];
      if (matches.some((m) => m.winner != null)) return i;
    }
    return Math.max(0, stageOnlySubStages.length - 1);
  });

  const activeIdx = Math.min(selectedIdx, stageOnlySubStages.length - 1);
  const activeSS = stageOnlySubStages[activeIdx] ?? null;

  const stageNav = stageOnlySubStages.length > 0 ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {stageOnlySubStages.map((ss, i) => (
        <Fragment key={ss.label}>
          {i > 0 && (
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden style={{ flexShrink: 0, color: 'var(--text-dim)' }}>
              <path d="M2 6.5h9M7.5 2.5l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          <button
            type="button"
            onClick={() => setSelectedIdx(i)}
            aria-pressed={i === activeIdx}
            className={`chip${i === activeIdx ? ' active' : ''}`}
          >
            {ss.label}
          </button>
        </Fragment>
      ))}
    </div>
  ) : null;

  return (
    <div className="dg-league-overview">
      <div className="dg-overview-matches">
        <MatchSummary title="Upcoming" matches={upcoming} teamLogos={teamLogos} teamShortNames={teamShortNames} onMatchSelect={onMatchSelect} onViewAll={onViewMatches} />
        <MatchSummary title="Results" matches={recent} teamLogos={teamLogos} teamShortNames={teamShortNames} onMatchSelect={onMatchSelect} onViewAll={onViewMatches} />
      </div>

      <div className="dg-overview-standings">
        {!stageNav && (
          <h2 className="section-label pl-1" style={{ marginBottom: 10 }}>
            Standings
          </h2>
        )}
        <div className="card card-soft-shadow overflow-hidden" style={{ borderRadius: 12 }}>
        {stageNav && (
          <div
            className="flex items-center justify-center"
            style={{ padding: '12px 18px 0' }}
          >
            {stageNav}
          </div>
        )}

        {activeSS && bm && eventId != null ? (
          activeSS.isStandings ? (
            <StandingsTable standings={standings} teamShortNames={teamShortNames} />
          ) : (
            <div style={{ padding: '12px 12px 16px' }}>
              {activeSS.swiss ? (
                <SwissStage
                  key={activeSS.event.id}
                  eventId={activeSS.event.id}
                  preloadedMatches={bm(activeSS.event.id)}
                  teamLogos={teamLogos}
                  teamShortNames={teamShortNames}
                  onMatchSelect={onMatchSelect ?? (() => {})}
                />
              ) : (
                <BracketTab
                  key={activeSS.event.id + (activeSS.tabFilter?.join(',') ?? '') + (activeSS.tabPrefix ?? '')}
                  eventId={activeSS.event.id}
                  stageId={activeSS.stageId}
                  tabFilter={activeSS.tabFilter}
                  tabPrefix={activeSS.tabPrefix}
                  teamLogos={teamLogos}
                  teamShortNames={teamShortNames}
                  onMatchSelect={onMatchSelect ?? (() => {})}
                  noBorder
                  preloadedMatches={bm(activeSS.event.id, activeSS.stageId)}
                />
              )}
            </div>
          )
        ) : (
          <StandingsTable standings={standings} teamShortNames={teamShortNames} />
        )}
        </div>
      </div>
    </div>
  );
}

function MatchSummary({ title, matches, teamLogos, teamShortNames, onMatchSelect, onViewAll }: {
  title: string; matches: Match[]; teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>; onMatchSelect?: (id: number) => void; onViewAll?: () => void;
}) {
  return <section className="dg-match-summary">
    <div className="dg-panel-heading"><h2>{title}</h2>{onViewAll && <button type="button" onClick={onViewAll}>All matches ↗</button>}</div>
    {matches.length === 0 ? <p className="dg-quiet-empty">{title === 'Upcoming' ? 'No upcoming matches scheduled.' : 'No results yet.'}</p> : matches.slice(0, 4).map(m => {
      const date = m.datetime_utc ? new Date(m.datetime_utc) : null;
      return <button className="dg-summary-match" key={m.id} type="button" onClick={() => onMatchSelect?.(m.id)}>
        <span className="dg-summary-date">{date ? date.toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : 'TBD'}<small>{m.winner == null && date ? date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : `BO${m.best_of}`}</small></span>
        <span className="dg-summary-teams">{[m.team1,m.team2].map((name,i) => <span key={i}>
          <TeamMark short={teamShortNames[name] || name} logo={teamLogos[name]} size={24} />
          <span className={m.winner === i+1 ? 'dg-winner' : ''}>{teamShortNames[name] || name}</span>
          <strong>{m.winner == null ? '–' : i === 0 ? m.team1_score : m.team2_score}</strong>
        </span>)}</span>
      </button>;
    })}
  </section>;
}

/* Standings card (top 10) */

function StandingsTable({
  standings, teamShortNames,
}: {
  standings: StandingsEntry[];
  teamShortNames: Record<string, string>;
}) {
  return (
    <>
      {standings.length === 0 ? (
        <p className="text-(--text-dim) text-center" style={{ padding: '40px 20px', fontSize: 13 }}>
          No standings data yet.
        </p>
      ) : (
        <table className="dg-standings-table w-full font-sans" style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <Th style={{ width: 42, textAlign: 'center', padding: '10px 8px' }}>#</Th>
              <Th style={{ textAlign: 'left', paddingLeft: 16 }}>Team</Th>
              <Th>Form</Th>
              <Th>W</Th>
              <Th>L</Th>
              <Th style={{ textAlign: 'right' }}>WR%</Th>
              <Th>Games W-L</Th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <tr
                key={s.team}
                className="transition-colors hover:bg-(--surface-sub)"
                style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
              >
                <td
                  className="tabular-nums"
                  style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 11.5, fontWeight: 600, width: 42 }}
                >
                  {i + 1}
                </td>
                <td style={{ padding: '10px 16px' }}>
                  <div className="flex items-center" style={{ gap: 10 }}>
                    {s.logo ? (
                      <img className="dg-team-mark" src={s.logo} alt={s.team} width={32} height={32} loading="lazy" decoding="async" style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--surface-sub)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', flexShrink: 0 }}>
                        {s.team.slice(0, 2)}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-h)', fontSize: 13, whiteSpace: 'nowrap' }}><span className="dg-team-full">{s.team}</span><span className="dg-team-short">{teamShortNames[s.team] || s.team}</span></div>

                    </div>
                  </div>
                </td>
                <Td>
                  <FormHistory form={s.form} teamShortNames={teamShortNames} />
                </Td>
                <Td>{s.wins}</Td>
                <Td>{s.losses}</Td>
                <Td style={{ textAlign: 'right' }}>
                  <div className="inline-flex items-center justify-end" style={{ gap: 6 }}>
                    <span>{s.win_rate.toFixed(1)}%</span>
                    <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden', flexShrink: 0 }}>
                      <div style={{ width: `${s.win_rate}%`, height: '100%', background: 'var(--accent-2)', borderRadius: 2 }} />
                    </div>
                  </div>
                </Td>
                <Td>
                  <span className="tabular-nums">{s.game_wins}-{s.games - s.game_wins}</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th
      style={{
        padding: '10px 12px',
        textAlign: 'center',
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
        color: 'var(--text-dim)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td
      className="tabular-nums"
      style={{
        padding: '12px 12px',
        textAlign: 'center',
        color: 'var(--text)',
        fontWeight: 500,
        fontSize: 12.5,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </td>
  );
}

