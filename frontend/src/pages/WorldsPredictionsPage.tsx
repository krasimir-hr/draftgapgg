import { useEffect, useState } from 'react';
import { useLoaderData, useRevalidator } from 'react-router-dom';
import EsportsLayout from '../components/EsportsLayout';
import { canPickMatch, type WorldsData } from '../lib/worldsPredictions';
import { STAGES, STAGE_INFO, KNOCKOUT_SCHEDULE, WORLDS_CHECKED_ON, WORLDS_SOURCES, type Stage } from '../data/worlds2026';
import './WorldsPredictionsPage.css';

function matchTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Time to be announced';
  return `${new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;
}

export default function WorldsPredictionsPage() {
  const { events, matches: allMatches, teams } = useLoaderData() as WorldsData;
  const { revalidate, state } = useRevalidator();
  const [stage, setStage] = useState('Swiss Stage');
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const stages: string[] = [...STAGES, ...(allMatches.some((match) => match.predictionStage === 'Other matches') ? ['Other matches'] : [])];
  const matches = allMatches.filter((match) => match.predictionStage === stage);
  const eligible = allMatches.filter((match) => canPickMatch(match, now));
  const picked = eligible.filter((match) => picks[match.id] === match.team1 || picks[match.id] === match.team2).length;
  const stageInfo = STAGE_INFO[stage as Stage];
  const regions = [...new Set(teams.map((team) => team.region))];
  const teamByName = new Map(teams.map((team) => [team.name, team]));

  function selectWinner(matchId: number, team: string, selectedAt: number) {
    const match = allMatches.find((item) => item.id === matchId);
    if (!match || !canPickMatch(match, selectedAt)) return;
    setPicks((current) => {
      const next = { ...current };
      if (next[matchId] === team) delete next[matchId];
      else next[matchId] = team;
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
              <span className="wp-preview">{allMatches.length} matches</span>
            </div>
            <h1 className="h-display">Worlds 2026 Predictions</h1>
            <p className="wp-intro">15 October – 14 November 2026 · United States</p>
          </div>
          <div className="wp-progress">
            <span className="wp-progress-count">{picked}<span> / {eligible.length}</span></span>
            <span className="wp-muted">Upcoming matches picked</span>
            {eligible.length > 0 && <progress aria-label="Upcoming matches picked" value={picked} max={eligible.length} />}
          </div>
        </header>

        <div className="wp-notice wp-data-status">
          <span>Teams and fixtures from DraftGap · Times shown in UTC.</span>
          <button type="button" className="wp-reset" disabled={state === 'loading'} onClick={() => void revalidate()}>{state === 'loading' ? 'Refreshing…' : 'Refresh data'}</button>
        </div>

        {teams.length > 0 && (
          <section className="wp-qualified" aria-labelledby="wp-qualified-heading">
            <div className="wp-section-header"><div><h2 id="wp-qualified-heading">Tournament teams</h2><p>{teams.length} teams listed in the Worlds 2026 event rosters.</p></div></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {regions.map((region) => (
                <article className="wp-region" key={region} aria-label={`${region} teams`}>
                  <h3>{region}</h3>
                  <ul>{teams.filter((team) => team.region === region).map((team) => (
                    <li key={team.name}>{team.logo && <img src={team.logo} alt="" width={20} height={20} loading="lazy" />}{team.name}</li>
                  ))}</ul>
                </article>
              ))}
            </div>
          </section>
        )}

        <div className="wp-stages" role="group" aria-label="Tournament stage">
          {stages.map((item) => <button key={item} type="button" aria-pressed={stage === item} onClick={() => setStage(item)}>{item}<span>{allMatches.filter((match) => match.predictionStage === item).length}</span></button>)}
        </div>
        <section aria-labelledby="wp-stage-heading">
          <div className="wp-section-header">
            <div><h2 id="wp-stage-heading">{stage}</h2>{stageInfo && <p>{stageInfo.dates} 2026 · {stageInfo.venue}</p>}</div>
            {allMatches.length > 0 && <button className="wp-reset" type="button" disabled={Object.keys(picks).length === 0} onClick={() => setPicks({})}>Reset all picks</button>}
          </div>
          {stageInfo && <p className="wp-stage-format">{stageInfo.format}</p>}
          {stage === 'Knockout' && <div className="wp-round-schedule">{KNOCKOUT_SCHEDULE.map((round) => <div key={round.round}><strong>{round.round}</strong><span>{round.dates}</span><span>{round.venue}</span></div>)}</div>}
          {matches.length === 0 && (
            <div className="wp-awaiting" role="status">
              <h3>{events.length ? 'No matches listed yet' : 'Worlds 2026 is not listed yet'}</h3>
              <p>{events.length ? `The DraftGap API has no ${stage.toLowerCase()} fixtures yet. Refresh after the schedule is added.` : 'The API returned no Worlds 2026 event. Predictions will be available when its fixtures are added.'}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matches.map((match) => {
              const names = [match.team1, match.team2];
              const winner = names.includes(picks[match.id]) ? picks[match.id] : undefined;
              const canPick = canPickMatch(match, now);
              const finished = match.winner === 1 || match.winner === 2;
              const status = finished ? `${names[match.winner! - 1]} wins · ${match.team1_score}–${match.team2_score}` : canPick ? (winner ? `Your pick: ${winner}` : 'No prediction yet') : 'Picks unavailable · Match started or details pending';
              return (
                <article className="wp-match" key={match.id} aria-label={`${match.team1 || 'TBD'} vs ${match.team2 || 'TBD'}`}>
                  <div className="wp-match-meta"><span>{matchTime(match.datetime_utc)}</span><span className="wp-format">{match.best_of ? `BO${match.best_of}` : 'Format TBD'}</span></div>
                  <p className="wp-round">{match.tab || stage}</p>
                  <div className="wp-teams" role="group" aria-label="Pick the winner">
                    {names.map((name, index) => {
                      const meta = teamByName.get(name);
                      const logo = meta?.logo || (index === 0 ? match.team1_logo : match.team2_logo);
                      const shortName = meta?.shortName || (index === 0 ? match.team1_short : match.team2_short) || name.slice(0, 3) || 'TBD';
                      return (
                        <div className="wp-team-slot" key={index}>
                          {index === 1 && <span className="wp-vs" aria-hidden="true">VS</span>}
                          <button type="button" className="wp-team" disabled={!canPick} aria-pressed={winner === name} aria-label={`Pick ${name || 'TBD'} to beat ${names[1 - index] || 'TBD'}`} onClick={() => selectWinner(match.id, name, Date.now())}>
                            <span className="wp-team-mark" aria-hidden="true">{logo ? <img src={logo} alt="" width={48} height={48} loading="lazy" /> : shortName}</span>
                            <span className="wp-team-name">{name || 'TBD'}</span>
                            <span className="wp-team-action">{winner === name ? '✓ Selected' : canPick ? 'Pick winner' : 'Locked'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className={`wp-match-footer${winner ? ' wp-match-footer--picked' : ''}`} role="status">{status}{winner && canPick && <span>Click again to clear</span>}</div>
                </article>
              );
            })}
          </div>
        </section>
        <p className="wp-bottom-note">Picks stay on this page and reset when you leave or refresh. No predictions are submitted.</p>
        <p className="wp-bottom-note">Stage dates & venues: <a href={WORLDS_SOURCES.schedule} target="_blank" rel="noreferrer">Riot Games</a> · Checked {WORLDS_CHECKED_ON}.</p>
      </div>
    </EsportsLayout>
  );
}
