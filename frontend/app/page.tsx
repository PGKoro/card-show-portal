"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CardCarousel } from "@/components/CardCarousel";
import { HeroCarousel, type HeroSlide } from "@/components/HeroCarousel";
import { InventoryCard } from "@/components/InventoryCard";
import { ShowCard } from "@/components/ShowCard";
import { Spinner } from "@/components/Spinner";
import { VendorCard, type PublicVendor } from "@/components/VendorCard";
import { apiFetch, type PaginatedResponse } from "@/lib/api";
import type { ShowEvent } from "@/lib/events";
import { CARDS_FEATURE_ENABLED } from "@/lib/features";
import { type GradingCompany, type InventoryItem } from "@/lib/mockData";

const HERO_IMAGES = ["/cardshow1.webp", "/cardshow2.avif", "/cardshow3.jpeg"];

type PublicListing = {
  id: number;
  title: string;
  description: string;
  category: string;
  price: string;
  grading: GradingCompany;
  grade: string | null;
  status: InventoryItem["status"];
  vendor: number;
  vendor_name: string;
};

function toInventoryItem(listing: PublicListing): InventoryItem {
  return {
    id: String(listing.id),
    vendorId: String(listing.vendor),
    category: listing.category,
    title: listing.title,
    price: Number(listing.price),
    grading: listing.grading,
    grade: listing.grade !== null ? Number(listing.grade) : null,
    status: listing.status,
    description: listing.description,
  };
}

export default function HomePage() {
  const [featuredVendors, setFeaturedVendors] = useState<PublicVendor[]>([]);
  const [recentListings, setRecentListings] = useState<PublicListing[]>([]);
  const [events, setEvents] = useState<ShowEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<{ results: ShowEvent[] }>("/events/"),
      apiFetch<PaginatedResponse<PublicVendor>>("/vendors/?page_size=10"),
      CARDS_FEATURE_ENABLED
        ? apiFetch<PaginatedResponse<PublicListing>>("/listings/public/?page_size=10")
        : Promise.resolve({ count: 0, next: null, previous: null, results: [] } as PaginatedResponse<PublicListing>),
    ])
      .then(([eventsData, vendorsData, listingsData]) => {
        if (cancelled) return;
        setEvents(eventsData.results);
        setFeaturedVendors(vendorsData.results);
        setRecentListings(listingsData.results);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const upcomingShows = [...events]
    .filter((event) => event.status === "upcoming")
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const pastShows = [...events]
    .filter((event) => event.status === "past")
    .sort((a, b) => b.start_date.localeCompare(a.start_date));

  const heroSlides: HeroSlide[] = pastShows.map((show, i) => ({
    show,
    image: HERO_IMAGES[i % HERO_IMAGES.length],
  }));

  return (
    <main className="flex-1">
      <HeroCarousel slides={heroSlides}>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          The marketplace for card shows and dealers
        </h1>
        <p className="max-w-xl text-white/90">
          Find vendors, browse inventory, and message dealers directly &mdash; all in one place,
          whether you&apos;re at the show or shopping from home.
        </p>
        <div className="flex gap-4">
          <Link
            href="/vendors"
            className="rounded-md bg-white px-5 py-2.5 font-medium text-brand-navy hover:bg-gray-100"
          >
            Browse Vendors
          </Link>
          {CARDS_FEATURE_ENABLED && (
            <Link
              href="/cards"
              className="rounded-md border border-white/60 px-5 py-2.5 font-medium text-white hover:bg-white/10"
            >
              Browse Cards
            </Link>
          )}
        </div>
      </HeroCarousel>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="text-2xl font-semibold">Featured vendors</h2>
            <Link href="/vendors" className="text-sm font-medium text-brand-blue hover:underline">
              View all vendors
            </Link>
          </div>
          {loading ? (
            <Spinner />
          ) : featuredVendors.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No vendors listed yet.</p>
          ) : (
            <CardCarousel autoAdvance={false}>
              {featuredVendors.map((vendor) => (
                <div key={vendor.pk} className="w-72 shrink-0 snap-start sm:w-80">
                  <VendorCard vendor={vendor} />
                </div>
              ))}
            </CardCarousel>
          )}
        </div>
      </section>

      {CARDS_FEATURE_ENABLED && (
        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-6 flex items-end justify-between">
              <h2 className="text-2xl font-semibold">Recent listings</h2>
              <Link href="/cards" className="text-sm font-medium text-brand-blue hover:underline">
                Browse all cards
              </Link>
            </div>
            {loading ? (
              <Spinner />
            ) : recentListings.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">No cards listed yet.</p>
            ) : (
              <CardCarousel loop>
                {recentListings.map((listing) => (
                  <div key={listing.id} className="w-40 shrink-0 snap-start sm:w-44">
                    <InventoryCard
                      item={toInventoryItem(listing)}
                      vendorName={listing.vendor_name}
                      href={`/cards/${listing.id}`}
                    />
                  </div>
                ))}
              </CardCarousel>
            )}
          </div>
        </section>
      )}

      {(loading || upcomingShows.length > 0) && (
        <section className="bg-white py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-6 flex items-end justify-between">
              <h2 className="text-2xl font-semibold">Upcoming shows</h2>
              <Link href="/events" className="text-sm font-medium text-brand-blue hover:underline">
                View all events
              </Link>
            </div>
            {loading ? (
              <Spinner />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {upcomingShows.map((show) => (
                  <ShowCard key={show.id} show={show} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {(loading || pastShows.length > 0) && (
        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-6 flex items-end justify-between">
              <h2 className="text-2xl font-semibold">Past events</h2>
              <Link href="/events" className="text-sm font-medium text-brand-blue hover:underline">
                View all events
              </Link>
            </div>
            {loading ? (
              <Spinner />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pastShows.map((show) => (
                  <ShowCard key={show.id} show={show} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
