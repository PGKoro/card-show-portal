"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SearchInput } from "@/components/SearchInput";
import { Spinner } from "@/components/Spinner";
import { apiFetch } from "@/lib/api";
import { useCategories } from "@/lib/CategoriesContext";
import type { CollectionsSearchResponse } from "@/lib/collections";

export default function CollectionsPage() {
  const { categories, isLoading, styleFor } = useCategories();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CollectionsSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      apiFetch<CollectionsSearchResponse>(`/collections/search/?q=${encodeURIComponent(trimmed)}`)
        .then(setResults)
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const hasResults = results && (results.sets.length > 0 || results.cards.length > 0);

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Collections</h1>
        <p className="mb-6 text-gray-600 dark:text-gray-300">
          Browse the card registry by category, or search for a set or card directly.
        </p>

        <div className="mb-8">
          <SearchInput value={query} onChange={setQuery} placeholder="Search sets or cards..." />
        </div>

        {query.trim() ? (
          searching ? (
            <Spinner />
          ) : !hasResults ? (
            <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              No results found for &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            <div className="space-y-8">
              {results!.sets.length > 0 && (
                <div>
                  <h2 className="mb-3 text-lg font-semibold">Sets</h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {results!.sets.map((set) => (
                      <Link
                        key={set.id}
                        href={`/collections/sets/${set.id}`}
                        className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-800"
                      >
                        <p className="font-semibold">
                          {set.year} {set.company_name} {set.name}
                        </p>
                        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                          {set.category_name} · {set.card_count} card{set.card_count === 1 ? "" : "s"}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {results!.cards.length > 0 && (
                <div>
                  <h2 className="mb-3 text-lg font-semibold">Cards</h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {results!.cards.map((card) => (
                      <Link
                        key={card.id}
                        href={`/collections/cards/${card.id}`}
                        className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-800"
                      >
                        <p className="font-semibold">
                          {card.player_name} #{card.card_number}
                          {card.variation ? ` ${card.variation}` : ""}
                        </p>
                        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                          {card.year} {card.company_name} {card.set_name} · {card.category_name}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        ) : isLoading ? (
          <Spinner />
        ) : categories.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No categories have been set up yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <Link
                key={category.slug}
                href={`/collections/${category.slug}`}
                className={`rounded-lg p-6 text-center text-lg font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${styleFor(category.slug)}`}
              >
                {category.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
