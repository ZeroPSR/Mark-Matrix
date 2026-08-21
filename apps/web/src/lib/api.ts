import { supabase } from "./supabase.js";

export interface ApiError extends Error {
  status: number;
  body: { error: string; detail?: string; fields?: { path: string; message: string }[] };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? null;
  if (token) cachedToken = { token, expiresAt: Date.now() + 60_000 };
  return token;
}

const BASE_URL = import.meta.env["VITE_API_ORIGIN"] ?? "";

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: "parse_failed" };
    }
  }
  if (!res.ok) {
    const err = new Error(`API ${res.status}`) as ApiError;
    err.status = res.status;
    err.body = (body as ApiError["body"]) ?? { error: "unknown" };
    throw err;
  }
  return body as T;
}