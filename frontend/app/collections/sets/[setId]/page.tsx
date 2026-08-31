"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthPageSpinner } from "@/components/AuthPageSpinner";
import { CollectionsBreadcrumbs } from "@/components/CollectionsBreadcrumbs";
import { PlaceholderImage } from "@/components/PlaceholderImage";
import { SearchInput } from "@/components/SearchInput";
import { Spinner } from "@/components/Spinner";
import { apiFetch, type PaginatedResponse } from "@/lib/api";
import type { CardSetSummary, CardSummary } from "@/lib/collections";

export default function CardSetPage() {
  const { setId } = useParams<{ setId: string }>();
  const [cardSet, setCardSet] = useState<CardSetSummary | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch<CardSetSummary>(`/collections/sets/${setId}/`)
      .then((data) => {
        if (!cancelled) setCardSet(data);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setId]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCardsLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    apiFetch<PaginatedResponse<CardSummary>>(`/collections/sets/${setId}/cards/?${params.toString()}`)
      .then((data) => {
        if (!cancelled) setCards(data.results);
      })
      .finally(() => {
        if (!cancelled) setCardsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setId, search]);

  if (loading) return <AuthPageSpinner />;

  if (notFound || !cardSet) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Set not found</h1>
        <Link href="/collections" className="mt-4 text-sm font-medium text-brand-blue hover:underline">
          &larr; Back to Collections
        </Link>
      </main>
    );
  }

  const breadcrumbs = [
    { label: "Collections", href: "/collections" },
    { label: cardSet.category_name, href: `/collections/${cardSet.category}` },
    { label: String(cardSet.year), href: `/collections/${cardSet.category}?year=${cardSet.year}` },
    {
      label: cardSet.company_name,
      href: `/collections/${cardSet.category}?year=${cardSet.year}&company=${cardSet.company}`,
    },
    { label: cardSet.name, href: `/collections/sets/${cardSet.id}` },
  ];

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <CollectionsBreadcrumbs items={breadcrumbs} />
        <h1 className="mb-1 text-2xl font-semibold">
          {cardSet.year} {cardSet.company_name} {cardSet.name}
        </h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          {cardSet.card_count} card{cardSet.card_count === 1 ? "" : "s"} in this set
        </p>

        <div className="mb-6">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={`Search ${cardSet.name}...`}
          />
        </div>

        {cardsLoading ? (
          <Spinner />
        ) : cards.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {search.trim() ? `No cards match "${search.trim()}".` : "No cards found in this set."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {cards.map((card) => (
              <Link
                key={card.id}
                href={`/collections/cards/${card.id}`}
                className="group flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-800"
              >
                {card.image_front_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.image_front_url}
                    alt={`${card.player_name} #${card.card_number}`}
                    className="h-40 w-full object-cover"
                  />
                ) : (
                  <PlaceholderImage
                    label={`#${card.card_number} ${card.player_name}`}
                    category={cardSet.category}
                    className="h-40 w-full rounded-none"
                  />
                )}
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <p className="text-sm font-semibold leading-snug group-hover:underline">
                    {card.player_name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    #{card.card_number}
                    {card.variation ? ` · ${card.variation}` : ""}
                    {card.print_run ? ` /${card.print_run}` : ""}
                  </p>
                  {card.listing_count > 0 && (
                    <span className="mt-1 inline-block rounded-full bg-brand-blue/10 px-2 py-0.5 text-xs font-medium text-brand-blue">
                      {card.listing_count} from dealers
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
