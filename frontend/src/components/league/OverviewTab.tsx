import { useState, Fragment } from 'react';
import type React from 'react';
import type { StandingsEntry, EventHighlights, Match } from '../../types/models';
import { FormChips, FormHistory } from './shared';
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
  bm?: (eventId: number, stageId?: number) => Match[] | undefined;
}

export default function OverviewTab({
  data, teamShortNames, eventId, teamLogos = {}, onMatchSelect, subStages = [], bm,
}: Props) {
  const { standings, highlights } = data;
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
            className={`chip${i === activeIdx ? ' active' : ''}`}
          >
            {ss.label}
          </button>
        </Fragment>
      ))}
    </div>
  ) : null;

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      <AccoladesRow highlights={highlights} />

      <div>
        <h2 className="section-label pl-1" style={{ marginBottom: 10 }}>
          {stageNav ? 'Stages' : 'Tournament Standings'}
        </h2>
        <div className="card card-soft-shadow overflow-hidden" style={{ borderRadius: 12 }}>
        {stageNav && (
          <div
            className="flex items-center justify-center"
            style={{ padding: '14px 18px', borderBottom: activeSS ? '1px solid var(--border)' : undefined }}
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

/* Highlights row (Player of Month · Inform Team · Must Pick) */

const CARD_H = 175;
const CARD_RADIUS = 14;
const CARD_BORDER = '1px solid var(--border)';

function AccoladesRow({ highlights }: { highlights: EventHighlights | null }) {
  const hasAccolades = !!(highlights?.player_of_month || highlights?.inform_team || highlights?.must_pick);
  if (!hasAccolades) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
      {highlights?.player_of_month && <PlayerOfMonthCard p={highlights.player_of_month} />}
      {highlights?.inform_team && <InformTeamCard t={highlights.inform_team} />}
      {highlights?.must_pick && <MustPickCard c={highlights.must_pick} />}
    </div>
  );
}

function PlayerOfMonthCard({ p }: { p: NonNullable<EventHighlights['player_of_month']> }) {
  return (
    <div style={{ position: 'relative', height: CARD_H, background: '#000', boxShadow: 'var(--shadow-md)', border: CARD_BORDER, borderRadius: CARD_RADIUS, overflow: 'hidden' }}>
      {p.team_logo && (
        <img src={p.team_logo} alt="" aria-hidden style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -40%)', width: 400, height: 400, objectFit: 'contain', filter: 'blur(20px) brightness(0.65)' }} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)' }} />
      {p.image && (
        <img src={p.image} alt={p.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: '50% 20%' }} />
      )}
      <div style={{ position: 'absolute', top: 11, left: 13, right: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 9, letterSpacing: '0.13em', fontWeight: 700, color: '#fff', textTransform: 'uppercase', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>Player of the Month</span>
      </div>
      <div style={{ position: 'absolute', bottom: 13, left: 14, right: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          {p.team_logo && <img src={p.team_logo} alt={p.team} style={{ width: 16, height: 16, objectFit: 'contain' }} />}
          <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>{p.team}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1, flex: '1 1 0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexShrink: 0 }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{p.avg_kills}/{p.avg_deaths}/{p.avg_assists}</span>
            <span style={{ color: 'var(--accent-2)', fontSize: 12, fontWeight: 700 }}>{p.kda} KDA</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function InformTeamCard({ t }: { t: NonNullable<EventHighlights['inform_team']> }) {
  return (
    <div style={{ position: 'relative', height: CARD_H, background: '#000', boxShadow: 'var(--shadow-md)', border: CARD_BORDER, borderRadius: CARD_RADIUS, overflow: 'hidden' }}>
      {t.logo && <img src={t.logo} alt="" aria-hidden style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -40%)', width: 400, height: 400, objectFit: 'contain', filter: 'blur(24px) brightness(0.5)', opacity: 0.85 }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)' }} />
      <div style={{ position: 'absolute', top: 11, left: 13, right: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 9, letterSpacing: '0.13em', fontWeight: 700, color: '#fff', textTransform: 'uppercase', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>Inform Team</span>
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {t.logo
          ? <img src={t.logo} alt={t.team} style={{ width: 120, height: 120, objectFit: 'contain' }} />
          : <div style={{ width: 80, height: 80, borderRadius: 16, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28, fontWeight: 700 }}>{t.team.charAt(0)}</div>}
      </div>
      <div style={{ position: 'absolute', bottom: 13, left: 14, right: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.team}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FormChips form={t.form} />
          <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginLeft: 'auto' }}>{t.wins}W–{t.played - t.wins}L</span>
        </div>
      </div>
    </div>
  );
}

function MustPickCard({ c }: { c: NonNullable<EventHighlights['must_pick']> }) {
  return (
    <div style={{ position: 'relative', height: CARD_H, overflow: 'hidden', background: 'linear-gradient(135deg, var(--accent-muted) 0%, transparent 55%, var(--accent-muted) 100%)', boxShadow: 'var(--shadow-md)', border: CARD_BORDER, borderRadius: CARD_RADIUS }}>
      <img src={c.splash_url} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)' }} />
      <div style={{ position: 'absolute', top: 11, left: 13, right: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 9, letterSpacing: '0.13em', fontWeight: 700, color: '#fff', textTransform: 'uppercase', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>Must Pick</span>
      </div>
      <div style={{ position: 'absolute', bottom: 13, left: 14, right: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 6 }}>{c.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {c.win_rate !== null && (
            <span style={{ fontSize: 13, fontWeight: 700, color: c.win_rate >= 60 ? 'var(--green)' : 'var(--amber)' }}>{c.win_rate}% WR</span>
          )}
          <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginLeft: 'auto' }}>{c.wins}W–{c.picks - c.wins}L · {c.picks}p</span>
        </div>
      </div>
    </div>
  );
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
        <table className="w-full font-sans" style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
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
                      <img src={s.logo} alt={s.team} width={32} height={32} loading="lazy" decoding="async" style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--surface-sub)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', flexShrink: 0 }}>
                        {s.team.slice(0, 2)}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-h)', fontSize: 13, whiteSpace: 'nowrap' }}>{s.team}</div>
                      <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 1, whiteSpace: 'nowrap' }}>{teamShortNames[s.team] || ''}</div>
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

