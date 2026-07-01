import { useDrawer } from '../../contexts/DrawerContext';
import TeamDrawer from './TeamDrawer';

export default function DrawerHost() {
  const { current, close } = useDrawer();

  if (!current) return null;

  return (
    <>
      <div className="drawer-backdrop" onClick={close} />
      <div className="drawer-panel" style={{ width: 'min(560px, 100vw)' }}>
        <button type="button" className="drawer-close" onClick={close} aria-label="Close">×</button>
        {current.kind === 'team' && <TeamDrawer name={current.name} />}
      </div>
    </>
  );
}
