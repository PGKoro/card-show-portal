"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useConfirm } from "@/components/ConfirmDialogProvider";
import { Pagination } from "@/components/Pagination";
import { Spinner } from "@/components/Spinner";
import { ApiError, getApiErrorMessage, apiFetch, type PaginatedResponse } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

const PAGE_SIZE = 5;

type Tier = "premium" | "standard" | "basic";

type VendorResult = {
  pk: number;
  email: string;
  first_name: string;
  last_name: string;
  business_name: string;
  vendor_tier: Tier;
};

type Feedback = { id: number; text: string };

const TIERS: { key: Tier; label: string }[] = [
  { key: "premium", label: "Premium" },
  { key: "standard", label: "Standard" },
  { key: "basic", label: "Basic" },
];

export default function VendorTiersPage() {
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<Tier>("premium");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<VendorResult[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<Tier, number | null>>({
    premium: null,
    standard: null,
    basic: null,
  });
  const [updatingPk, setUpdatingPk] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const nextFeedbackId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;

      setLoading(true);
      const query = `role=vendor&tier=${activeTab}&search=${encodeURIComponent(search)}&page_size=${PAGE_SIZE}&page=${page}`;
      apiFetch<PaginatedResponse<VendorResult>>(`/admin/users/?${query}`, {
        accessToken: getAccessToken() ?? undefined,
      })
        .then((data) => {
          if (cancelled) return;
          setResults(data.results);
          setHasNext(data.next !== null);
          setHasPrevious(data.previous !== null);
        })
        .catch((err) => {
          if (cancelled) return;
          if (err instanceof ApiError && err.status === 404 && page > 1) {
            setPage((current) => current - 1);
            return;
          }
          throw err;
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [activeTab, search, page]);

  // Tab counts are fetched separately (page_size=1, just reading .count) so
  // every tab's number stays visible regardless of which one is active —
  // same approach as the Admin Tools hub page's pending-count badges.
  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      const accessToken = getAccessToken() ?? undefined;
      TIERS.forEach(({ key }) => {
        apiFetch<PaginatedResponse<unknown>>(
          `/admin/users/?role=vendor&tier=${key}&search=${encodeURIComponent(search)}&page_size=1`,
          { accessToken },
        ).then((data) => {
          if (!cancelled) setCounts((current) => ({ ...current, [key]: data.count }));
        });
      });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [search]);

  function pushFeedback(text: string) {
    const note: Feedback = { id: nextFeedbackId.current++, text };
    setFeedback((current) => [note, ...current]);
    setTimeout(() => {
      setFeedback((current) => current.filter((item) => item.id !== note.id));
    }, 4000);
  }

  async function handleSetTier(vendor: VendorResult, tier: Tier) {
    if (tier === vendor.vendor_tier) return;

    const ok = await confirm({
      title: `Move ${vendor.business_name || vendor.email} to ${tier}?`,
      message: `They'll be reassigned to the ${tier} tier immediately.`,
      confirmLabel: "Change tier",
    });
    if (!ok) return;

    setUpdatingPk(vendor.pk);
    try {
      const updated = await apiFetch<VendorResult>(`/admin/users/${vendor.pk}/set-tier/`, {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
        body: { tier },
      });
      // The vendor no longer belongs on this tab once its tier changes —
      // drop it from the current list rather than patch it in place.
      setResults((current) => current.filter((item) => item.pk !== vendor.pk));
      setCounts((current) => ({
        ...current,
        [vendor.vendor_tier]: (current[vendor.vendor_tier] ?? 1) - 1,
        [updated.vendor_tier]: (current[updated.vendor_tier] ?? 0) + 1,
      }));
      pushFeedback(`${vendor.business_name || vendor.email} is now ${tier}.`);
    } catch (err) {
      pushFeedback(getApiErrorMessage(err, `Could not update ${vendor.email}.`));
    } finally {
      setUpdatingPk(null);
    }
  }

  const tabButtonClass = (tier: Tier) =>
    `rounded-full px-4 py-2 text-sm font-medium transition ${
      activeTab === tier
        ? "bg-brand-blue text-white shadow-sm"
        : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
    }`;

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dashboard/admin"
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Admin Tools
        </Link>
        <h1 className="mb-1 text-2xl font-semibold">Vendor Tiers</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          Assign vendors to Premium, Standard, or Basic. Vendors can&apos;t see their own tier.
        </p>

        <div className="mb-4 space-y-2">
          {feedback.map((note) => (
            <div
              key={note.id}
              className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
            >
              {note.text}
            </div>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by email, business name, or name..."
          className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
        />

        <div className="mb-5 flex flex-wrap gap-2">
          {TIERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setActiveTab(key);
                setPage(1);
              }}
              className={tabButtonClass(key)}
            >
              {label} ({counts[key] ?? "…"})
            </button>
          ))}
        </div>

        {loading ? (
          <Spinner />
        ) : results.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {search.trim() ? "No matching vendors." : `No ${activeTab} vendors yet.`}
          </p>
        ) : (
          <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm dark:divide-gray-800 dark:border-gray-800">
            {results.map((vendor) => {
              const isUpdating = updatingPk === vendor.pk;
              return (
                <div key={vendor.pk} className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <Link
                      href={`/vendors/profile/${vendor.pk}`}
                      className="min-w-0 hover:underline"
                    >
                      <p className="font-medium">
                        {vendor.business_name ||
                          [vendor.first_name, vendor.last_name].filter(Boolean).join(" ") ||
                          vendor.email}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{vendor.email}</p>
                    </Link>
                    <div className="flex gap-2">
                      {TIERS.map(({ key, label }) => {
                        const isCurrent = key === vendor.vendor_tier;
                        return (
                          <button
                            key={key}
                            onClick={() => handleSetTier(vendor, key)}
                            disabled={isCurrent || isUpdating}
                            className={`rounded-full px-3.5 py-1.5 text-sm font-medium disabled:opacity-50 ${
                              isCurrent
                                ? "bg-brand-blue text-white"
                                : "border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Pagination
          page={page}
          hasNext={hasNext}
          hasPrevious={hasPrevious}
          onPrevious={() => setPage((current) => current - 1)}
          onNext={() => setPage((current) => current + 1)}
        />
      </div>
    </main>
  );
}
