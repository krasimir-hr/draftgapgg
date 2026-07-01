import { useRouteError } from 'react-router-dom';

// Generic error element for routes whose loader can fail (e.g. a missing resource).
export default function RouteError({ fallback = 'Not found' }: { fallback?: string }) {
  const error = useRouteError();
  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <p className="text-sm" style={{ color: 'var(--red)' }}>{String(error) || fallback}</p>
    </div>
  );
}
