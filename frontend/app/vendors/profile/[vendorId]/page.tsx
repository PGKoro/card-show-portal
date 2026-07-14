"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { InventoryCard } from "@/components/InventoryCard";
import { apiFetch, type PaginatedResponse } from "@/lib/api";
import {
  CATEGORY_LABELS,
  type GradingCompany,
  type InventoryCondition,
  type InventoryItem,
  type VendorCategory,
} from "@/lib/mockData";

type PublicVendor = {
  pk: number;
  business_name: string;
  business_description: string;
  location: string;
  category_tags: VendorCategory[];
};

type Listing = {
  id: number;
  title: string;
  description: string;
  category: VendorCategory;
  price: string;
  condition: InventoryCondition;
  grading: GradingCompany;
  status: InventoryItem["status"];
};

function toInventoryItem(listing: Listing): InventoryItem {
  return {
    id: String(listing.id),
    vendorId: "",
    category: listing.category,
    title: listing.title,
    price: Number(listing.price),
    condition: listing.condition,
    grading: listing.grading,
    status: listing.status,
    description: listing.description,
  };
}

export default function PublicVendorProfilePage() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const [vendor, setVendor] = useState<PublicVendor | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<PublicVendor>(`/vendors/${vendorId}/`),
      apiFetch<PaginatedResponse<Listing>>(`/vendors/${vendorId}/listings/?page_size=100`),
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

  if (loading) {
    return null;
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

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <Link href="/vendors" className="text-sm font-medium text-brand-blue hover:underline">
          &larr; Back to all vendors
        </Link>

        <div className="mt-4">
          <h1 className="text-3xl font-bold tracking-tight">{vendor.business_name}</h1>
          {vendor.location && (
            <p className="mt-1 text-gray-500 dark:text-gray-400">{vendor.location}</p>
          )}
          {vendor.business_description && (
            <p className="mt-3 max-w-2xl text-gray-600 dark:text-gray-300">
              {vendor.business_description}
            </p>
          )}
          {vendor.category_tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {vendor.category_tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                >
                  {CATEGORY_LABELS[tag]}
                </span>
              ))}
            </div>
          )}
        </div>

        <h2 className="mb-4 mt-10 text-xl font-semibold">
          Inventory <span className="text-gray-400">({listings.length})</span>
        </h2>
        {listings.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No items listed yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {listings.map((listing) => (
              <InventoryCard key={listing.id} item={toInventoryItem(listing)} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
