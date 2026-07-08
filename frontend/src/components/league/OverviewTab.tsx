import { useState, Fragment } from 'react';
import type React from 'react';
import type { StandingsEntry, EventHighlights, Match } from '../../types/models';
import { FormHistory } from './shared';
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
      <AccoladesRow highlights={highlights} teamShortNames={teamShortNames} />

      <div>
        {!stageNav && (
          <h2 className="section-label pl-1" style={{ marginBottom: 10 }}>
            Tournament Standings
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

/* Highlights strip (Best Performer · On Fire · Must Pick · Match of the Week)
   — compact image-backed tiles rendered above the stages/standings card. */

function AccoladesRow({ highlights, teamShortNames }: { highlights: EventHighlights | null; teamShortNames: Record<string, string> }) {
  if (!highlights) return null;

  const cards: React.ReactNode[] = [];
  if (highlights.player_of_month) cards.push(<PlayerOfMonthCard key="pom" p={highlights.player_of_month} />);
  if (highlights.inform_team) cards.push(<InformTeamCard key="team" t={highlights.inform_team} />);
  if (highlights.must_pick) cards.push(<MustPickCard key="pick" c={highlights.must_pick} />);
  if (highlights.match_of_week) cards.push(<MatchOfWeekCard key="motw" m={highlights.match_of_week} sn={teamShortNames} />);
  else if (highlights.banger_of_week) cards.push(<BangerOfWeekCard key="botw" m={highlights.banger_of_week} sn={teamShortNames} />);
  if (cards.length === 0) return null;

  return <div className="hl-grid">{cards}</div>;
}

function HighlightTile({
  kicker, title, sub, visual, backdrop,
}: {
  kicker: string;
  title: React.ReactNode;
  sub: React.ReactNode;
  visual: React.ReactNode;
  backdrop?: React.ReactNode;
}) {
  return (
    <div className="hl-card">
      {backdrop}
      <div className="hl-glow" aria-hidden />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.5) 100%)' }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12, height: '100%', padding: '0 14px' }}>
        <div style={{ flexShrink: 0 }}>{visual}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 8.5, letterSpacing: '0.13em', fontWeight: 700, color: '#c4b5fd', textTransform: 'uppercase', marginBottom: 3, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
            {kicker}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
            {sub}
          </div>
        </div>
      </div>
    </div>
  );
}

function BlurLogoBackdrop({ src }: { src: string }) {
  return (
    <img
      src={src} alt="" aria-hidden className="hl-zoom"
      style={{ position: 'absolute', top: '50%', left: '55%', marginTop: -110, marginLeft: -110, width: 220, height: 220, objectFit: 'contain', filter: 'blur(22px) brightness(0.55)', opacity: 0.9 }}
    />
  );
}

/* Fixed dark-theme W/L colors: the tiles keep a dark image scrim in both themes. */
function MiniForm({ form }: { form: ('W' | 'L')[] }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {form.slice(-5).map((c, i) => (
        <span key={i} style={{ fontSize: 9.5, fontWeight: 800, color: c === 'W' ? '#4ade80' : '#f87171' }}>{c}</span>
      ))}
    </span>
  );
}

function PlayerOfMonthCard({ p }: { p: NonNullable<EventHighlights['player_of_month']> }) {
  return (
    <HighlightTile
      kicker="Best Performer"
      title={p.name}
      sub={<span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}><strong style={{ color: '#d8ccfd', fontWeight: 700 }}>{p.kda} KDA</strong> · {p.avg_kills}/{p.avg_deaths}/{p.avg_assists} · {p.team}</span>}
      backdrop={p.team_logo ? <BlurLogoBackdrop src={p.team_logo} /> : undefined}
      visual={
        p.image ? (
          <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <img src={p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 12%' }} />
          </div>
        ) : p.team_logo ? (
          <img src={p.team_logo} alt={p.team} style={{ width: 38, height: 38, objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))' }} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 10, background: '#171717', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fafafa', fontSize: 15, fontWeight: 700 }}>{p.name.charAt(0)}</div>
        )
      }
    />
  );
}

