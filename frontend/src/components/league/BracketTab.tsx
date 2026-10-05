import { useEffect, useMemo, useReducer, useState } from 'react';
import { useRevalidator } from 'react-router-dom';
import { getMatches, getEventRosters, getBracketRounds } from '../../api/core';
import type { Match } from '../../types/models';
import { TeamMark } from './shared';
import { Select } from '../ui/Select';
import { buildPlayoffs, type PlayoffMatch, type PlayoffLane } from '../../lib/playoffStructure';
import PlayoffOverview from './PlayoffOverview';
import BracketEditor from './BracketEditor';
import './Playoffs.css';

interface Props {
  eventId: number;
  stageId?: number;
  tabFilter?: string[];
  tabPrefix?: string;
  teamLogos: Record<string, string | null>;
  teamShortNames?: Record<string, string>;
  onMatchSelect: (id: number) => void;
  noBorder?: boolean;
  preloadedMatches?: Match[];
  eventName?: string;
}
interface State {
  matches: Match[]; loading: boolean; error: string | null;
  logos: Record<string, string | null>; shorts: Record<string, string>;
}
type Action = { type: 'matches'; matches: Match[] } | { type: 'fetch' } | { type: 'error' }
  | { type: 'meta'; logos: State['logos']; shorts: State['shorts'] };
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'matches': return { ...state, loading: false, error: null, matches: action.matches };
    case 'fetch': return { ...state, loading: true, error: null };
    case 'error': return { ...state, loading: false, error: 'Could not load playoff matches.' };
    case 'meta': return { ...state, logos: action.logos, shorts: action.shorts };
  }
}
function dateRange(matches: Match[]) {
  const dates = matches.map(m => m.datetime_utc).filter((d): d is string => !!d).sort();
  if (!dates.length) return 'Schedule pending';
  const format = (date: string) => new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const first = format(dates[0]), last = format(dates.at(-1)!);
  return first === last ? first : `${first} – ${last}`;
}
// Keep the current view when returning from a match page during this session.
const viewSelections = new Map<string, string>();

