import { useDrawer } from '../../contexts/DrawerContext';
import MatchDrawer from './MatchDrawer';
import PlayerDrawer from './PlayerDrawer';
import TeamDrawer from './TeamDrawer';
import MatchScoreboard from './MatchScoreboard';

export default function DrawerHost() {
  const { current, close, scoreboard } = useDrawer();

  const width =
    current?.kind === 'match'  ? 'min(640px, 100vw)'
    : current?.kind === 'team' ? 'min(560px, 100vw)'
    :                            'min(520px, 100vw)';

  return (
    <>
      {current && (
        <>
          <div className="drawer-backdrop" onClick={close} />
          <div className="drawer-panel" style={{ width }}>
            <button
              type="button"
              className="drawer-close"
              onClick={close}
              aria-label="Close"
            >
              ×
            </button>
            {current.kind === 'match'  && <MatchDrawer  matchId={current.id} />}
            {current.kind === 'player' && <PlayerDrawer name={current.name} />}
            {current.kind === 'team'   && <TeamDrawer   name={current.name} />}
          </div>
        </>
      )}

      {scoreboard && (
        <MatchScoreboard matchId={scoreboard.matchId} initialGameIdx={scoreboard.gameIdx} />
      )}
    </>
  );
}
