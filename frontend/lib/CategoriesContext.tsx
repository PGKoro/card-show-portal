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

export type Category = {
  id: number;
  name: string;
  slug: string;
  order: number;
};

// Cycled by a category's position rather than stored per-category — new
// categories an admin adds don't need a color picker, they just get the
// next tint in rotation.
const PALETTE = [
  "bg-brand-orange/10 text-brand-orange",
  "bg-brand-blue/10 text-brand-blue",
  "bg-brand-yellow/20 text-brand-gray-900",
  "bg-brand-red/10 text-brand-red",
  "bg-brand-teal/10 text-brand-teal",
  "bg-brand-navy/10 text-brand-navy",
  "bg-purple-100 text-purple-700",
  "bg-pink-100 text-pink-700",
];

type CategoriesContextValue = {
  categories: Category[];
  isLoading: boolean;
  /** Display name for a slug — falls back to the raw slug if it's no
   *  longer a live category (e.g. old data referencing a deleted one). */
  labelFor: (slug: string) => string;
  /** Tailwind tint classes for a slug, cycling through a fixed palette. */
  styleFor: (slug: string) => string;
  /** Re-fetches the list — call after an admin creates/renames/deletes/
   *  reorders a category so every consumer picks up the change. */
  refresh: () => void;
};

const CategoriesContext = createContext<CategoriesContextValue | null>(null);

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    apiFetch<Category[]>("/categories/").then(setCategories);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Category[]>("/categories/")
      .then((data) => {
        if (!cancelled) setCategories(data);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<CategoriesContextValue>(() => {
    const bySlug = new Map(categories.map((category) => [category.slug, category]));
    return {
      categories,
      isLoading,
      labelFor: (slug) => bySlug.get(slug)?.name ?? slug,
      styleFor: (slug) => {
        const index = categories.findIndex((category) => category.slug === slug);
        return PALETTE[(index >= 0 ? index : 0) % PALETTE.length];
      },
      refresh,
    };
  }, [categories, isLoading, refresh]);

  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}

export function useCategories(): CategoriesContextValue {
  const context = useContext(CategoriesContext);
  if (!context) {
    throw new Error("useCategories must be used within a CategoriesProvider");
  }
  return context;
}
