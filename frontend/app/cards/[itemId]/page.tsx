"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthPageSpinner } from "@/components/AuthPageSpinner";
import { MessageVendorPanel } from "@/components/MessageVendorPanel";
import { PlaceholderImage } from "@/components/PlaceholderImage";
import { apiFetch } from "@/lib/api";
import { useCategories } from "@/lib/CategoriesContext";
import {
  CONDITION_LABELS,
  GRADING_LABELS,
  STATUS_LABELS,
  type GradingCompany,
  type InventoryCondition,
  type InventoryItem,
} from "@/lib/mockData";

type PublicListing = {
  id: number;
  title: string;
  description: string;
  category: string;
  price: string;
  condition: InventoryCondition;
  grading: GradingCompany;
  status: InventoryItem["status"];
  vendor: number;
  vendor_name: string;
};

const STATUS_STYLES: Record<InventoryItem["status"], string> = {
  available: "bg-emerald-100 text-emerald-800",
  reserved: "bg-amber-100 text-amber-800",
  sold: "bg-gray-200 text-gray-600",
};

export default function CardDetailPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const { labelFor } = useCategories();
  const [listing, setListing] = useState<PublicListing | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<PublicListing>(`/listings/public/${itemId}/`)
      .then((data) => {
        if (!cancelled) setListing(data);
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
  }, [itemId]);

  if (loading) {
    return <AuthPageSpinner />;
  }

  if (notFound || !listing) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Card not found</h1>
        <Link href="/cards" className="mt-4 text-sm font-medium text-brand-blue hover:underline">
          &larr; Back to all cards
        </Link>
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <Link href="/cards" className="text-sm font-medium text-brand-blue hover:underline">
          &larr; Back to all cards
        </Link>

        <div className="mt-4 grid grid-cols-1 gap-8 sm:grid-cols-2">
          <PlaceholderImage
            label={listing.title}
            category={listing.category}
            className="h-64 w-full rounded-lg text-lg sm:h-80"
          />

          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {labelFor(listing.category)}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">{listing.title}</h1>
            <p className="mt-2 text-2xl font-semibold">
              ${Number(listing.price).toLocaleString()}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {CONDITION_LABELS[listing.condition]}
              </span>
              {listing.grading && listing.grading !== "ungraded" && (
                <span className="rounded-full bg-brand-blue/10 px-2.5 py-0.5 text-xs font-medium text-brand-blue">
                  {GRADING_LABELS[listing.grading]}
                </span>
              )}
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[listing.status]}`}
              >
                {STATUS_LABELS[listing.status]}
              </span>
            </div>

            {listing.description && (
              <p className="mt-4 text-gray-600 dark:text-gray-300">{listing.description}</p>
            )}

            <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
              Sold by{" "}
              <Link
                href={`/vendors/profile/${listing.vendor}`}
                className="font-medium text-brand-blue hover:underline"
              >
                {listing.vendor_name}
              </Link>
            </p>

            <div className="mt-4">
              <MessageVendorPanel vendorName={listing.vendor_name} itemTitle={listing.title} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
