import { useState } from 'react';
import EsportsLayout from '../components/EsportsLayout';
import './WorldsPredictionsPage.css';

const STAGES = ['Play-In', 'Swiss Stage', 'Knockout'] as const;
type Stage = typeof STAGES[number];
type Team = { id: string; name: string; shortName: string };
type PredictionMatch = {
  id: string;
  stage: Stage;
  round: string;
  schedule: string;
  bestOf: 1 | 3 | 5;
  teams: [Team, Team];
};

const TEAMS = {
  t1: { id: 't1', name: 'T1', shortName: 'T1' },
  gen: { id: 'gen', name: 'Gen.G', shortName: 'GEN' },
  g2: { id: 'g2', name: 'G2 Esports', shortName: 'G2' },
  blg: { id: 'blg', name: 'Bilibili Gaming', shortName: 'BLG' },
  fnc: { id: 'fnc', name: 'Fnatic', shortName: 'FNC' },
  tl: { id: 'tl', name: 'Team Liquid', shortName: 'TL' },
  gam: { id: 'gam', name: 'GAM Esports', shortName: 'GAM' },
  psg: { id: 'psg', name: 'PSG Talon', shortName: 'PSG' },
} satisfies Record<string, Team>;

// Illustrative fixtures only; these are not the official Worlds schedule or field.
const MATCHES: PredictionMatch[] = [
  { id: 'play-1', stage: 'Play-In', round: 'Opening round', schedule: 'Oct 10 · 12:00 UTC', bestOf: 3, teams: [TEAMS.gam, TEAMS.psg] },
  { id: 'play-2', stage: 'Play-In', round: 'Opening round', schedule: 'Oct 10 · 15:00 UTC', bestOf: 3, teams: [TEAMS.fnc, TEAMS.tl] },
  { id: 'swiss-1', stage: 'Swiss Stage', round: 'Round 1', schedule: 'Oct 15 · 12:00 UTC', bestOf: 1, teams: [TEAMS.t1, TEAMS.gen] },
  { id: 'swiss-2', stage: 'Swiss Stage', round: 'Round 1', schedule: 'Oct 15 · 13:00 UTC', bestOf: 1, teams: [TEAMS.g2, TEAMS.blg] },
  { id: 'swiss-3', stage: 'Swiss Stage', round: 'Round 1', schedule: 'Oct 15 · 14:00 UTC', bestOf: 1, teams: [TEAMS.fnc, TEAMS.gam] },
  { id: 'swiss-4', stage: 'Swiss Stage', round: 'Round 1', schedule: 'Oct 15 · 15:00 UTC', bestOf: 1, teams: [TEAMS.tl, TEAMS.psg] },
  { id: 'knockout-1', stage: 'Knockout', round: 'Quarterfinal · Example', schedule: 'Oct 29 · 12:00 UTC', bestOf: 5, teams: [TEAMS.t1, TEAMS.blg] },
  { id: 'knockout-2', stage: 'Knockout', round: 'Quarterfinal · Example', schedule: 'Oct 30 · 12:00 UTC', bestOf: 5, teams: [TEAMS.gen, TEAMS.g2] },
];

export default function WorldsPredictionsPage() {
  const [stage, setStage] = useState<Stage>('Swiss Stage');
  const [picks, setPicks] = useState<Record<string, string>>({});
  const matches = MATCHES.filter((match) => match.stage === stage);
  const picked = Object.keys(picks).length;
  const stagePicked = matches.filter((match) => picks[match.id]).length;

  function selectWinner(matchId: string, teamId: string) {
    setPicks((current) => {
      const next = { ...current };
      if (next[matchId] === teamId) delete next[matchId];
      else next[matchId] = teamId;
      return next;
    });
  }

  return (
    <EsportsLayout>
      <div className="worlds-predictions">
        <header className="wp-header">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="eyebrow">World Championship 2026</span>
              <span className="wp-preview">Preview</span>
            </div>
            <h1 className="h-display">Worlds 2026 Predictions</h1>
            <p className="wp-intro">Every match. Your call. Pick the team you think will win.</p>
          </div>
          <div className="wp-progress">
            <span className="wp-progress-count">{picked}<span> / {MATCHES.length}</span></span>
            <span className="wp-muted">Predictions made</span>
            <progress aria-label="Predictions made" value={picked} max={MATCHES.length} />
          </div>
        </header>

        <p className="wp-notice">Demo fixtures — teams, dates and matchups are illustrative. Picks stay on this page and reset when you leave or refresh.</p>

        <div className="wp-stages" role="group" aria-label="Tournament stage">
          {STAGES.map((item) => (
            <button key={item} type="button" aria-pressed={stage === item} onClick={() => setStage(item)}>
              {item}
              <span>{MATCHES.filter((match) => match.stage === item).length}</span>
            </button>
          ))}
        </div>

        <section aria-labelledby="wp-stage-heading">
          <div className="wp-section-header">
            <div>
              <h2 id="wp-stage-heading">{stage}</h2>
              <p>{stagePicked} of {matches.length} winners picked · Select a team to make your prediction.</p>
            </div>
            <button className="wp-reset" type="button" disabled={picked === 0} onClick={() => setPicks({})}>Reset all picks</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matches.map((match) => {
              const winner = match.teams.find((team) => team.id === picks[match.id]);
              return (
                <article className="wp-match" key={match.id} aria-label={`${match.teams[0].name} vs ${match.teams[1].name}`}>
                  <div className="wp-match-meta">
                    <span>{match.schedule}</span>
                    <span className="wp-format">BO{match.bestOf}</span>
                  </div>
                  <p className="wp-round">{match.round}</p>
                  <div className="wp-teams" role="group" aria-label="Pick the winner">
                    {match.teams.map((team, index) => (
                      <div className="wp-team-slot" key={team.id}>
                        {index === 1 && <span className="wp-vs" aria-hidden="true">VS</span>}
                        <button
                          type="button"
                          className="wp-team"
                          aria-pressed={winner?.id === team.id}
                          aria-label={`Pick ${team.name} to beat ${match.teams[1 - index].name}`}
                          onClick={() => selectWinner(match.id, team.id)}
                        >
                          <span className="wp-team-mark" aria-hidden="true">{team.shortName}</span>
                          <span className="wp-team-name">{team.name}</span>
                          <span className="wp-team-action">{winner?.id === team.id ? '✓ Selected' : 'Pick winner'}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className={`wp-match-footer${winner ? ' wp-match-footer--picked' : ''}`} role="status">
                    {winner ? `Your pick: ${winner.name}` : 'No prediction yet'}
                    {winner && <span>Click again to clear</span>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        <p className="wp-bottom-note">Choose freely. You can change your picks at any time in this preview.</p>
      </div>
    </EsportsLayout>
  );
}
