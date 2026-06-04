import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

type DrawerKind = 'match' | 'player' | 'team';

type DrawerState =
  | { kind: 'match'; id: number }
  | { kind: 'player'; name: string }
  | { kind: 'team'; name: string }
  | null;

interface ScoreboardState { matchId: number; gameIdx: number; }

interface DrawerCtx {
  current: DrawerState;
  scoreboard: ScoreboardState | null;
  openMatch: (id: number) => void;
  openPlayer: (name: string) => void;
  openTeam: (name: string) => void;
  close: () => void;
  openScoreboard: (matchId: number, gameIdx: number) => void;
  closeScoreboard: () => void;
}

const DrawerContext = createContext<DrawerCtx | null>(null);

export function DrawerProvider({ children }: { children: ReactNode }) {
  /* Single-slot drawer: opening a new one replaces whatever was open.
     Closing the scoreboard does not close the underlying drawer. */
  const [current, setCurrent] = useState<DrawerState>(null);
  const [scoreboard, setScoreboard] = useState<ScoreboardState | null>(null);

  const openMatch  = useCallback((id: number)   => { setCurrent({ kind: 'match',  id }); }, []);
  const openPlayer = useCallback((name: string) => { setCurrent({ kind: 'player', name }); }, []);
  const openTeam   = useCallback((name: string) => { setCurrent({ kind: 'team',   name }); }, []);
  const close      = useCallback(() => { setCurrent(null); }, []);
  const openScoreboard = useCallback((matchId: number, gameIdx: number) => {
    setScoreboard({ matchId, gameIdx });
  }, []);
  const closeScoreboard = useCallback(() => {
    setScoreboard(null);
  }, []);

  // Esc closes scoreboard first, then the drawer
  useEffect(() => {
    if (!current && !scoreboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (scoreboard) setScoreboard(null);
      else close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, scoreboard, close]);

  // Lock body scroll when any overlay is open
  useEffect(() => {
    if (!current && !scoreboard) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [current, scoreboard]);

  return (
    <DrawerContext.Provider value={{
      current, scoreboard,
      openMatch, openPlayer, openTeam, close,
      openScoreboard, closeScoreboard,
    }}>
      {children}
    </DrawerContext.Provider>
  );
}

export function useDrawer(): DrawerCtx {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error('useDrawer must be used inside <DrawerProvider>');
  return ctx;
}

export type { DrawerState, DrawerKind };
