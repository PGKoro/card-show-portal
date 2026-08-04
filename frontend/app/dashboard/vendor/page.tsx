"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { InventoryCard } from "@/components/InventoryCard";
import { Spinner } from "@/components/Spinner";
import { apiFetch, getApiErrorMessage, type PaginatedResponse } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { getAccessToken } from "@/lib/auth";
import { useCategories } from "@/lib/CategoriesContext";
import { formatEventDateRange } from "@/lib/events";
import { CARDS_FEATURE_ENABLED } from "@/lib/features";
import type { VendorBoothRegistration } from "@/lib/floorMap";
import { GRADE_VALUES, GRADING_LABELS, type GradingCompany, type InventoryItem } from "@/lib/mockData";

const GRADINGS = Object.keys(GRADING_LABELS) as GradingCompany[];

function formatRegistrationAddress(registration: VendorBoothRegistration): string {
  const parts = [registration.event_address_line1].filter(Boolean);
  const cityStateZip = [
    registration.event_city,
    [registration.event_state, registration.event_zip_code].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  if (cityStateZip) parts.push(cityStateZip);
  return parts.join(", ");
}

type BookingBadge = "Requested" | "Accepted" | "Completed";

const BOOKING_BADGE_STYLES: Record<BookingBadge, string> = {
  Requested: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  Accepted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  Completed: "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function bookingBadge(registration: VendorBoothRegistration): BookingBadge | null {
  if (registration.status === "requested") return "Requested";
  if (registration.status === "confirmed") {
    return registration.event_status === "past" ? "Completed" : "Accepted";
  }
  return null;
}

type ShowTab = "requested" | "accepted" | "completed";

const SHOW_TABS: { key: ShowTab; label: string; badge: BookingBadge }[] = [
  { key: "requested", label: "Booth Requests", badge: "Requested" },
  { key: "accepted", label: "Accepted", badge: "Accepted" },
  { key: "completed", label: "Completed", badge: "Completed" },
];

function MyShowsSection() {
  const [registrations, setRegistrations] = useState<VendorBoothRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  // Defaults to "requested" — a vendor's most actionable/time-sensitive
  // registrations (awaiting an admin decision) — rather than surfacing
  // everything at once.
  const [activeTab, setActiveTab] = useState<ShowTab>("requested");

  useEffect(() => {
    let cancelled = false;
    apiFetch<PaginatedResponse<VendorBoothRegistration>>(
      "/events/registrations/mine/?page_size=100",
      { accessToken: getAccessToken() ?? undefined },
    )
      .then((data) => {
        if (!cancelled) setRegistrations(data.results);
      })
      .catch(() => {
        // Not fatal to the dashboard — just leave the section empty.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const bookings = registrations
    .map((registration) => ({ registration, badge: bookingBadge(registration) }))
    .filter((row): row is { registration: VendorBoothRegistration; badge: BookingBadge } =>
      row.badge !== null,
    );

  const tabButtonClass = (tab: ShowTab) =>
    `rounded-full px-4 py-2 text-sm font-medium transition ${
      activeTab === tab
        ? "bg-brand-blue text-white shadow-sm"
        : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
    }`;

  const rowsByTab = Object.fromEntries(
    SHOW_TABS.map(({ key, badge }) => [
      key,
      bookings
        .filter((row) => row.badge === badge)
        .sort((a, b) =>
          key === "completed"
            ? b.registration.event_start_date.localeCompare(a.registration.event_start_date)
            : a.registration.event_start_date.localeCompare(b.registration.event_start_date),
        ),
    ]),
  ) as Record<ShowTab, typeof bookings>;

  const activeRows = rowsByTab[activeTab];
  const emptyMessage: Record<ShowTab, string> = {
    requested: "You don't have any pending booth requests.",
    accepted: "No accepted booths yet — once an organizer confirms a request, it'll show up here.",
    completed: "No completed shows yet.",
  };

  return (
    <div className="mb-8">
      <h2 className="mb-3 text-lg font-semibold">My Shows</h2>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2 border-b border-gray-200 pb-3 dark:border-gray-800">
            {SHOW_TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={tabButtonClass(key)}
              >
                {label} ({rowsByTab[key].length})
              </button>
            ))}
          </div>

          {activeRows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              {emptyMessage[activeTab]}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeRows.map(({ registration, badge }) => (
                <Link
                  key={registration.id}
                  href={`/events/${registration.event}`}
                  className="group rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-800 dark:bg-gray-900"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold group-hover:underline">{registration.event_name}</p>
                    <span
                      className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${BOOKING_BADGE_STYLES[badge]}`}
                    >
                      {badge}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {formatEventDateRange({
                      start_date: registration.event_start_date,
                      end_date: registration.event_end_date,
                    })}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {registration.event_venue}
                    {formatRegistrationAddress(registration)
                      ? `, ${formatRegistrationAddress(registration)}`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    Booth {registration.booth_number} · ${registration.price}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

type Listing = {
  id: number;
  title: string;
  description: string;
  category: string;
  price: string;
  grading: GradingCompany;
  grade: string | null;
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
    grading: listing.grading,
    grade: listing.grade !== null ? Number(listing.grade) : null,
    status: listing.status,
    description: listing.description,
  };
}

export default function VendorDashboardPage() {
  const { user } = useAuth();
  const { categories } = useCategories();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loadingListings, setLoadingListings] = useState(CARDS_FEATURE_ENABLED);
  const [formOpen, setFormOpen] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [grading, setGrading] = useState<GradingCompany>("ungraded");
  const [grade, setGrade] = useState(GRADE_VALUES[0]);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isApproved = user?.vendor_status === "approved";

  useEffect(() => {
    if (!CARDS_FEATURE_ENABLED) return;
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

  // Defaults the form's category dropdown to the first available category
  // once the live list loads — mirrors the old hardcoded "modern" default,
  // just resolved from real data instead. Derived at render time rather
  // than synced via an effect, since it's just picking a fallback display
  // value, not synchronizing with an external system.
  const effectiveCategory = category || categories[0]?.slug || "";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const created = await apiFetch<Listing>("/listings/", {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
        body: {
          title,
          category: effectiveCategory,
          price: price || "0",
          grading,
          grade: grading === "ungraded" ? null : grade,
          description,
        },
      });
      setListings((current) => [created, ...current]);
      setJustAdded(created.title);
      setFormOpen(false);
      setTitle("");
      setPrice("");
      setGrading("ungraded");
      setGrade(GRADE_VALUES[0]);
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
            <h1 className="text-2xl font-semibold">
              {CARDS_FEATURE_ENABLED ? "My Inventory" : "Vendor Dashboard"}
            </h1>
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
            {CARDS_FEATURE_ENABLED && isApproved && (
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

        <MyShowsSection />

        {CARDS_FEATURE_ENABLED && user?.vendor_status === "pending_review" && (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            Your vendor account is pending admin approval. You&apos;ll be able to add listings
            once it&apos;s approved — check back soon.
          </div>
        )}

        {CARDS_FEATURE_ENABLED && user?.vendor_status === "rejected" && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            Your vendor application wasn&apos;t approved, so you can&apos;t add listings. Contact
            us if you think this is a mistake.
          </div>
        )}

        {CARDS_FEATURE_ENABLED && justAdded && (
          <div className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            &ldquo;{justAdded}&rdquo; added to your inventory.
          </div>
        )}

        {CARDS_FEATURE_ENABLED && formOpen && isApproved && (
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
                value={effectiveCategory}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
              >
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
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

            {grading !== "ungraded" && (
              <div>
                <label htmlFor="grade" className="block text-sm font-medium">
                  Grade
                </label>
                <select
                  id="grade"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
                >
                  {GRADE_VALUES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            )}

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

        {CARDS_FEATURE_ENABLED &&
          (loadingListings ? (
            <Spinner />
          ) : listings.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
              No items yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {listings.map((listing) => (
                <InventoryCard key={listing.id} item={toInventoryItem(listing)} />
              ))}
            </div>
          ))}
      </div>
    </main>
  );
}
