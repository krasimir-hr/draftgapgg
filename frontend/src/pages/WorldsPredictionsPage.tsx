import { useEffect, useState } from 'react';
import { Link, useLoaderData, useRevalidator } from 'react-router-dom';
import { canPickMatch, type WorldsData } from '../lib/worldsPredictions';
import { STAGES, STAGE_INFO, type Stage } from '../data/worlds2026';
import './WorldsPredictionsPage.css';

function matchTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Time to be announced';
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
}

export default function WorldsPredictionsPage() {
  const data = useLoaderData() as WorldsData;
  return <Predictions key={data.demo ? 'demo' : 'live'} data={data} />;
}

function Predictions({ data }: { data: WorldsData }) {
  const { events, matches: allMatches, teams, demo } = data;
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
            <h1>Worlds <span>2026</span></h1>
            <p className="wp-intro">Predictions · 15 Oct – 14 Nov</p>
          </div>
          <div className="wp-header-actions">
          {!demo && <Link className="wp-button" to="?demo=1">Try demo matches</Link>}
          <button type="button" className="wp-button" disabled={state === 'loading'} onClick={() => { if (demo) setPicks({}); void revalidate(); }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M5.7 7a7 7 0 0 1 11.5-2L20 8M4 16l2.8 3A7 7 0 0 0 18.3 17" /></svg>
            {state === 'loading' ? 'Refreshing…' : demo ? 'Reset demo' : 'Refresh schedule'}
          </button>
          </div>
        </header>

        {demo && <section className="wp-demo-banner" aria-label="Demo mode">
          <div><strong>Demo mode · Sample matches</strong><p>Hypothetical teams, matchups and results for testing. Picks aren’t saved.</p></div>
          <Link className="wp-button" to="/worlds-2026/predictions">Back to real schedule</Link>
        </section>}

        <div className="wp-compact-summary">{eligible.length ? `${picked} / ${eligible.length} picks made` : 'Matchups pending'}<span>All times in UTC</span></div>

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
                <div><h2 id="wp-stage-heading">{stage} matches</h2><p>{matches.length ? 'Choose a winner before each match starts.' : 'The schedule will appear here when it’s available.'}</p></div>
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
                  const status = finished ? `${names[match.winner! - 1]} wins · ${match.team1_score}–${match.team2_score}` : canPick ? (winner ? `Your pick: ${winner}` : 'Choose your winner') : 'Picks unavailable';
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
                                <span className="wp-team-mark" aria-hidden="true">{logo ? <img src={logo} alt="" width={32} height={32} loading="lazy" /> : /^TBD$/i.test(name) ? '?' : shortName}</span>
                                <span className="wp-team-name">{name || 'TBD'}</span>
                                <span className="wp-choice" aria-hidden="true" hidden={!canPick}>{winner === name ? '✓' : ''}</span>
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
                <summary>{demo ? 'Demo teams' : 'Tournament teams'} <span>{teams.length} teams</span></summary>
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


        </div>
      </div>
    </div>
  );
}