function InformTeamCard({ t }: { t: NonNullable<EventHighlights['inform_team']> }) {
  return (
    <HighlightTile
      kicker="On Fire"
      title={t.team}
      sub={<><span>{t.wins}W–{t.played - t.wins}L</span><MiniForm form={t.form} /></>}
      backdrop={t.logo ? <BlurLogoBackdrop src={t.logo} /> : undefined}
      visual={
        t.logo
          ? <img src={t.logo} alt={t.team} style={{ width: 38, height: 38, objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))' }} />
          : <div style={{ width: 44, height: 44, borderRadius: 10, background: '#171717', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fafafa', fontSize: 15, fontWeight: 700 }}>{t.team.charAt(0)}</div>
      }
    />
  );
}

function MustPickCard({ c }: { c: NonNullable<EventHighlights['must_pick']> }) {
  return (
    <HighlightTile
      kicker="Must Pick"
      title={c.name}
      sub={
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {c.win_rate !== null && <strong style={{ color: c.win_rate >= 60 ? '#4ade80' : '#fbbf24', fontWeight: 700 }}>{c.win_rate}% WR</strong>}
          {c.win_rate !== null && ' · '}{c.wins}W–{c.picks - c.wins}L · {c.picks} picks
        </span>
      }
      backdrop={
        <img src={c.splash_url} alt="" aria-hidden className="hl-zoom" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 18%', filter: 'brightness(0.75)' }} />
      }
      visual={<img src={c.icon_url} alt={c.name} style={{ width: 44, height: 44, borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', display: 'block' }} />}
    />
  );
}

function formatMatchWhen(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

function FaceOffVisual({ logo1, logo2, name1, name2 }: { logo1: string | null; logo2: string | null; name1: string; name2: string }) {
  const logo = (src: string | null, name: string, offset: boolean) => (
    src
      ? <img src={src} alt={name} style={{ width: 30, height: 30, objectFit: 'contain', marginLeft: offset ? -8 : 0, filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.7))' }} />
      : <div style={{ width: 30, height: 30, borderRadius: 8, background: '#171717', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fafafa', fontSize: 10, fontWeight: 700, marginLeft: offset ? -8 : 0 }}>{name.slice(0, 2)}</div>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {logo(logo1, name1, false)}
      {logo(logo2, name2, true)}
    </div>
  );
}

/* Both team names shrink independently so the middle (vs / score) never truncates away. */
function FaceOffTitle({ left, center, right }: { left: React.ReactNode; center: React.ReactNode; right: React.ReactNode }) {
  const name = (node: React.ReactNode) => (
    <span style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node}</span>
  );
  return (
    <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
      {name(left)}
      <span style={{ flexShrink: 0 }}>{center}</span>
      {name(right)}
    </span>
  );
}

function MatchOfWeekCard({ m, sn }: { m: NonNullable<EventHighlights['match_of_week']>; sn: Record<string, string> }) {
  const when = formatMatchWhen(m.datetime_utc);
  return (
    <HighlightTile
      kicker="Match of the Week"
      title={
        <FaceOffTitle
          left={sn[m.team1] || m.team1}
          center={<span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600, fontSize: 11 }}>vs</span>}
          right={sn[m.team2] || m.team2}
        />
      }
      sub={
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {m.team1_pos != null && m.team2_pos != null && `#${m.team1_pos} vs #${m.team2_pos} · `}
          {when ?? 'Time TBD'}
        </span>
      }
      backdrop={m.team1_logo ? <BlurLogoBackdrop src={m.team1_logo} /> : m.team2_logo ? <BlurLogoBackdrop src={m.team2_logo} /> : undefined}
      visual={<FaceOffVisual logo1={m.team1_logo} logo2={m.team2_logo} name1={m.team1} name2={m.team2} />}
    />
  );
}

function BangerOfWeekCard({ m, sn }: { m: NonNullable<EventHighlights['banger_of_week']>; sn: Record<string, string> }) {
  const when = formatMatchWhen(m.datetime_utc);
  return (
    <HighlightTile
      kicker="Banger of the Week"
      title={
        <FaceOffTitle
          left={<span style={{ color: m.winner === 1 ? '#fff' : 'rgba(255,255,255,0.55)' }}>{sn[m.team1] || m.team1}</span>}
          center={<span style={{ color: '#d8ccfd', fontWeight: 800 }}>{m.team1_score}–{m.team2_score}</span>}
          right={<span style={{ color: m.winner === 2 ? '#fff' : 'rgba(255,255,255,0.55)' }}>{sn[m.team2] || m.team2}</span>}
        />
      }
      sub={<span>{when ?? 'Recently played'}</span>}
      backdrop={m.team1_logo ? <BlurLogoBackdrop src={m.team1_logo} /> : m.team2_logo ? <BlurLogoBackdrop src={m.team2_logo} /> : undefined}
      visual={<FaceOffVisual logo1={m.team1_logo} logo2={m.team2_logo} name1={m.team1} name2={m.team2} />}
    />
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

