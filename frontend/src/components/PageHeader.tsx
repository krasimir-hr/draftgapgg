import type { ReactNode } from 'react';

export default function PageHeader({ eyebrow, title, description, children }: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="dg-page-heading">
      <div>
        <p className="dg-eyebrow"><span />{eyebrow}</p>
        <h1>{title}</h1>
        <p className="dg-page-description">{description}</p>
      </div>
      {children && <div className="dg-heading-actions">{children}</div>}
    </header>
  );
}
