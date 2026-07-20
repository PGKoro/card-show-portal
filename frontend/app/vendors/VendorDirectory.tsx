"use client";

import { useEffect, useState } from "react";

import { SearchInput } from "@/components/SearchInput";
import { VendorCard, type PublicVendor } from "@/components/VendorCard";
import { apiFetch, type PaginatedResponse } from "@/lib/api";
import { useCategories } from "@/lib/CategoriesContext";

export function VendorDirectory() {
  const { categories } = useCategories();
  const [activeCategory, setActiveCategory] = useState<string | "all">("all");
  const [query, setQuery] = useState("");
  const [allVendors, setAllVendors] = useState<PublicVendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<PaginatedResponse<PublicVendor>>("/vendors/?page_size=100")
      .then((data) => {
        if (!cancelled) setAllVendors(data.results);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  const vendors = allVendors.filter((vendor) => {
    const matchesCategory =
      activeCategory === "all" || vendor.category_tags.includes(activeCategory);
    const matchesQuery =
      normalizedQuery === "" ||
      vendor.business_name.toLowerCase().includes(normalizedQuery) ||
      vendor.business_description.toLowerCase().includes(normalizedQuery) ||
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

      {loading ? null : allVendors.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No vendors listed yet.</p>
      ) : vendors.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No vendors match your search.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {vendors.map((vendor) => (
            <VendorCard key={vendor.pk} vendor={vendor} />
          ))}
        </div>
      )}
    </div>
  );
}
