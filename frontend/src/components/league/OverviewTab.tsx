import { useEffect, useReducer } from 'react';
import { getMatches, getEventStandings, getEventHighlights } from '../../api/core';
import type { Match, StandingsEntry, EventHighlights } from '../../types/models';
import { FormChips, TeamMark, Badge, WinRateBar, ROLE_ICON, MISSING_LEAGUE_FIELDS, MissingDataNote } from './shared';

interface OverviewData {
  upcoming: Match[];
  recent: Match[];
  standings: StandingsEntry[];
  featured: Match | null;
  highlights: EventHighlights | null;
}

interface State {
  loading: boolean;
  error: string | null;
  data: OverviewData | null;
}
type Action =
  | { type: 'fetch' }
  | { type: 'success'; data: OverviewData }
  | { type: 'error'; message: string };
function reducer(_s: State, a: Action): State {
  switch (a.type) {
    case 'fetch':   return { loading: true, error: null, data: null };
    case 'success': return { loading: false, error: null, data: a.data };
    case 'error':   return { loading: false, error: a.message, data: null };
  }
}

interface Props {
  eventId: number;
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
  onMatchSelect: (id: number) => void;
  /** Switch to the Matches tab. */
  onViewAllMatches: () => void;
}

export default function OverviewTab({
  eventId, teamLogos, teamShortNames, onMatchSelect, onViewAllMatches,
}: Props) {
  const [state, dispatch] = useReducer(reducer, { loading: true, error: null, data: null });

  useEffect(() => {
    dispatch({ type: 'fetch' });
    const now = new Date();
    Promise.all([
      getMatches({ event: eventId, has_result: 'false', page_size: 50 }),
      getMatches({ event: eventId, has_result: 'true',  page_size: 20 }),
      getEventStandings(eventId).catch(() => ({ data: [] as StandingsEntry[] })),
      getEventHighlights(eventId).catch(() => ({ data: null as EventHighlights | null })),
    ])
      .then(([upRes, resRes, standRes, hlRes]) => {
        const upcomingSorted = [...upRes.data.results]
          .filter((m) => m.datetime_utc && new Date(m.datetime_utc) > now)
          .sort((a, b) => (a.datetime_utc ?? '').localeCompare(b.datetime_utc ?? ''));
        const upcoming = upcomingSorted.slice(0, 5);
        const featured = upcomingSorted[0] ?? null;

        const recentSorted = [...resRes.data.results]
          .sort((a, b) => (b.datetime_utc ?? '').localeCompare(a.datetime_utc ?? ''))
          .slice(0, 5);

        dispatch({
          type: 'success',
          data: {
            upcoming,
            recent: recentSorted,
            standings: (standRes.data ?? []).slice(0, 10),
            featured,
            highlights: hlRes.data,
          },
        });
      })
      .catch(() => dispatch({ type: 'error', message: 'Failed to load overview' }));
  }, [eventId]);

  if (state.loading) return <div className="py-10 flex items-center justify-center"><div className="spinner" /></div>;
  if (state.error)   return <p className="text-sm px-6 py-6" style={{ color: 'var(--red)' }}>{state.error}</p>;
  if (!state.data)   return null;

  const { upcoming, recent, standings, featured, highlights } = state.data;

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      {featured && (
        <FeaturedMatch m={featured} teamLogos={teamLogos} onClick={() => onMatchSelect(featured.id)} />
      )}

      {highlights && <HighlightsRow highlights={highlights} />}

      <MissingDataNote items={MISSING_LEAGUE_FIELDS} />

      <div
        className="grid items-start"
        style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 20 }}
      >
        <StandingsCard standings={standings} teamLogos={teamLogos} teamShortNames={teamShortNames} />

        <div className="flex flex-col" style={{ gap: 16 }}>
          <SideRail title="Upcoming matches" onViewAll={onViewAllMatches}>
            {upcoming.length === 0 ? (
              <EmptyRail label="No upcoming matches" />
            ) : (
              upcoming.map((m, i) => (
                <UpcomingRow
                  key={m.id}
                  m={m}
                  isLast={i === upcoming.length - 1}
                  teamLogos={teamLogos}
                  teamShortNames={teamShortNames}
                  onClick={() => onMatchSelect(m.id)}
                />
              ))
            )}
          </SideRail>

          <SideRail title="Recent results" onViewAll={onViewAllMatches}>
            {recent.length === 0 ? (
              <EmptyRail label="No results yet." />
            ) : (
              recent.map((m, i) => (
                <RecentRow
                  key={m.id}
                  m={m}
                  isLast={i === recent.length - 1}
                  teamLogos={teamLogos}
                  teamShortNames={teamShortNames}
                  onClick={() => onMatchSelect(m.id)}
                />
              ))
            )}
          </SideRail>
        </div>
      </div>
    </div>
  );
}

