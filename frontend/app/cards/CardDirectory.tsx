"use client";

import { useEffect, useState } from "react";

import { InventoryCard } from "@/components/InventoryCard";
import { SearchInput } from "@/components/SearchInput";
import { Spinner } from "@/components/Spinner";
import { apiFetch, type PaginatedResponse } from "@/lib/api";
import { useCategories } from "@/lib/CategoriesContext";
import type { GradingCompany, InventoryCondition, InventoryItem } from "@/lib/mockData";

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

function toInventoryItem(listing: PublicListing): InventoryItem {
  return {
    id: String(listing.id),
    vendorId: String(listing.vendor),
    category: listing.category,
    title: listing.title,
    price: Number(listing.price),
    condition: listing.condition,
    grading: listing.grading,
    status: listing.status,
    description: listing.description,
  };
}

export function CardDirectory() {
  const { categories } = useCategories();
  const [activeCategory, setActiveCategory] = useState<string | "all">("all");
  const [query, setQuery] = useState("");
  const [allListings, setAllListings] = useState<PublicListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<PaginatedResponse<PublicListing>>("/listings/public/?page_size=100")
      .then((data) => {
        if (!cancelled) setAllListings(data.results);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  const listings = allListings.filter((listing) => {
    const matchesCategory = activeCategory === "all" || listing.category === activeCategory;
    const matchesQuery =
      normalizedQuery === "" ||
      listing.title.toLowerCase().includes(normalizedQuery) ||
      listing.description.toLowerCase().includes(normalizedQuery) ||
      listing.vendor_name.toLowerCase().includes(normalizedQuery);
    return matchesCategory && matchesQuery;
  });

  return (
    <div>
      <div className="mb-4">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search cards by name or vendor..."
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory("all")}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
            activeCategory === "all"
              ? "bg-brand-navy text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
          }`}
        >
          All
        </button>
        {categories.map((category) => (
          <button
            key={category.slug}
            onClick={() => setActiveCategory(category.slug)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              activeCategory === category.slug
                ? "bg-brand-navy text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : allListings.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No cards listed yet.</p>
      ) : listings.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No cards match your search.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {listings.map((listing) => (
            <InventoryCard
              key={listing.id}
              item={toInventoryItem(listing)}
              vendorName={listing.vendor_name}
              href={`/cards/${listing.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
