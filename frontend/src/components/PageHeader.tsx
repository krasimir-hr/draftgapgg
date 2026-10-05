import type { ReactNode } from 'react';

export default function PageHeader({ title, children }: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="dg-page-heading">
      <div>
        <h1>{title}</h1>
      </div>
      {children && <div className="dg-heading-actions">{children}</div>}
    </header>
  );
}
