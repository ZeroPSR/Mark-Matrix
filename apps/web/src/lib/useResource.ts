import { useEffect, useState, useCallback } from "react";
import { apiFetch, type ApiError } from "./api.js";

export interface UseResourceResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * The message a page shows when a request fails.
 *
 * When the server answered with something that was not JSON, the reason
 * travelled in `detail` — the body itself, clipped. Dropping it leaves the
 * page saying "parse_failed" and nothing more, which sends whoever is
 * debugging to the front end when the fault is in the response.
 */
function describeError(e: ApiError): string {
  // `||`, not `??`: an empty error code is as useless as a missing one, and
  // it would render as an empty message.
  const code = e.body?.error || "load_failed";
  const detail = e.body?.detail;
  if (detail === undefined || detail === "") return code;
  return `${code}: ${detail.slice(0, 120)}`;
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
          setError(describeError(e));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [path, nonce]);

  return { data, loading, error, refetch };
}