import { useEffect, useState } from 'react';
import { useLoaderData, useRevalidator } from 'react-router-dom';
import { canPickMatch, type WorldsData } from '../lib/worldsPredictions';
import { STAGES, STAGE_INFO, KNOCKOUT_SCHEDULE, WORLDS_SOURCES, type Stage } from '../data/worlds2026';
import './WorldsPredictionsPage.css';

function matchTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Time to be announced';
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
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
    <div className="wp-page es-scroll">
      <div className="wp-container">
        <header className="wp-header">
          <div>
            <p className="wp-eyebrow"><span className="wp-dot" /> League of Legends · World Championship</p>
            <h1>Worlds <span>2026</span></h1>
            <p className="wp-intro">Your picks. The world’s biggest stage.</p>
          </div>
          <button type="button" className="wp-button" disabled={state === 'loading'} onClick={() => void revalidate()}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M5.7 7a7 7 0 0 1 11.5-2L20 8M4 16l2.8 3A7 7 0 0 0 18.3 17" /></svg>
            {state === 'loading' ? 'Refreshing…' : 'Refresh schedule'}
          </button>
        </header>

        <div className="wp-overview" aria-label="Tournament overview">
          <div><span className="wp-label">Tournament dates</span><strong>15 Oct — 14 Nov</strong><span>2026 · United States</span></div>
          <div><span className="wp-label">The journey</span><strong>Three stages. One champion.</strong><span>Los Angeles → Allen → Brooklyn</span></div>
          <div className="wp-pick-summary">
            <span className="wp-label">Your predictions</span>
            <strong>{eligible.length ? `${picked} of ${eligible.length} picked` : 'Waiting for matchups'}</strong>
            {eligible.length ? <progress aria-label="Upcoming matches picked" value={picked} max={eligible.length} /> : <span>Choose a winner once matches are listed.</span>}
          </div>
        </div>

        <div className="wp-workspace">
          <div className="wp-main-column">
            <nav className="wp-stages" aria-label="Tournament stage">
              {stages.map((item) => (
                <button key={item} type="button" aria-pressed={stage === item} onClick={() => setStage(item)}>
                  <span>{item}</span>
                  <small>{STAGE_INFO[item as Stage]?.dates || 'More fixtures'}</small>
                </button>
              ))}
            </nav>
            <section className="wp-panel wp-match-panel" aria-labelledby="wp-stage-heading">
              <div className="wp-section-header">
                <div><h2 id="wp-stage-heading">{stage} matches</h2><p>{matches.length ? 'Select the team you think will win. All times in UTC.' : 'The schedule will appear here when it’s available.'}</p></div>
                {Object.keys(picks).length > 0 && <button className="wp-text-button" type="button" onClick={() => setPicks({})}>Clear picks</button>}
              </div>

              {matches.length === 0 && (
                <div className="wp-empty" role="status">
                  <span className="wp-empty-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-14 5h4" /></svg>
                  </span>
                  <h3>{events.length ? 'The next matchups are on their way' : 'The Worlds schedule is coming'}</h3>
                  <p>{events.length ? `There are no ${stage.toLowerCase()} matches listed yet. Check back after the next schedule update.` : 'Worlds 2026 fixtures haven’t been added yet. When they arrive, you’ll be able to choose your winners here.'}</p>
                  <span className="wp-empty-date">{stageInfo?.dates || 'Dates to be announced'}{stageInfo ? ' 2026' : ''}</span>
                </div>
              )}

              <div className="wp-match-list">
                {matches.map((match) => {
                  const names = [match.team1, match.team2];
                  const winner = names.includes(picks[match.id]) ? picks[match.id] : undefined;
                  const canPick = canPickMatch(match, now);
                  const finished = match.winner === 1 || match.winner === 2;
                  const status = finished ? `${names[match.winner! - 1]} wins · ${match.team1_score}–${match.team2_score}` : canPick ? (winner ? `Your pick: ${winner}` : 'Choose your winner') : 'Picks closed · Match started or details pending';
                  return (
                    <article className="wp-match" key={match.id} aria-label={`${match.team1 || 'TBD'} vs ${match.team2 || 'TBD'}`}>
                      <div className="wp-match-meta"><time>{matchTime(match.datetime_utc)}</time><span>{match.tab || stage} · {match.best_of ? `BO${match.best_of}` : 'Format TBD'}</span></div>
                      <div className="wp-teams" role="group" aria-label="Pick the winner">
                        {names.map((name, index) => {
                          const meta = teamByName.get(name);
                          const logo = meta?.logo || (index === 0 ? match.team1_logo : match.team2_logo);
                          const shortName = meta?.shortName || (index === 0 ? match.team1_short : match.team2_short) || name.slice(0, 3) || 'TBD';
                          return (
                            <div className="wp-team-slot" key={index}>
                              {index === 1 && <span className="wp-vs" aria-hidden="true">vs</span>}
                              <button type="button" className="wp-team" disabled={!canPick} aria-pressed={winner === name} aria-label={`Pick ${name || 'TBD'} to beat ${names[1 - index] || 'TBD'}`} onClick={() => selectWinner(match.id, name, Date.now())}>
                                <span className="wp-team-mark" aria-hidden="true">{logo ? <img src={logo} alt="" width={32} height={32} loading="lazy" /> : shortName}</span>
                                <span className="wp-team-name">{name || 'TBD'}</span>
                                <span className="wp-choice" aria-hidden="true">{winner === name ? '✓' : ''}</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div className={`wp-match-footer${winner ? ' wp-match-footer--picked' : ''}`} role="status">{status}{winner && canPick && <span>Click your pick again to clear</span>}</div>
                    </article>
                  );
                })}
              </div>
            </section>

            {teams.length > 0 && (
              <details className="wp-panel wp-rosters">
                <summary>Tournament teams <span>{teams.length} teams</span></summary>
                <div className="wp-region-grid">{regions.map((region) => (
                  <div className="wp-region" key={region}>
                    <h3>{region}</h3>
                    <ul>{teams.filter((team) => team.region === region).map((team) => <li key={team.name}>{team.logo && <img src={team.logo} alt="" width={24} height={24} loading="lazy" />}{team.name}</li>)}</ul>
                  </div>
                ))}</div>
              </details>
            )}
            <p className="wp-local-note">Your picks are kept for this visit. Leaving or refreshing the page clears them.</p>
          </div>

          <aside className="wp-sidebar" aria-label="Tournament guide">
            <section className="wp-panel wp-guide">
              <p className="wp-label">Tournament guide</p>
              <h2>The road to the final</h2>
              <ol className="wp-timeline">{STAGES.map((item, index) => (
                <li key={item} className={stage === item ? 'is-current' : ''}>
                  <span className="wp-step" aria-hidden="true">{index + 1}</span>
                  <div><strong>{item}</strong><span>{STAGE_INFO[item].dates}</span></div>
                </li>
              ))}</ol>
              {stageInfo && <div className="wp-venue"><span className="wp-label">Where they play</span><p>{stageInfo.venue}</p><p className="wp-format-description">{stageInfo.format}</p></div>}
              {stage === 'Knockout' && <div className="wp-round-schedule">{KNOCKOUT_SCHEDULE.map((round) => <div key={round.round}><strong>{round.round}</strong><span>{round.dates}</span></div>)}</div>}
              <a className="wp-source-link" href={WORLDS_SOURCES.schedule} target="_blank" rel="noreferrer">Official tournament details <span aria-hidden="true">↗</span></a>
            </section>

            <section className="wp-how-to">
              <span className="wp-label">Make your call</span>
              <h2>One match. One winner.</h2>
              <p>Choose a team to make your pick. Change your mind any time before the match starts.</p>
              <div><span aria-hidden="true">✓</span> Your selected team is highlighted.</div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}