import { useState, useEffect } from 'react';
import api from '@/services/api';
import { useWorkspace } from './useWorkspace';

/**
 * Shape returned by the `/workspaces/:slug/search` endpoint.
 * Each category is an array of lightweight hit objects (id, name, etc.).
 */
export interface SearchResult {
  products: any[];
  orders: any[];
  customers: any[];
}

/**
 * useGlobalSearch
 * ---------------
 * Single source of truth for the global search used by both the desktop
 * SearchBar and the mobile MobileSearchButton in the Topbar. It owns the
 * query string, debounced API call, loading flag and result set so the two
 * UIs no longer duplicate the same fetch + debounce logic.
 */
export function useGlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const { currentWorkspace } = useWorkspace();

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || !currentWorkspace) {
      setResults(null);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get(
          `/workspaces/${currentWorkspace.slug}/search?q=${encodeURIComponent(trimmed)}`
        );
        setResults(res.data as SearchResult);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, currentWorkspace]);

  return { query, setQuery, results, loading };
}
