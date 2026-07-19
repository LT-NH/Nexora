import { useEffect, useRef, useCallback } from 'react';

/**
 * Returns a ref that is true while the component is mounted.
 * Use `if (!mountedRef.current) return;` before calling setState in async callbacks.
 */
export function useMountedRef() {
  const ref = useRef(true);
  useEffect(() => {
    ref.current = true;
    return () => { ref.current = false; };
  }, []);
  return ref;
}

/**
 * Returns an AbortController that is automatically aborted on unmount.
 * Use its signal in fetch/axios calls to cancel in-flight requests.
 */
export function useAbortController() {
  const ref = useRef<AbortController>(new AbortController());
  useEffect(() => {
    const ctrl = ref.current;
    return () => { ctrl.abort(); };
  }, []);
  return ref.current;
}