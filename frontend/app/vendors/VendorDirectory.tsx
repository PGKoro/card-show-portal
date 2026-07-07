"use client";

import { useState } from "react";

import { SearchInput } from "@/components/SearchInput";
import { VendorCard } from "@/components/VendorCard";
import { CATEGORY_LABELS, VENDORS, type VendorCategory } from "@/lib/mockData";

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as VendorCategory[];

export function VendorDirectory() {
  const [activeCategory, setActiveCategory] = useState<VendorCategory | "all">("all");
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();

  const vendors = VENDORS.filter((vendor) => {
    const matchesCategory =
      activeCategory === "all" || vendor.categoryTags.includes(activeCategory);
    const matchesQuery =
      normalizedQuery === "" ||
      vendor.businessName.toLowerCase().includes(normalizedQuery) ||
      vendor.description.toLowerCase().includes(normalizedQuery) ||
      vendor.location.toLowerCase().includes(normalizedQuery);
    return matchesCategory && matchesQuery;
  });

  return (
    <div>
      <div className="mb-4">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search vendors by name, location, or specialty..."
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
        {ALL_CATEGORIES.map((category) => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              activeCategory === category
                ? "bg-brand-navy text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            {CATEGORY_LABELS[category]}
          </button>
        ))}
      </div>

      {vendors.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No vendors match your search.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {vendors.map((vendor) => (
            <VendorCard key={vendor.id} vendor={vendor} />
          ))}
        </div>
      )}
    </div>
  );
}