/* ── Highlights row (Player of Month · Inform Team · Must Pick) ──────── */

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

const CARD_H = 210;
const CARD_RADIUS = 14;
const CARD_BORDER = '1px solid var(--accent-border)';

function HighlightsRow({ highlights }: { highlights: EventHighlights }) {
  const { player_of_month, inform_team, must_pick } = highlights;
  const hasAny = player_of_month || inform_team || must_pick;
  if (!hasAny) return null;

  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}
    >
      {/* Player of the Month */}
      <div
        style={{
          position: 'relative',
          height: CARD_H,
          borderRadius: CARD_RADIUS,
          border: CARD_BORDER,
          overflow: 'hidden',
          background: '#000',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {player_of_month ? (
          <>
            {player_of_month.team_logo && (
              <img
                src={player_of_month.team_logo}
                alt=""
                aria-hidden
                style={{
                  position: 'absolute',
                  top: '50%', left: '50%',
                  transform: 'translate(-50%, -40%)',
                  width: 400, height: 400,
                  objectFit: 'contain',
                  filter: 'blur(20px) brightness(0.65)',
                  opacity: 1,
                }}
              />
            )}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)',
            }} />
            {player_of_month.image && (
              <img
                src={player_of_month.image}
                alt={player_of_month.name}
                style={{
                  position: 'absolute', inset: 0,
                  width: '100%', height: '100%',
                  objectFit: 'contain', objectPosition: '50% 20%',
                }}
              />
            )}
            {/* Top: label + role icon */}
            <div style={{
              position: 'absolute', top: 11, left: 13, right: 13,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{
                fontSize: 9, letterSpacing: '0.13em', fontWeight: 700,
                color: 'var(--accent-2)', textTransform: 'uppercase',
              }}>
                Player of the Month
              </span>
              {ROLE_ICON[player_of_month.role] && (
                <img
                  src={ROLE_ICON[player_of_month.role]}
                  alt={player_of_month.role}
                  style={{ width: 16, height: 16, filter: 'brightness(0) invert(1)', flexShrink: 0 }}
                />
              )}
            </div>
            {/* Bottom: team + player name + stats */}
            <div style={{ position: 'absolute', bottom: 13, left: 14, right: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                {player_of_month.team_logo && (
                  <img src={player_of_month.team_logo} alt={player_of_month.team}
                    style={{ width: 16, height: 16, objectFit: 'contain' }} />
                )}
                <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>
                  {player_of_month.team}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: 22, fontWeight: 700, color: '#fff',
                  letterSpacing: '-0.02em', lineHeight: 1, flex: '1 1 0', minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {player_of_month.name}
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexShrink: 0 }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
                    {player_of_month.avg_kills}/{player_of_month.avg_deaths}/{player_of_month.avg_assists}
                  </span>
                  <span style={{ color: 'var(--accent-2)', fontSize: 12, fontWeight: 700 }}>
                    {player_of_month.kda} KDA
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-(--text-faint)" style={{ fontSize: 12 }}>
            No data yet
          </div>
        )}
      </div>

      {/* Inform Team */}
      <div
        style={{
          position: 'relative',
          height: CARD_H,
          borderRadius: CARD_RADIUS,
          border: CARD_BORDER,
          overflow: 'hidden',
          background: '#000',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {inform_team ? (
          <>
            {inform_team.logo && (
              <img
                src={inform_team.logo}
                alt=""
                aria-hidden
                style={{
                  position: 'absolute',
                  top: '50%', left: '50%',
                  transform: 'translate(-50%, -40%)',
                  width: 400, height: 400,
                  objectFit: 'contain',
                  filter: 'blur(24px) brightness(0.5)',
                  opacity: 0.85,
                }}
              />
            )}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)',
            }} />
            {/* Label */}
            <div style={{ position: 'absolute', top: 11, left: 13 }}>
              <span style={{
                fontSize: 9, letterSpacing: '0.13em', fontWeight: 700,
                color: 'var(--accent-2)', textTransform: 'uppercase',
              }}>
                Inform Team
              </span>
            </div>
            {/* Centered logo */}
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {inform_team.logo ? (
                <img src={inform_team.logo} alt={inform_team.team}
                  style={{ width: 120, height: 120, objectFit: 'contain' }} />
              ) : (
                <div style={{
                  width: 80, height: 80, borderRadius: 16,
                  background: 'var(--accent)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: '#fff', fontSize: 28, fontWeight: 700,
                }}>
                  {inform_team.team.charAt(0)}
                </div>
              )}
            </div>
            {/* Bottom */}
            <div style={{ position: 'absolute', bottom: 13, left: 14, right: 14 }}>
              <div style={{
                fontSize: 20, fontWeight: 700, color: '#fff',
                letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 6,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {inform_team.team}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FormChips form={inform_team.form} />
                <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginLeft: 'auto' }}>
                  {inform_team.wins}W–{inform_team.played - inform_team.wins}L
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-(--text-faint)" style={{ fontSize: 12 }}>
            No data yet
          </div>
        )}
      </div>

      {/* Must Pick */}
      <div
        style={{
          position: 'relative',
          height: CARD_H,
          borderRadius: CARD_RADIUS,
          border: CARD_BORDER,
          overflow: 'hidden',
          background: 'linear-gradient(135deg, var(--accent-muted) 0%, transparent 55%, var(--accent-muted) 100%)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {must_pick ? (
          <>
            {/* Splash art background */}
            <img
              src={must_pick.splash_url}
              alt=""
              aria-hidden
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'cover', objectPosition: 'center top',
              }}
            />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)',
            }} />
            {/* Purple glow */}
            <div style={{
              position: 'absolute', top: -24, right: -24, width: 88, height: 88,
              borderRadius: '50%', background: 'rgba(109,40,217,0.25)',
              filter: 'blur(28px)', pointerEvents: 'none',
            }} />
            {/* Label */}
            <div style={{ position: 'absolute', top: 11, left: 13 }}>
              <span style={{
                fontSize: 9, letterSpacing: '0.13em', fontWeight: 700,
                color: 'var(--accent-2)', textTransform: 'uppercase',
              }}>
                Must Pick
              </span>
            </div>
            {/* Bottom */}
            <div style={{ position: 'absolute', bottom: 13, left: 14, right: 14 }}>
              <div style={{
                fontSize: 20, fontWeight: 700, color: '#fff',
                letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 6,
              }}>
                {must_pick.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {must_pick.win_rate !== null && (
                  <span style={{
                    fontSize: 13, fontWeight: 700, color: must_pick.win_rate >= 60 ? 'var(--green)' : 'var(--amber)',
                  }}>
                    {must_pick.win_rate}% WR
                  </span>
                )}
                <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginLeft: 'auto' }}>
                  {must_pick.wins}W–{must_pick.picks - must_pick.wins}L · {must_pick.picks}p
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-(--text-faint)" style={{ fontSize: 12 }}>
            No data yet
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Featured match card ─────────────────────────────────────────────── */

