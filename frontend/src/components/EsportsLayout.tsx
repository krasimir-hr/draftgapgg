import { createContext, useContext, useEffect, useRef, useState } from 'react';
import LeagueSidebar from './LeagueSidebar';
import { Sidebar } from './Sidebar';

// Portal target for a page's fixed sub-header (e.g. a tab's filter bar). A tab
// renders its filter into this slot so it sits in the fixed header region —
// below the hero — instead of scrolling with the body. Only the body scrolls.
const SubHeaderContext = createContext<HTMLElement | null>(null);
export const useEsportsSubHeader = () => useContext(SubHeaderContext);

// Shared frame for the esports section: a persistent left siderail (league
// selector), a centered main column, and an optional right siderail supplied
// per page. The grid fills the viewport height and each column scrolls
// independently, so the siderails stay put while only the main column scrolls.
// Pages that don't pass `right` get no right column and the main column widens.
//
// When a page supplies `header`, the main column is split into a fixed header
// region (hero + optional sub-header slot) and a separate scroll body below it,
// so page content is confined below the header. The header gets an
// `es-header-stuck` class once the body is scrolled, which pages use to shrink it.
export default function EsportsLayout({
  right,
  header,
  children,
}: {
  right?: React.ReactNode;
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [subHeaderEl, setSubHeaderEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const body = bodyRef.current;
    const head = headerRef.current;
    if (!body || !head) return;
    // Two-stage scroll: the first downward push (while at the top, hero expanded)
    // is consumed to collapse the hero — only further scrolling moves the content.
    // In reverse, once the body is scrolled back to the top, the next upward pull
    // is consumed to expand the hero. Toggled imperatively (no re-render).
    let collapsed = body.scrollTop > 0;
    head.classList.toggle('es-header-stuck', collapsed);

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 0) {
        if (!collapsed && body.scrollTop <= 0) {
          collapsed = true;
          head.classList.add('es-header-stuck');
          e.preventDefault();
        }
      } else if (e.deltaY < 0) {
        if (collapsed && body.scrollTop <= 0) {
          collapsed = false;
          head.classList.remove('es-header-stuck');
          e.preventDefault();
        }
      }
    };
    body.addEventListener('wheel', onWheel, { passive: false });
    return () => body.removeEventListener('wheel', onWheel);
  }, []);

  // Each scrolling column: fill the row height, allow shrink (min-height: 0 so
  // overflow works inside the grid), and pad the content within the scroll area.
  const column: React.CSSProperties = {
    minHeight: 0,
    overflowY: 'auto',
    padding: '20px 0 48px',
  };

  return (
    <div style={{ height: '100%', display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          width: '100%',
          maxWidth: 1592,
          height: '100%',
          boxSizing: 'border-box',
          padding: '0 24px',
          display: 'grid',
          gridTemplateColumns: right ? '220px minmax(0, 1064px) 220px' : '220px minmax(0, 1fr)',
          gap: 20,
        }}
      >
        <LeagueSidebar className="es-scroll" style={{ gridColumn: 1, ...column }} />

        {header ? (
          <div style={{ gridColumn: 2, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Fixed header region: hero + a sub-header slot tabs can portal a
                filter into. Sits above the scroll body. */}
            <div
              ref={headerRef}
              style={{ flexShrink: 0, paddingTop: 20, paddingBottom: 12, position: 'relative', zIndex: 1 }}
            >
              {header}
              <div ref={setSubHeaderEl} />
            </div>
            <SubHeaderContext.Provider value={subHeaderEl}>
              <div ref={bodyRef} className="es-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 48 }}>
                {children}
              </div>
            </SubHeaderContext.Provider>
          </div>
        ) : (
          <div className="es-scroll" style={{ gridColumn: 2, minWidth: 0, ...column }}>{children}</div>
        )}

        {right && <Sidebar className="es-scroll" style={{ gridColumn: 3, ...column }}>{right}</Sidebar>}
      </div>
    </div>
  );
}
