"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthPageSpinner } from "@/components/AuthPageSpinner";
import { CollectionsBreadcrumbs } from "@/components/CollectionsBreadcrumbs";
import { PlaceholderImage } from "@/components/PlaceholderImage";
import { Spinner } from "@/components/Spinner";
import { apiFetch, type PaginatedResponse } from "@/lib/api";
import type { CardDealerListing, CardDetail } from "@/lib/collections";
import { formatGrade, formatSerial } from "@/lib/collections";

const STATUS_STYLES: Record<CardDealerListing["status"], string> = {
  available: "bg-emerald-100 text-emerald-800",
  reserved: "bg-amber-100 text-amber-800",
  sold: "bg-gray-200 text-gray-600",
};

export default function CardDetailPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const [card, setCard] = useState<CardDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<CardDealerListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<CardDetail>(`/collections/cards/${cardId}/`)
      .then((data) => {
        if (!cancelled) setCard(data);
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
  }, [cardId]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<PaginatedResponse<CardDealerListing>>(`/listings/public/?card=${cardId}&page_size=50`)
      .then((data) => {
        if (!cancelled) setListings(data.results);
      })
      .finally(() => {
        if (!cancelled) setListingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  if (loading) return <AuthPageSpinner />;

  if (notFound || !card) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Card not found</h1>
        <Link href="/collections" className="mt-4 text-sm font-medium text-brand-blue hover:underline">
          &larr; Back to Collections
        </Link>
      </main>
    );
  }

  const breadcrumbs = [
    { label: "Collections", href: "/collections" },
    { label: card.category_name, href: `/collections/${card.category}` },
    { label: String(card.year), href: `/collections/${card.category}?year=${card.year}` },
    {
      label: card.company_name,
      href: `/collections/${card.category}?year=${card.year}&company=${card.company_id}`,
    },
    { label: card.set_name, href: `/collections/sets/${card.set_id}` },
    { label: `${card.player_name} #${card.card_number}`, href: `/collections/cards/${card.id}` },
  ];

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <CollectionsBreadcrumbs items={breadcrumbs} />

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div className="grid grid-cols-2 gap-3">
            {card.image_front_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.image_front_url}
                alt={`${card.player_name} front`}
                className="h-64 w-full rounded-lg object-cover"
              />
            ) : (
              <PlaceholderImage label="Front" category={card.category} className="h-64 w-full" />
            )}
            {card.image_back_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.image_back_url}
                alt={`${card.player_name} back`}
                className="h-64 w-full rounded-lg object-cover"
              />
            ) : (
              <PlaceholderImage label="Back" category={card.category} className="h-64 w-full" />
            )}
          </div>

          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {card.year} {card.company_name} {card.set_name}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              {card.player_name} #{card.card_number}
            </h1>
            {card.variation && (
              <p className="mt-1 text-base text-gray-600 dark:text-gray-300">{card.variation}</p>
            )}

            <dl className="mt-4 space-y-1.5 text-sm">
              {card.team && card.team !== "N/A" && (
                <div className="flex gap-2">
                  <dt className="w-24 text-gray-500 dark:text-gray-400">Team</dt>
                  <dd>{card.team}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="w-24 text-gray-500 dark:text-gray-400">Category</dt>
                <dd>{card.category_name}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 text-gray-500 dark:text-gray-400">Year</dt>
                <dd>{card.year}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 text-gray-500 dark:text-gray-400">Company</dt>
                <dd>{card.company_name}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 text-gray-500 dark:text-gray-400">Set</dt>
                <dd>
                  <Link href={`/collections/sets/${card.set_id}`} className="text-brand-blue hover:underline">
                    {card.set_name}
                  </Link>
                </dd>
              </div>
              {card.print_run && (
                <div className="flex gap-2">
                  <dt className="w-24 text-gray-500 dark:text-gray-400">Print run</dt>
                  <dd>/{card.print_run}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        <div className="mt-10">
          <h2 className="mb-4 text-lg font-semibold">Available From Dealers</h2>
          {listingsLoading ? (
            <Spinner />
          ) : listings.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              No dealer listings are currently available for this card.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {listings.map((listing) => {
                const gradeLabel = formatGrade(
                  listing.grading,
                  listing.grade,
                  listing.grading_company_other,
                );
                const serialLabel = listing.is_serial_numbered
                  ? formatSerial(listing.serial_copy_number, listing.serial_print_run)
                  : null;
                return (
                  <Link
                    key={listing.id}
                    href={`/cards/${listing.id}`}
                    className="flex gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-800"
                  >
                    {listing.front_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={listing.front_image_url}
                        alt={listing.title}
                        className="h-20 w-20 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <PlaceholderImage
                        label="Front"
                        category={listing.category}
                        className="h-20 w-20 shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-500 dark:text-gray-400">{listing.vendor_name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {gradeLabel && (
                          <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-xs font-medium text-brand-blue">
                            {gradeLabel}
                          </span>
                        )}
                        {serialLabel && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            {serialLabel}
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[listing.status]}`}
                        >
                          {listing.status}
                        </span>
                      </div>
                      <p className="mt-1 font-semibold">
                        {listing.price ? `$${Number(listing.price).toLocaleString()}` : "No price set"}
                        {listing.accepting_offers && (
                          <span className="ml-2 text-xs font-normal text-gray-500">Accepting offers</span>
                        )}
                        {listing.accepting_trades && (
                          <span className="ml-2 text-xs font-normal text-gray-500">Accepting trades</span>
                        )}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