function FeaturedMatch({
  m, teamLogos, onClick,
}: {
  m: Match;
  teamLogos: Record<string, string | null>;
  onClick: () => void;
}) {
  const dt = m.datetime_utc ? new Date(m.datetime_utc) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="card card-soft-shadow w-full text-left transition-all hover:bg-(--surface-hover)"
      style={{
        padding: '22px 28px',
        background: 'linear-gradient(135deg, var(--accent-muted) 0%, transparent 50%, var(--accent-muted) 100%)',
        borderRadius: 16,
      }}
    >
      <div className="flex items-center gap-2" style={{ marginBottom: 14 }}>
        <span
          className="font-bold uppercase"
          style={{ fontSize: 10.5, color: 'var(--accent)', letterSpacing: '0.12em' }}
        >
          Featured · Next match
        </span>
        <span style={{ color: 'var(--text-faint)' }}>·</span>
        <span
          className="text-(--text-dim) font-semibold uppercase"
          style={{ fontSize: 11, letterSpacing: '0.08em' }}
        >
          BO{m.best_of}{m.tab ? ` · ${m.tab}` : ''}
        </span>
        {dt && (
          <span className="text-(--text-dim) tabular-nums ml-auto" style={{ fontSize: 11.5 }}>
            {dt.toLocaleString(undefined, {
              weekday: 'short', month: 'short', day: 'numeric',
              hour: 'numeric', minute: '2-digit',
            })}
          </span>
        )}
      </div>

      <div className="flex items-center" style={{ gap: 18 }}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <TeamMark short={m.team1} logo={teamLogos[m.team1]} size={44} />
          <div className="min-w-0">
            <div
              className="font-display"
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: 'var(--text-h)',
                letterSpacing: '-0.015em',
                lineHeight: 1.1,
              }}
            >
              {m.team1}
            </div>
          </div>
        </div>
        <span
          className="font-bold uppercase tabular-nums"
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text-dim)',
            padding: '6px 10px',
            background: 'var(--surface-sub)',
            borderRadius: 7,
            letterSpacing: '0.04em',
          }}
        >
          BO{m.best_of}
        </span>
        <div className="flex items-center gap-3 flex-1 min-w-0 flex-row-reverse">
          <TeamMark short={m.team2} logo={teamLogos[m.team2]} size={44} />
          <div className="min-w-0 text-right">
            <div
              className="font-display"
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: 'var(--text-h)',
                letterSpacing: '-0.015em',
                lineHeight: 1.1,
              }}
            >
              {m.team2}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

