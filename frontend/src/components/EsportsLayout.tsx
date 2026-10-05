import { createContext, useContext, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';

const SubHeaderContext = createContext<HTMLElement | null>(null);
export const useEsportsSubHeader = () => useContext(SubHeaderContext);

/** A single page scroll keeps filters, content and supporting context together. */
export default function EsportsLayout({ right, header, children, className = '' }: {
  right?: ReactNode;
  header?: ReactNode;
  children: ReactNode;
  className?: string;
  stickyHeader?: boolean;
  pageScroll?: boolean;
}) {
  return (
    <div className={`dg-page es-scroll ${className}`}>
      <div className="dg-page-container">
        {header && <header className="dg-page-hero">{header}</header>}
        <div className={`dg-page-grid${right ? ' dg-page-grid--rail' : ''}`}>
          <div className="dg-content">{children}</div>
          {right && <Sidebar className="dg-context">{right}</Sidebar>}
        </div>
      </div>
    </div>
  );
}