export default function BracketTab({ eventId, stageId, tabFilter, tabPrefix, teamLogos, teamShortNames = {}, onMatchSelect, noBorder, preloadedMatches, eventName }: Props) {
  const revalidator = useRevalidator();
  const [state, dispatch] = useReducer(reducer, {
    matches: preloadedMatches ?? [], loading: preloadedMatches == null, error: null, logos: {}, shorts: {},
  });
  const viewKey = `${eventId}:${stageId ?? ''}:${tabFilter?.join(',') ?? ''}:${tabPrefix ?? ''}`;
  const [roundLabels, setRoundLabels] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    getBracketRounds(eventId, viewKey).then(r => { if (!cancelled) setRoundLabels(r.data.rounds); }).catch(() => {});
    return () => { cancelled = true; };
  }, [eventId, viewKey, preloadedMatches]);
  const [selectedTeam, setSelectedTeam] = useState(() => viewSelections.get(viewKey) ?? '');
  useEffect(() => { viewSelections.set(viewKey, selectedTeam); }, [viewKey, selectedTeam]);
  useEffect(() => {
    if (preloadedMatches != null) { dispatch({ type: 'matches', matches: preloadedMatches }); return; }
    let cancelled = false;
    dispatch({ type: 'fetch' });
    getMatches({ event: eventId, page_size: 500, ...(stageId != null ? { stage: stageId } : {}) })
      .then(r => { if (!cancelled) dispatch({ type: 'matches', matches: r.data.results }); })
      .catch(() => { if (!cancelled) dispatch({ type: 'error' }); });
    getEventRosters(eventId).then(r => {
      if (cancelled) return;
      const logos: State['logos'] = {}, shorts: State['shorts'] = {};
      for (const team of r.data.results) {
        if (!team.name) continue;
        logos[team.name] = team.org?.logo ?? null;
        shorts[team.name] = team.org?.short_name || team.name;
      }
      dispatch({ type: 'meta', logos, shorts });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [eventId, stageId, preloadedMatches]);
  const matches = useMemo(() => state.matches.filter(m =>
    !tabFilter?.length && !tabPrefix || !!tabFilter?.includes(m.tab) || !!(tabPrefix && m.tab.startsWith(tabPrefix)),
  ), [state.matches, tabFilter, tabPrefix]);
  const structure = useMemo(() => buildPlayoffs(matches, roundLabels), [matches, roundLabels]);
  const { rounds, teams, champion, doubleElimination } = structure;
  const logos = { ...teamLogos, ...state.logos }, shorts = { ...teamShortNames, ...state.shorts };
  const visibleRounds = rounds.map(r => ({ ...r, matches: r.matches.filter(e => e.match.team1 === selectedTeam || e.match.team2 === selectedTeam) }))
    .filter(r => r.matches.length);
  const laneLabel = (lane: PlayoffLane) => lane === 'placement' ? 'Placement' : lane === 'final' ? doubleElimination ? 'Grand final' : 'Final' : lane === 'lower' ? 'Lower bracket' : doubleElimination ? 'Upper bracket' : 'Knockout';
  if (state.loading) return <p className="po-empty" role="status">Loading playoff matches…</p>;
  if (state.error) return <p className="po-empty" role="alert">{state.error}</p>;
  if (!matches.length) return <p className="po-empty">Playoff fixtures haven’t been announced yet.</p>;

  return <section className={`po-view${noBorder ? ' po-view--embedded' : ''}`} aria-label="Playoff matches">
    {!noBorder && eventName && <h2 className="po-event-name">{eventName}</h2>}
    <div className="po-toolbar">
      <div className="po-format"><span className="po-format-dot" />{doubleElimination ? 'Double elimination' : 'Knockout'}<span>·</span>{teams.length} teams</div>
    {champion && <div className="po-champion"><TeamMark short={shorts[champion] || champion} logo={logos[champion]} size={36}/><div><span>Champions</span><strong>{champion}</strong></div><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M7 3h10v5a5 5 0 0 1-10 0V3Zm0 2H3v2a5 5 0 0 0 5 5m9-7h4v2a5 5 0 0 1-5 5m-4 1v7m-4 0h8"/></svg></div>}
      <Select ariaLabel="Follow a team" value={selectedTeam} options={[{ value: '', label: 'All teams' }, ...teams.map(team => ({ value: team, label: team }))]} onChange={team => setSelectedTeam(String(team))} align="right" />
    </div>
    <BracketEditor eventId={eventId} rounds={rounds} matches={matches} shorts={shorts} scope={viewKey} onSaved={(updated, labels) => {
      setRoundLabels(labels);
      const saved = new Map(updated.map(m => [m.id, m]));
      dispatch({ type: 'matches', matches: state.matches.map(m => saved.get(m.id) ?? m) });
      void revalidator.revalidate();
    }}/>
    {rounds.length > 0 ? <PlayoffOverview rounds={rounds} doubleElimination={doubleElimination} logos={logos} shorts={shorts} selectedTeam={selectedTeam} onMatchSelect={onMatchSelect}/> : <p className="po-empty">No matches are placed in this bracket. An admin can restore them from the unplaced list.</p>}
    {selectedTeam && <div className="po-journey-title"><TeamMark short={shorts[selectedTeam] || selectedTeam} logo={logos[selectedTeam]} size={32}/><div><h3>{selectedTeam}’s run</h3><p>Every series, from the opening match onward.</p></div><button type="button" onClick={() => setSelectedTeam('')} aria-label="Clear team filter">Clear ×</button></div>}
    {selectedTeam && <div className="po-rounds">
      {visibleRounds.map(round => <section key={round.key} className="po-round-section" aria-label={`${round.label} matches`}>
        <div className="po-round-heading"><div><span className="po-round-eyebrow">{selectedTeam ? 'TEAM PROGRESSION' : 'PLAYOFFS'}</span><h3>{round.label}</h3></div><span>{dateRange(round.matches.map(e => e.match))}</span></div>
        <div className={`po-lanes${round.matches.some(e => e.lane === 'final') ? ' po-lanes--final' : ''}`}>
          {(['upper','lower','final','placement'] as const).map(lane => {
            const entries = round.matches.filter(e => e.lane === lane);
            if (!entries.length) return null;
            return <div key={lane} className={`po-lane po-lane--${lane}`}>
              <div className="po-lane-heading"><span className="po-lane-symbol" aria-hidden="true">{lane === 'upper' ? '↗' : lane === 'lower' ? '↳' : '◇'}</span><strong>{laneLabel(lane)}</strong>{lane === 'lower' && <span>Elimination series</span>}</div>
              <div className="po-cards">{entries.map(entry => <PlayoffCard key={entry.match.id} entry={entry} logos={logos} shorts={shorts} selectedTeam={selectedTeam} onMatchSelect={onMatchSelect} laneLabel={laneLabel}/>)}</div>
            </div>;
          })}
        </div>
      </section>)}
    </div>}
  </section>;
}

function PlayoffCard({ entry, logos, shorts, selectedTeam, onMatchSelect, laneLabel }: {
  entry: PlayoffMatch; logos: Record<string,string | null>; shorts: Record<string,string>;
  selectedTeam: string; onMatchSelect: (id:number) => void; laneLabel: (lane: PlayoffLane) => string;
}) {
  const { match: m, winnerNext, loserNext } = entry;
  const done = m.winner != null;
  const winner = m.winner === 1 ? m.team1 : m.team2;
  const loser = m.winner === 1 ? m.team2 : m.team1;
  const date = m.datetime_utc ? new Date(m.datetime_utc) : null;
  const time = date?.toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'});
  const followingLoss = done && selectedTeam === loser;
  const progression = followingLoss
    ? loserNext ? `${shorts[loser] || loser} → ${laneLabel(loserNext.lane)} · ${loserNext.round}` : `${shorts[loser] || loser} ${entry.lane === 'lower' ? 'eliminated' : entry.lane === 'final' ? 'runner-up' : 'lost this series'}`
    : winnerNext ? `${done ? shorts[winner] || winner : 'Winner'} → ${winnerNext.round}${winnerNext.lane === 'lower' ? ' · Lower bracket' : ''}` : entry.lane === 'final' && done ? `${shorts[winner] || winner} wins the final` : done ? 'Series complete' : 'Winner advances';
  return <button type="button" className={`po-match${entry.lane === 'final' ? ' po-match--final' : ''}`} onClick={() => onMatchSelect(m.id)} aria-label={`${m.team1} ${done ? m.team1_score : 'vs'} ${m.team2} ${done ? m.team2_score : ''} — Match details`}>
    <div className="po-match-meta"><span>{date ? date.toLocaleDateString('en-GB', {day:'numeric',month:'short'}) : 'Date pending'}{time && <> · {time}</>}</span><span>BO{m.best_of}<span className="po-meta-divider">/</span>{done ? 'Completed' : 'Scheduled'}</span></div>
    <div className="po-match-teams">{[m.team1, m.team2].map((team,i) => <div key={i} className={`po-team${m.winner === i+1 ? ' is-winner' : ''}${selectedTeam === team ? ' is-followed' : ''}`}>
      <TeamMark short={shorts[team] || team || 'TBD'} logo={logos[team]} size={34}/><span>{team || 'TBD'}</span>{m.winner === i+1 && <span className="po-win-mark" aria-label="Winner">✓</span>}<strong>{done ? i === 0 ? m.team1_score : m.team2_score : '–'}</strong>
    </div>)}</div>
    <div className="po-match-footer"><span>{progression}</span><span aria-hidden="true">↗</span></div>
    {loserNext && !followingLoss && <div className="po-drop">{shorts[loser] || loser} → {laneLabel(loserNext.lane)} · {loserNext.round}</div>}
  </button>;
}
