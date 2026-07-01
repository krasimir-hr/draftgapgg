import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

type DrawerKind = 'team';

type DrawerState =
  | { kind: 'team'; name: string }
  | null;

interface DrawerCtx {
  current: DrawerState;
  openMatch: (id: number) => void;
  openPlayer: (name: string) => void;
  openTeam: (name: string) => void;
  close: () => void;
}

const DrawerContext = createContext<DrawerCtx | null>(null);

export function DrawerProvider({ children }: { children: ReactNode }) {
  /* Single-slot drawer for teams. Players and matches are full pages. */
  const [current, setCurrent] = useState<DrawerState>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const openMatch  = useCallback((id: number)   => { navigate(`/matches/${id}`); }, [navigate]);
  const openPlayer = useCallback((name: string) => { navigate(`/players/${encodeURIComponent(name)}`); }, [navigate]);
  const openTeam   = useCallback((name: string) => { navigate(`/teams/${encodeURIComponent(name)}`); }, [navigate]);
  const close      = useCallback(() => { setCurrent(null); }, []);

  // Close any open drawer when navigating to a new page, so it doesn't linger
  // on top of the destination (e.g. opening a player from inside a team drawer).
  const prevPath = useRef(pathname);
  useEffect(() => {
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      close();
    }
  }, [pathname, close]);

  // Esc closes the drawer
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, close]);

  // Lock body scroll when a drawer is open
  useEffect(() => {
    if (!current) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [current]);

  return (
    <DrawerContext.Provider value={{ current, openMatch, openPlayer, openTeam, close }}>
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
