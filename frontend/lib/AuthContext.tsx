"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { apiFetch } from "@/lib/api";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  saveTokens,
  type AuthTokens,
} from "@/lib/auth";

export type CurrentUser = {
  pk: number;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  onboarding_completed: boolean;
  business_name: string;
  business_description: string;
  location: string;
  category_tags: string[];
  instagram_url: string;
  youtube_url: string;
  x_url: string;
  website_url: string;
  banner_image_url: string;
  avatar_image_url: string;
  profile_theme: string;
  tagline: string;
  collection_size: number | null;
  selling_since_year: number | null;
  also_buying: boolean;
  payment_methods: string[];
  vendor_status: "pending_review" | "approved" | "rejected" | null;
  archived: boolean;
  date_joined: string;
};

type AuthContextValue = {
  user: CurrentUser | null;
  /** True until the initial "is there a valid session?" check resolves. */
  isLoading: boolean;
  /** Saves tokens, fetches the current user, and updates global state —
   *  used right after login/registration returns a token pair. */
  login: (tokens: AuthTokens) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  /** Updates the in-memory user without a network round trip — used after
   *  the onboarding endpoint returns the freshly-updated user. */
  setUser: (user: CurrentUser) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkSession(): Promise<CurrentUser | null> {
      const token = getAccessToken();
      if (!token) {
        return null;
      }
      try {
        return await apiFetch<CurrentUser>("/auth/user/", { accessToken: token });
      } catch {
        // Token is missing/expired/invalid — treat as logged out.
        clearTokens();
        return null;
      }
    }

    checkSession().then((current) => {
      if (cancelled) return;
      setUser(current);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (tokens: AuthTokens) => {
    saveTokens(tokens);
    const current = await apiFetch<CurrentUser>("/auth/user/", { accessToken: tokens.access });
    setUser(current);
    return current;
  }, []);

  const logout = useCallback(async () => {
    const access = getAccessToken();
    const refresh = getRefreshToken();

    try {
      await apiFetch("/auth/logout/", {
        method: "POST",
        accessToken: access ?? undefined,
        body: refresh ? { refresh } : undefined,
      });
    } catch {
      // Still clear local state even if the network call fails — there's
      // no reason to leave the UI showing a logged-in state.
    } finally {
      clearTokens();
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, login, logout, setUser }),
    [user, isLoading, login, logout, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
