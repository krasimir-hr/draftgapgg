import { useEffect } from 'react';

export function useRefetchOnFocus(refetch: () => void) {
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refetch]);
}
