"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthPageSpinner } from "@/components/AuthPageSpinner";
import { InventoryCard } from "@/components/InventoryCard";
import { MessageVendorPanel } from "@/components/MessageVendorPanel";
import { ShowCard } from "@/components/ShowCard";
import { SocialLinks } from "@/components/SocialLinks";
import { Spinner } from "@/components/Spinner";
import { apiFetch, type PaginatedResponse } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useCategories } from "@/lib/CategoriesContext";
import type { ShowEvent } from "@/lib/events";
import { CARDS_FEATURE_ENABLED } from "@/lib/features";
import { type GradingCompany, type InventoryItem } from "@/lib/mockData";
import { labelForPaymentMethod } from "@/lib/paymentMethods";
import { themeFor } from "@/lib/profileThemes";

type PublicVendor = {
  pk: number;
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
  date_joined: string;
};

type Listing = {
  id: number;
  title: string;
  description: string;
  category: string;
  price: string;
  grading: GradingCompany;
  grade: string | null;
  status: InventoryItem["status"];
};

function toInventoryItem(listing: Listing): InventoryItem {
  return {
    id: String(listing.id),
    vendorId: "",
    category: listing.category,
    title: listing.title,
    price: Number(listing.price),
    grading: listing.grading,
    grade: listing.grade !== null ? Number(listing.grade) : null,
    status: listing.status,
    description: listing.description,
  };
}

function initialsFor(businessName: string): string {
  const words = businessName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words[0][0] + (words[1]?.[0] ?? "")).toUpperCase();
}

