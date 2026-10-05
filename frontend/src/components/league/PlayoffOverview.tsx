import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { orderPlayoffRounds, type PlayoffMatch, type PlayoffRound } from '../../lib/playoffStructure';
import { leftConnectionPath } from '../../lib/bracketConnections';
import type { BracketEntry } from '../../lib/bracketEntries';
import { TeamMark } from './shared';

interface Props {
  entries: BracketEntry[];
  rounds: PlayoffRound[];
  doubleElimination: boolean;
  logos: Record<string, string | null>;
  shorts: Record<string, string>;
  selectedTeam: string;
  onMatchSelect: (id: number) => void;
}
interface Connection { id: string; path: string; lower: boolean; faded: boolean }

export default function PlayoffOverview({ entries, rounds, doubleElimination, logos, shorts, selectedTeam, onMatchSelect }: Props) {
  const arrowId = useId().replaceAll(':', '');
  const board = useRef<HTMLDivElement>(null);
  const displayRounds = useMemo(() => orderPlayoffRounds(rounds), [rounds]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const lowerDestinations = new Set(rounds.flatMap(r => r.matches.flatMap(e => [e.winnerNext?.matchId, e.loserNext?.matchId])).filter((id): id is number => id != null));
  const upperCount = Math.max(1, ...rounds.map(r => r.matches.filter(e => e.lane === 'upper').length));
  const lowerCount = Math.max(1, ...rounds.map(r => r.matches.filter(e => e.lane === 'lower').length));
  const hasLower = rounds.some(r => r.matches.some(e => e.lane === 'lower'));
  const hasPlacement = rounds.some(r => r.matches.some(e => e.lane === 'placement'));

  useEffect(() => {
    const root = board.current;
    if (!root) return;
    const measure = () => {
      const origin = root.getBoundingClientRect();
      const links: Connection[] = [];
      for (const round of rounds) for (const entry of round.matches) for (const kind of ['winner'] as const) {
        const next = kind === 'winner' ? entry.winnerNext : entry.loserNext;
        if (!next) continue;
        const from = root.querySelector<HTMLElement>(`[data-series="${entry.match.id}"]`)?.getBoundingClientRect();
        const to = root.querySelector<HTMLElement>(`[data-series="${next.matchId}"]`)?.getBoundingClientRect();
        if (!from || !to) continue;
        const sameColumn = to.left < from.right;
        if (sameColumn) continue;
        const path = leftConnectionPath(
          { x: from.left - origin.left, y: from.top + from.height * (kind === 'winner' ? .4 : .7) - origin.top, top: from.top - origin.top },
          { x: to.left - origin.left, y: to.top + to.height / 2 - origin.top, top: to.top - origin.top }, kind,
        );
        const team = kind === 'winner' ? entry.match.winner === 1 ? entry.match.team1 : entry.match.team2 : entry.match.winner === 1 ? entry.match.team2 : entry.match.team1;
        links.push({ id: `${entry.match.id}:${kind}`, path, lower: false, faded: !!selectedTeam && team !== selectedTeam });
      }
      for (const [index, entry] of entries.entries()) {
        if (entry.match_id == null) continue;
        const from = root.querySelector(`[data-qualified="${index}"]`)?.getBoundingClientRect();
        const to = root.querySelector(`[data-series="${entry.match_id}"]`)?.getBoundingClientRect();
        if (!from || !to) continue;
        const destination = rounds.flatMap(r => r.matches).find(e => e.match.id === entry.match_id)?.match;
        const rowOffset = destination?.team1 === entry.team ? 50 : destination?.team2 === entry.team ? 88 : to.height / 2;
        const x = from.right - origin.left, y = from.top + from.height / 2 - origin.top, tx = to.left - origin.left, ty = to.top + rowOffset - origin.top;
        links.push({ id: `entry:${index}`, lower: false, faded: !!selectedTeam && entry.team !== selectedTeam, path: `M ${x} ${y} H ${x + 12} V ${to.top - origin.top - 8} H ${tx - 9} V ${ty} H ${tx}` });
      }
      setConnections(links);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    measure();
    return () => observer.disconnect();
  }, [rounds, selectedTeam, entries]);

  const card = (entry: PlayoffMatch) => {
    const m = entry.match, done = m.winner != null;
    const followed = m.team1 === selectedTeam || m.team2 === selectedTeam;
    const date = m.datetime_utc ? new Date(m.datetime_utc).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Date pending';
    const loser = m.winner === 1 ? m.team2 : m.team1;
    return <button key={m.id} type="button" data-series={m.id} className={`po-mini${entry.lane === 'lower' && lowerDestinations.has(m.id) ? ' is-lower-connected' : ''}${entry.lane === 'final' ? ' po-mini--final' : ''}${selectedTeam && !followed ? ' is-muted' : ''}${followed ? ' is-followed' : ''}`} onClick={() => onMatchSelect(m.id)} aria-label={`${m.team1 || 'TBD'} vs ${m.team2 || 'TBD'}, ${done ? `${m.team1_score}–${m.team2_score}` : 'scheduled'}, ${date}${m.team1_origin ? `, ${m.team1}: ${m.team1_origin}` : ''}${m.team2_origin ? `, ${m.team2}: ${m.team2_origin}` : ''} — Match details`}>
      <div className="po-mini-meta"><span>{date}</span><span>BO{m.best_of}</span></div>
      {[m.team1, m.team2].map((team, i) => <div key={i} className={`po-mini-team${m.winner === i + 1 ? ' is-winner' : ''}`} title={[team || 'TBD', i === 0 ? m.team1_origin : m.team2_origin].filter(Boolean).join(' · ')}>
        <TeamMark short={shorts[team] || team || 'TBD'} logo={logos[team]} size={24}/><span className="po-team-identity"><span>{shorts[team] || team || 'TBD'}</span>{(i === 0 ? m.team1_origin : m.team2_origin) && <small className="po-team-origin" title={i === 0 ? m.team1_origin : m.team2_origin}>↳ {i === 0 ? m.team1_origin : m.team2_origin}</small>}</span>{m.winner === i + 1 && <small aria-label="Winner">✓</small>}<strong>{done ? i === 0 ? m.team1_score : m.team2_score : '–'}</strong>
      </div>)}
      {entry.loserOutcome && <div className={`po-mini-drop${entry.loserOutcome === 'eliminated' ? ' is-eliminated' : ''}`}>{entry.loserOutcome === 'lower' ? '↳ ' : ''}{done ? shorts[loser] || loser : 'Loser'} {entry.loserOutcome === 'eliminated' ? 'eliminated' : entry.loserOutcome === 'lower' ? 'to lower bracket' : 'continues'}</div>}
    </button>;
  };
  return <div className="po-overview-map">
    <div className="po-map-caption"><p>Every round. One view.</p><span>Click a series for match details</span></div>
    <p className="po-pan-hint">Scroll sideways to follow the bracket →</p>
    <div className="po-map-scroll" tabIndex={0} role="region" aria-label="Full playoff bracket">
      <div ref={board} className="po-map-board" style={{ '--round-count': rounds.length + 1, '--upper-height': `${upperCount * 132 + (upperCount - 1) * 16}px`, '--lower-height': `${lowerCount * 132 + (lowerCount - 1) * 16}px` } as CSSProperties}>
        <svg className="po-map-lines" aria-hidden="true"><defs><marker id={`${arrowId}-path`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent-border)"/></marker></defs>{connections.map(c => <path key={c.id} d={c.path} markerEnd={`url(#${arrowId}-path)`} className={`${c.lower ? 'is-lower' : ''}${c.faded ? ' is-muted' : ''}`}/>)}</svg>
        <section className="po-map-column po-qualified" aria-label="Qualified teams"><header className="po-map-round"><span>IN</span><h3>Qualified teams</h3></header><div className="po-map-lane-label">Entry into playoffs</div><div className="po-qualified-list">{entries.map((entry, index) => <div key={entry.team} data-qualified={index} className={`po-qualified-card${selectedTeam && selectedTeam !== entry.team ? ' is-muted' : ''}`} title={[entry.team, entry.label].filter(Boolean).join(' · ')}><TeamMark short={shorts[entry.team] || entry.team} logo={logos[entry.team]} size={28}/><div className="po-qualified-identity"><strong>{shorts[entry.team] || entry.team}</strong>{entry.label && <small>{entry.label}</small>}</div><span aria-hidden="true">→</span></div>)}</div></section>
        {displayRounds.map((round, i) => {
          const upper = round.matches.filter(e => e.lane === 'upper');
          const lower = round.matches.filter(e => e.lane === 'lower');
          const finals = round.matches.filter(e => e.lane === 'final');
          const placement = round.matches.filter(e => e.lane === 'placement');
          const finalOnly = finals.length > 0 && !upper.length && !lower.length;
          return <section key={round.key} className={`po-map-column${finalOnly ? ' po-map-column--final' : ''}`} aria-label={`${round.label} matches`}>
            <header className="po-map-round"><span>{String(i + 1).padStart(2, '0')}</span><h3>{round.label}</h3></header>
            {finalOnly ? <div className={`po-map-final${hasLower ? ' po-map-final--double' : ''}`}><h4>{doubleElimination ? 'Grand final' : 'Final'}</h4>{finals.map(card)}</div> : <>
              <div className="po-map-lane-label">{upper.length ? doubleElimination ? 'Upper bracket' : 'Knockout' : '\u00a0'}</div>
              <div className="po-map-upper">{upper.map(card)}{finals.map(card)}</div>
              {hasLower && <><div className="po-map-lane-label po-map-lane-label--lower">{lower.length ? 'Lower bracket' : '\u00a0'}</div><div className="po-map-lower">{lower.map(card)}</div></>}
            </>}
            {hasPlacement && <div className="po-map-placement">{placement.length > 0 && <h4>Placement</h4>}{placement.map(card)}</div>}
          </section>;
        })}
      </div>
    </div>
  </div>;
}
