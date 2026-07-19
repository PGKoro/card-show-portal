"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { InventoryCard } from "@/components/InventoryCard";
import { getApiErrorMessage, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { getAccessToken } from "@/lib/auth";
import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  GRADING_LABELS,
  type GradingCompany,
  type InventoryCondition,
  type InventoryItem,
  type VendorCategory,
} from "@/lib/mockData";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as VendorCategory[];
const CONDITIONS = Object.keys(CONDITION_LABELS) as InventoryCondition[];
const GRADINGS = Object.keys(GRADING_LABELS) as GradingCompany[];

type Listing = {
  id: number;
  title: string;
  description: string;
  category: VendorCategory;
  price: string;
  condition: InventoryCondition;
  grading: GradingCompany;
  status: InventoryItem["status"];
  created_at: string;
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

export default function VendorDashboardPage() {
  const { user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<VendorCategory>("modern");
  const [price, setPrice] = useState("");
  const [condition, setCondition] = useState<InventoryCondition>("near-mint");
  const [grading, setGrading] = useState<GradingCompany>("ungraded");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isApproved = user?.vendor_status === "approved";

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ results: Listing[] }>("/listings/", { accessToken: getAccessToken() ?? undefined })
      .then((data) => {
        if (!cancelled) setListings(data.results);
      })
      .finally(() => {
        if (!cancelled) setLoadingListings(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const created = await apiFetch<Listing>("/listings/", {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
        body: { title, category, price: price || "0", condition, grading, description },
      });
      setListings((current) => [created, ...current]);
      setJustAdded(created.title);
      setFormOpen(false);
      setTitle("");
      setPrice("");
      setGrading("ungraded");
      setDescription("");
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not add item. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">My Inventory</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {user?.business_name || "Your shop"}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/dashboard/vendor/booths"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              Attend an Event
            </Link>
            <Link
              href="/dashboard/settings"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              Profile Settings
            </Link>
            {isApproved && (
              <button
                onClick={() => {
                  setFormOpen((v) => !v);
                  setJustAdded(null);
                }}
                className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy"
              >
                {formOpen ? "Close" : "Add Item"}
              </button>
            )}
          </div>
        </div>

        {user?.vendor_status === "pending_review" && (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            Your vendor account is pending admin approval. You&apos;ll be able to add listings
            once it&apos;s approved — check back soon.
          </div>
        )}

        {user?.vendor_status === "rejected" && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            Your vendor application wasn&apos;t approved, so you can&apos;t add listings. Contact
            us if you think this is a mistake.
          </div>
        )}

        {justAdded && (
          <div className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            &ldquo;{justAdded}&rdquo; added to your inventory.
          </div>
        )}

        {formOpen && isApproved && (
          <form
            onSubmit={handleSubmit}
            className="mb-8 grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-2 dark:border-gray-800"
          >
            <div className="sm:col-span-2">
              <label htmlFor="title" className="block text-sm font-medium">
                Title
              </label>
              <input
                id="title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 2024 Bowman Chrome Rookie Auto"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
              />
            </div>

            <div>
              <label htmlFor="category" className="block text-sm font-medium">
                Category
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as VendorCategory)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="condition" className="block text-sm font-medium">
                Condition
              </label>
              <select
                id="condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value as InventoryCondition)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {CONDITION_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="grading" className="block text-sm font-medium">
                Grading
              </label>
              <select
                id="grading"
                value={grading}
                onChange={(e) => setGrading(e.target.value as GradingCompany)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
              >
                {GRADINGS.map((g) => (
                  <option key={g} value={g}>
                    {GRADING_LABELS[g]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="price" className="block text-sm font-medium">
                Price ($)
              </label>
              <input
                id="price"
                type="number"
                min="0"
                step="0.01"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="description" className="block text-sm font-medium">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
              />
            </div>

            {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-brand-blue px-5 py-2.5 font-medium text-white hover:bg-brand-navy disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Save Item"}
              </button>
            </div>
          </form>
        )}

        {!loadingListings && listings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No items yet.
          </p>
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