export default function PublicVendorProfilePage() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const { labelFor } = useCategories();
  const [vendor, setVendor] = useState<PublicVendor | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [events, setEvents] = useState<ShowEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<PublicVendor>(`/vendors/${vendorId}/`),
      CARDS_FEATURE_ENABLED
        ? apiFetch<PaginatedResponse<Listing>>(`/vendors/${vendorId}/listings/?page_size=100`)
        : Promise.resolve({ count: 0, next: null, previous: null, results: [] } as PaginatedResponse<Listing>),
    ])
      .then(([vendorData, listingsData]) => {
        if (cancelled) return;
        setVendor(vendorData);
        setListings(listingsData.results);
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
  }, [vendorId]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<PaginatedResponse<ShowEvent>>(`/events/?vendor=${vendorId}&page_size=50`, {
      accessToken: getAccessToken() ?? undefined,
    })
      .then((data) => {
        if (!cancelled) setEvents(data.results);
      })
      .catch(() => {
        // Not fatal to the page — just leave the events section empty.
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (loading) {
    return <AuthPageSpinner />;
  }

  if (notFound || !vendor) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Vendor not found</h1>
        <Link href="/vendors" className="mt-4 text-sm font-medium text-brand-blue hover:underline">
          &larr; Back to all vendors
        </Link>
      </main>
    );
  }

  const upcomingEvents = events
    .filter((event) => event.status === "upcoming")
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const pastEvents = events
    .filter((event) => event.status === "past")
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  const joinedDate = new Date(vendor.date_joined);
  const memberSinceYear = Number.isNaN(joinedDate.getTime()) ? null : joinedDate.getFullYear();
  const theme = themeFor(vendor.profile_theme);

  return (
    <main className="flex-1">
      {/* Banner — a branded gradient placeholder for now (no image-upload
          flow exists yet; see User.banner_image_url). Swapping in a real
          vendor-uploaded photo later is just a background-image swap. */}
      <div
        className="relative h-40 w-full sm:h-52"
        style={{
          backgroundImage: vendor.banner_image_url
            ? `url(${vendor.banner_image_url})`
            : theme.bannerGradient,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(255,255,255,0.5) 0 2px, transparent 2px 26px)",
          }}
        />
        <Link
          href="/vendors"
          className="absolute left-6 top-4 inline-block text-sm font-medium text-white/90 hover:text-white hover:underline"
        >
          &larr; Back to all vendors
        </Link>
      </div>

      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-wrap items-end gap-4 pt-6">
          {/* Avatar — same colored-initials treatment as the header's
              profile chip (components/NavBar.tsx), just larger. */}
          <div
            className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-4 border-white text-2xl font-semibold text-white shadow-md dark:border-gray-950 sm:h-28 sm:w-28 ${theme.avatarClassName}`}
          >
            {vendor.avatar_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={vendor.avatar_image_url}
                alt={vendor.business_name}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              initialsFor(vendor.business_name)
            )}
          </div>

          <div className="min-w-0 flex-1 pb-1">
            <h1 className="text-3xl font-bold tracking-tight">{vendor.business_name}</h1>
            {vendor.tagline && (
              <p className="mt-0.5 text-gray-600 italic dark:text-gray-300">{vendor.tagline}</p>
            )}
            {vendor.location && (
              <p className="mt-1 text-gray-500 dark:text-gray-400">{vendor.location}</p>
            )}
          </div>

          <div className="pb-1">
            <SocialLinks
              instagramUrl={vendor.instagram_url}
              youtubeUrl={vendor.youtube_url}
              xUrl={vendor.x_url}
              websiteUrl={vendor.website_url}
            />
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:col-span-2">
            {vendor.business_description && (
              <p className="max-w-2xl text-gray-600 dark:text-gray-300">
                {vendor.business_description}
              </p>
            )}
            {(vendor.category_tags.length > 0 || vendor.also_buying) && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {vendor.also_buying && (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Also buying
                  </span>
                )}
                {vendor.category_tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  >
                    {labelFor(tag)}
                  </span>
                ))}
              </div>
            )}
            {vendor.payment_methods.length > 0 && (
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                Accepts: {vendor.payment_methods.map(labelForPaymentMethod).join(", ")}
              </p>
            )}

            <h2 className="mb-4 mt-8 text-xl font-semibold">Events</h2>
            {eventsLoading ? (
              <Spinner />
            ) : events.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No events yet — check back once {vendor.business_name} lines up a show.
              </p>
            ) : (
              <div className="space-y-8">
                {upcomingEvents.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      Upcoming
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {upcomingEvents.map((event) => (
                        <ShowCard key={event.id} show={event} />
                      ))}
                    </div>
                  </div>
                )}
                {pastEvents.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      Past
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {pastEvents.map((event) => (
                        <ShowCard key={event.id} show={event} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="flex divide-x divide-gray-200 rounded-lg border border-gray-200 bg-white text-center shadow-sm dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
              {vendor.selling_since_year ? (
                <div className="flex-1 px-4 py-3">
                  <p className="text-lg font-semibold">{vendor.selling_since_year}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Selling since</p>
                </div>
              ) : (
                memberSinceYear !== null && (
                  <div className="flex-1 px-4 py-3">
                    <p className="text-lg font-semibold">{memberSinceYear}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Member since</p>
                  </div>
                )
              )}
              <div className="flex-1 px-4 py-3">
                <p className="text-lg font-semibold">{pastEvents.length}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Shows attended</p>
              </div>
              {vendor.collection_size !== null && (
                <div className="flex-1 px-4 py-3">
                  <p className="text-lg font-semibold">
                    {vendor.collection_size.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Cards in collection</p>
                </div>
              )}
            </div>

            <MessageVendorPanel vendorName={vendor.business_name} />
          </div>
        </div>

        {CARDS_FEATURE_ENABLED && (
          <>
            <h2 className="mb-4 mt-10 text-xl font-semibold">
              Inventory <span className="text-gray-400">({listings.length})</span>
            </h2>
            {listings.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No items listed yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {listings.map((listing) => (
                  <InventoryCard
                    key={listing.id}
                    item={toInventoryItem(listing)}
                    href={`/cards/${listing.id}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
        <div className="pb-12" />
      </div>
    </main>
  );
}
