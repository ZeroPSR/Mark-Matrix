import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { API_ROUTES, isRole, type MeResponse, type Role } from "@mark-matrix/shared";
import { supabase } from "../lib/supabase.js";
import { apiFetch } from "../lib/api.js";

export interface AuthState {
  userId: string | null;
  role: Role | null;
  /**
   * The name to show for this user — never their id.
   *
   * The session carries a copy of the name in its sign-up metadata, which
   * is enough to render something immediately but goes stale when an admin
   * renames the user. The profile row is the authority, so it replaces the
   * session's copy as soon as it arrives.
   */
  userName: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

/** The shape of the bits of a Supabase user this module reads. */
interface SessionUser {
  id?: string;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}

/**
 * The best name available from the session alone.
 *
 * The sign-up metadata first, then the part of the email before the @.
 * Both can be missing, in which case there is no name to show and the
 * profile fetch is the only thing left to try.
 */
function sessionDisplayName(u: SessionUser | undefined): string | null {
  if (u === undefined) return null;
  const meta = u.user_metadata as { name?: unknown } | undefined;
  const name = typeof meta?.name === "string" ? meta.name.trim() : "";
  if (name !== "") return name;
  const email = (u.email ?? "").trim();
  if (email === "") return null;
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // The profile is fetched once per user, not on every token refresh.
    let fetchedFor: string | null = null;

    const loadProfile = (u: SessionUser | undefined): void => {
      const id = u?.id ?? null;
      if (id === null || id === fetchedFor) return;
      fetchedFor = id;
      void apiFetch<MeResponse>(API_ROUTES.me)
        .then((me) => {
          if (cancelled) return;
          if (me.name !== null && me.name.trim() !== "") setUserName(me.name);
        })
        .catch(() => {
          // The session's copy of the name stands. A failure here must not
          // leave the header without a name.
        });
    };

    const applySession = (session: { user?: SessionUser } | null): void => {
      const u = session?.user;
      setUserId(u?.id ?? null);
      const r = (u?.app_metadata as { role?: unknown } | undefined)?.role;
      setRole(isRole(r) ? r : null);
      setUserName(sessionDisplayName(u));
      loadProfile(u);
    };

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        applySession(data.session as { user?: SessionUser } | null);
        setLoading(false);
      })
      .catch(() => {
        // A network failure must not leave the app stuck in `loading`.
        if (cancelled) return;
        setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      applySession(session as { user?: SessionUser } | null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      userId,
      role,
      userName,
      loading,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [userId, role, userName, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
