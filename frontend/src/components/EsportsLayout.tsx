import { createContext, useContext } from 'react';
import { Sidebar } from './Sidebar';

// Kept for the league tabs (Players/Champions) that look up a portal target for
// their filter bar. In the current single-scroll frame there is no fixed header
// slot, so this resolves to null and those tabs render their filter inline —
// which is the behaviour we want (everything scrolls together).
const SubHeaderContext = createContext<HTMLElement | null>(null);
export const useEsportsSubHeader = () => useContext(SubHeaderContext);

// Shared frame for the esports section: a persistent left siderail (league
// selector) lives in the app chrome; this component lays out the centered main
// column and an optional right siderail supplied per page.
//
// Two layouts:
//  - Default (no `header`): a centered grid whose columns scroll independently.
//  - Frame (`header` present, league page only): ONE bordered, rounded container
//    that scrolls as a single unit. The header sits as a top bar, the main
//    content and right rail as two divider-separated columns below it — nothing
//    is sticky, so the whole page reads and scrolls as one big div.
export default function EsportsLayout({
  right,
  header,
  children,
  className,
  stickyHeader = true,
  pageScroll = false,
}: {
  right?: React.ReactNode;
  header?: React.ReactNode;
  children: React.ReactNode;
  // Extra class on the outer container (frame or shell).
  className?: string;
  // When false, the header scrolls away with the body instead of pinning as a
  // fixed top bar (used by the match page, whose hero is tall and one-off).
  stickyHeader?: boolean;
  // When true, the frame grows to its natural height and the whole region
  // scrolls as a page, instead of the body scrolling inside a fixed-height
  // frame. Implies a non-sticky header (match page).
  pageScroll?: boolean;
}) {
  if (header) {
    const headerNode = <div className="es-frame-header">{header}</div>;
    return (
      <div className={`es-frame-outer${pageScroll ? ' es-frame-outer--flow' : ''}`}>
        <div className={`es-frame${right ? ' es-frame--rail' : ''}${pageScroll ? ' es-frame--flow' : ''}${className ? ` ${className}` : ''}`}>
          {stickyHeader && headerNode}
          <div className={`es-frame-body${pageScroll ? '' : ' es-scroll'}`}>
            {!stickyHeader && headerNode}
            <div className="es-frame-grid">
              <div className="es-frame-main">{children}</div>
              {right && <Sidebar className="es-frame-rail">{right}</Sidebar>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default: each column fills the row height and scrolls on its own.
  const column: React.CSSProperties = {
    minHeight: 0,
    overflowY: 'auto',
    padding: '20px 0 48px',
  };

  return (
    <div style={{ height: '100%', display: 'flex', justifyContent: 'center' }}>
      <div
        className={`${right ? 'es-shell es-shell--rail' : 'es-shell'}${className ? ` ${className}` : ''}`}
        style={{
          width: '100%',
          maxWidth: 1280,
          height: '100%',
          boxSizing: 'border-box',
          padding: '0 24px',
        }}
      >
        <div className="es-scroll" style={{ gridColumn: 1, minWidth: 0, ...column }}>{children}</div>

        {right && (
          <Sidebar className="es-scroll es-rail" style={{ gridColumn: 2, ...column }}>
            {right}
          </Sidebar>
        )}
      </div>
    </div>
  );
}
