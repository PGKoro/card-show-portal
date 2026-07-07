import Link from "next/link";

import { CardCarousel } from "@/components/CardCarousel";
import { HeroCarousel, type HeroSlide } from "@/components/HeroCarousel";
import { InventoryCard } from "@/components/InventoryCard";
import { ShowCard } from "@/components/ShowCard";
import { VendorCard } from "@/components/VendorCard";
import {
  CARD_SHOWS,
  VENDORS,
  getExampleCardImage,
  getRecentListings,
  getVendorById,
} from "@/lib/mockData";

const HERO_IMAGES = ["/cardshow1.webp", "/cardshow2.avif", "/cardshow3.jpeg"];

export default function HomePage() {
  const featuredVendors = VENDORS;
  const recentListings = getRecentListings(10);
  const upcomingShows = CARD_SHOWS.filter((show) => show.status === "upcoming");
  const pastShows = CARD_SHOWS.filter((show) => show.status === "past");

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
          <Link
            href="/cards"
            className="rounded-md border border-white/60 px-5 py-2.5 font-medium text-white hover:bg-white/10"
          >
            Browse Cards
          </Link>
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
          <CardCarousel autoAdvance={false}>
            {featuredVendors.map((vendor) => (
              <div key={vendor.id} className="w-72 shrink-0 snap-start sm:w-80">
                <VendorCard vendor={vendor} />
              </div>
            ))}
          </CardCarousel>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="text-2xl font-semibold">Recent listings</h2>
            <Link href="/cards" className="text-sm font-medium text-brand-blue hover:underline">
              Browse all cards
            </Link>
          </div>
          <CardCarousel loop>
            {recentListings.map((item) => {
              const vendor = getVendorById(item.vendorId);
              return (
                <div key={item.id} className="w-40 shrink-0 snap-start sm:w-44">
                  <InventoryCard
                    item={item}
                    vendorName={vendor?.businessName}
                    href={`/vendors/${item.vendorId}/items/${item.id}`}
                    imageSrc={getExampleCardImage(item.id)}
                  />
                </div>
              );
            })}
          </CardCarousel>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="mb-6 text-2xl font-semibold">Upcoming shows</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {upcomingShows.map((show) => (
              <ShowCard key={show.id} show={show} />
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="mb-6 text-2xl font-semibold">Past events</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pastShows.map((show) => (
              <ShowCard key={show.id} show={show} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
