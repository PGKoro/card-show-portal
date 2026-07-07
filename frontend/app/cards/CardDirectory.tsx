"use client";

import { useState } from "react";

import { InventoryCard } from "@/components/InventoryCard";
import { SearchInput } from "@/components/SearchInput";
import {
  CATEGORY_LABELS,
  INVENTORY_ITEMS,
  getExampleCardImage,
  getVendorById,
  type VendorCategory,
} from "@/lib/mockData";

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as VendorCategory[];

export function CardDirectory() {
  const [activeCategory, setActiveCategory] = useState<VendorCategory | "all">("all");
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();

  const items = INVENTORY_ITEMS.filter((item) => {
    const vendor = getVendorById(item.vendorId);
    const matchesCategory = activeCategory === "all" || item.category === activeCategory;
    const matchesQuery =
      normalizedQuery === "" ||
      item.title.toLowerCase().includes(normalizedQuery) ||
      item.description.toLowerCase().includes(normalizedQuery) ||
      vendor?.businessName.toLowerCase().includes(normalizedQuery);
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

      {items.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No cards match your search.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => {
            const vendor = getVendorById(item.vendorId);
            return (
              <InventoryCard
                key={item.id}
                item={item}
                vendorName={vendor?.businessName}
                href={`/vendors/${item.vendorId}/items/${item.id}`}
                imageSrc={getExampleCardImage(item.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