/* ── Standings card (top 10) ─────────────────────────────────────────── */

function StandingsCard({
  standings, teamLogos, teamShortNames,
}: {
  standings: StandingsEntry[];
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
}) {
  return (
    <div
      className="card card-soft-shadow overflow-hidden"
      style={{ borderRadius: 12 }}
    >
      <div
        className="flex items-baseline justify-between"
        style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-baseline gap-2.5">
          <h2
            className="font-sans"
            style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)', letterSpacing: '-0.005em' }}
          >
            Standings
          </h2>
          <span className="text-(--text-dim)" style={{ fontSize: 11.5 }}>· Top 10</span>
        </div>
        <Badge tone="accent">Top 6 → Playoffs</Badge>
      </div>

      {standings.length === 0 ? (
        <p
          className="text-(--text-dim) text-center"
          style={{ padding: '40px 20px', fontSize: 13 }}
        >
          No standings data yet.
        </p>
      ) : (
        <table className="w-full font-sans" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-sub)' }}>
              <Th width={40} align="center">#</Th>
              <Th align="left">Team</Th>
              <Th>W</Th>
              <Th>L</Th>
              <Th>Win%</Th>
              <Th align="right">Form</Th>
              <Th>Kills</Th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => {
              const total = s.wins + s.losses;
              const pct = total > 0 ? (s.wins / total) * 100 : 0;
              const playoffs = s.placement <= 6;
              return (
                <tr
                  key={s.team}
                  className="transition-colors hover:bg-(--surface-sub)"
                  style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
                >
                  <td
                    className="tabular-nums font-semibold relative"
                    style={{
                      padding: '12px 12px',
                      textAlign: 'center',
                      color: 'var(--text-dim)',
                      fontSize: 12,
                    }}
                  >
                    {playoffs && (
                      <span
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 6,
                          bottom: 6,
                          width: 3,
                          background: s.placement <= 2 ? 'var(--accent)' : 'var(--accent-2)',
                          borderRadius: '0 2px 2px 0',
                          opacity: s.placement <= 2 ? 1 : 0.45,
                        }}
                      />
                    )}
                    {s.placement}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <div className="flex items-center" style={{ gap: 12 }}>
                      <TeamMark
                        short={teamShortNames[s.team] || s.team}
                        logo={teamLogos[s.team] ?? s.logo}
                        size={28}
                      />
                      <div>
                        <div className="text-(--text-h) font-semibold" style={{ fontSize: 13.5 }}>
                          {s.team}
                        </div>
                      </div>
                    </div>
                  </td>
                  <Td color="var(--green)" weight={600}>{s.wins}</Td>
                  <Td color="var(--red)" weight={600}>{s.losses}</Td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    <div className="inline-flex justify-end">
                      <WinRateBar wr={pct} width={60} />
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    {/* form data missing in API — empty for now */}
                    <FormChips form={[]} />
                    <span className="text-(--text-faint)" style={{ fontSize: 11 }}>—</span>
                  </td>
                  <Td color="var(--text)">{s.kills.toLocaleString()}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Th({ children, width, align = 'right' }: { children: React.ReactNode; width?: number; align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: '11px 14px',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-dim)',
        width,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, color, weight }: { children: React.ReactNode; color?: string; weight?: number }) {
  return (
    <td
      className="tabular-nums"
      style={{
        padding: '12px 14px',
        textAlign: 'right',
        color: color || 'var(--text-h)',
        fontWeight: weight || 500,
        fontSize: 13,
      }}
    >
      {children}
    </td>
  );
}

/* ── Side rail ───────────────────────────────────────────────────────── */

function SideRail({
  title, onViewAll, children,
}: {
  title: string;
  onViewAll: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="side-rail">
      <div className="side-rail-header">{title}</div>
      {children}
      <button
        type="button"
        className="side-rail-footer w-full text-left transition-colors hover:bg-(--surface-sub)"
        onClick={onViewAll}
      >
        View all →
      </button>
    </div>
  );
}

function EmptyRail({ label }: { label: string }) {
  return (
    <div
      className="text-(--text-dim) text-center"
      style={{ padding: '24px 18px', fontSize: 12.5 }}
    >
      {label}
    </div>
  );
}

function UpcomingRow({
  m, isLast, teamLogos, teamShortNames, onClick,
}: {
  m: Match;
  isLast: boolean;
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
  onClick: () => void;
}) {
  const dt = m.datetime_utc ? new Date(m.datetime_utc) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center transition-colors hover:bg-(--surface-sub) text-left"
      style={{
        padding: '11px 18px',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        gap: 12,
      }}
    >
      <div
        className="tabular-nums font-medium text-(--text-dim) shrink-0"
        style={{ minWidth: 60, fontSize: 11 }}
      >
        {dt ? dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'TBD'}
      </div>
      <div className="flex-1 flex items-center min-w-0" style={{ gap: 8 }}>
        <TeamMark short={teamShortNames[m.team1] || m.team1} logo={teamLogos[m.team1]} size={20} />
        <span className="text-(--text) font-medium" style={{ fontSize: 12.5 }}>
          {teamShortNames[m.team1] || m.team1}
        </span>
        <span className="text-(--text-faint)" style={{ fontSize: 10.5, margin: '0 4px' }}>vs</span>
        <TeamMark short={teamShortNames[m.team2] || m.team2} logo={teamLogos[m.team2]} size={20} />
        <span className="text-(--text) font-medium" style={{ fontSize: 12.5 }}>
          {teamShortNames[m.team2] || m.team2}
        </span>
      </div>
      <span
        className="font-bold text-(--text-dim) shrink-0"
        style={{ fontSize: 10, letterSpacing: '0.06em' }}
      >
        BO{m.best_of}
      </span>
    </button>
  );
}

