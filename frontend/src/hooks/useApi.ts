import { useEffect, useReducer } from 'react';
import type { AxiosResponse } from 'axios';
import type { PaginatedResponse } from '../types/models';

/* ── Paginated list state machine ── */

interface ListState<T> {
  data: T[];
  count: number;
  loading: boolean;
  error: string | null;
}

type ListAction<T> =
  | { type: 'fetch' }
  | { type: 'success'; results: T[]; count: number }
  | { type: 'error'; message: string };

function listReducer<T>(state: ListState<T>, action: ListAction<T>): ListState<T> {
  switch (action.type) {
    case 'fetch':
      return { ...state, loading: true, error: null };
    case 'success':
      return { data: action.results, count: action.count, loading: false, error: null };
    case 'error':
      return { ...state, loading: false, error: action.message };
  }
}

/**
 * Generic hook that fetches a paginated DRF list endpoint.
 * Re-fetches whenever `page` or `deps` change.
 */
export function usePaginatedList<T>(
  fetcher: (page: number) => Promise<AxiosResponse<PaginatedResponse<T>>>,
  page: number,
  deps: unknown[] = [],
) {
  const [state, dispatch] = useReducer(listReducer<T>, {
    data: [],
    count: 0,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'fetch' });
    fetcher(page)
      .then((res) => {
        if (!cancelled) {
          dispatch({ type: 'success', results: res.data.results, count: res.data.count });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) dispatch({ type: 'error', message: String(err) });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, ...deps]);

  return state;
}

/* ── Detail state machine ── */

interface DetailState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

type DetailAction<T> =
  | { type: 'fetch' }
  | { type: 'success'; data: T }
  | { type: 'error'; message: string };

function detailReducer<T>(state: DetailState<T>, action: DetailAction<T>): DetailState<T> {
  switch (action.type) {
    case 'fetch':
      return { data: null, loading: true, error: null };
    case 'success':
      return { data: action.data, loading: false, error: null };
    case 'error':
      return { ...state, loading: false, error: action.message };
  }
}

/**
 * Fetch a single resource by id.
 */
export function useDetail<T>(
  fetcher: (id: number) => Promise<AxiosResponse<T>>,
  id: number,
) {
  const [state, dispatch] = useReducer(detailReducer<T>, {
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'fetch' });
    fetcher(id)
      .then((res) => { if (!cancelled) dispatch({ type: 'success', data: res.data }); })
      .catch((err: unknown) => { if (!cancelled) dispatch({ type: 'error', message: String(err) }); });
    return () => { cancelled = true; };
  }, [id, fetcher]);

  return state;
}
