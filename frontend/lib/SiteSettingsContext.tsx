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

export type SiteSettings = {
  articles_tab_enabled: boolean;
};

type SiteSettingsContextValue = {
  settings: SiteSettings | null;
  isLoading: boolean;
  /** Re-fetches the live settings — call after Manage Website saves a
   *  change so every consumer (NavBar, Footer) picks it up immediately. */
  refresh: () => void;
};

const SiteSettingsContext = createContext<SiteSettingsContextValue | null>(null);

// Defaults to everything enabled while the first fetch is in flight, so a
// slow network doesn't briefly hide the Articles tab for every visitor —
// same "assume the common case, correct fast if wrong" tradeoff as
// CategoriesContext defaulting to an empty list rather than blocking
// render on the categories fetch.
const DEFAULT_SETTINGS: SiteSettings = { articles_tab_enabled: true };

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    apiFetch<SiteSettings>("/settings/").then(setSettings);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<SiteSettings>("/settings/")
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<SiteSettingsContextValue>(
    () => ({ settings, isLoading, refresh }),
    [settings, isLoading, refresh],
  );

  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>;
}

export function useSiteSettings(): SiteSettingsContextValue {
  const context = useContext(SiteSettingsContext);
  if (!context) {
    throw new Error("useSiteSettings must be used within a SiteSettingsProvider");
  }
  return context;
}
