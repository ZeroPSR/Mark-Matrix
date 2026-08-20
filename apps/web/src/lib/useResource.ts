import { useEffect, useState, useCallback } from "react";
import { apiFetch, type ApiError } from "./api.js";

export interface UseResourceResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useResource<T>(path: string | null): UseResourceResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState<number>(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (path === null) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<T>(path)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e: ApiError) => {
        if (!cancelled) {
          setError(e.body?.error ?? "load_failed");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [path, nonce]);

  return { data, loading, error, refetch };
}