function RecentRow({
  m, isLast, teamLogos, teamShortNames, onClick,
}: {
  m: Match;
  isLast: boolean;
  teamLogos: Record<string, string | null>;
  teamShortNames: Record<string, string>;
  onClick: () => void;
}) {
  const t1Win = m.winner === 1;
  const dt = m.datetime_utc ? new Date(m.datetime_utc) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center transition-colors hover:bg-(--surface-sub) text-left"
      style={{
        padding: '11px 18px',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        gap: 12,
      }}
    >
      <div
        className="tabular-nums text-(--text-dim) shrink-0"
        style={{ minWidth: 36, fontSize: 11 }}
      >
        {dt ? dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
      </div>
      <div className="flex-1 flex items-center min-w-0" style={{ gap: 8 }}>
        <TeamMark short={teamShortNames[m.team1] || m.team1} logo={teamLogos[m.team1]} size={20} />
        <span
          className={t1Win ? 'text-(--text-h) font-semibold' : 'text-(--text-dim) font-medium'}
          style={{ fontSize: 12.5 }}
        >
          {teamShortNames[m.team1] || m.team1}
        </span>
        <span
          className="font-bold tabular-nums text-(--text-dim)"
          style={{ fontSize: 12, margin: '0 4px' }}
        >
          {m.team1_score}–{m.team2_score}
        </span>
        <TeamMark short={teamShortNames[m.team2] || m.team2} logo={teamLogos[m.team2]} size={20} />
        <span
          className={!t1Win ? 'text-(--text-h) font-semibold' : 'text-(--text-dim) font-medium'}
          style={{ fontSize: 12.5 }}
        >
          {teamShortNames[m.team2] || m.team2}
        </span>
      </div>
    </button>
  );
}
