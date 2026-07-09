"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Pagination } from "@/components/Pagination";
import { ApiError, getApiErrorMessage, apiFetch, type PaginatedResponse } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { CATEGORY_LABELS, type VendorCategory } from "@/lib/mockData";

const PAGE_SIZE = 5;

type PendingVendor = {
  pk: number;
  email: string;
  business_name: string;
  category_tags: VendorCategory[];
  date_joined: string;
};

type Feedback = { id: number; text: string };

export default function VendorApprovalsPage() {
  const [pending, setPending] = useState<PendingVendor[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const nextFeedbackId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      apiFetch<PaginatedResponse<PendingVendor>>(
        `/admin/vendors/pending/?page_size=${PAGE_SIZE}&page=${page}`,
        { accessToken: getAccessToken() ?? undefined },
      )
        .then((data) => {
          if (cancelled) return;
          if (data.results.length === 0 && page > 1) {
            setPage((current) => current - 1);
            return;
          }
          setPending(data.results);
          setHasNext(data.next !== null);
          setHasPrevious(data.previous !== null);
        })
        .catch((err) => {
          if (cancelled) return;
          // DRF 404s a page number past the last one — e.g. approving the
          // only item on the last page. Step back instead of getting stuck.
          if (err instanceof ApiError && err.status === 404 && page > 1) {
            setPage((current) => current - 1);
            return;
          }
          throw err;
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [page, refreshKey]);

  function pushFeedback(text: string) {
    const note: Feedback = { id: nextFeedbackId.current++, text };
    setFeedback((current) => [note, ...current]);
    setTimeout(() => {
      setFeedback((current) => current.filter((item) => item.id !== note.id));
    }, 4000);
  }

  async function handleDecision(vendor: PendingVendor, decision: "approve" | "reject") {
    try {
      await apiFetch(`/admin/vendors/${vendor.pk}/${decision}/`, {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
      });
      pushFeedback(
        `${vendor.business_name} ${decision === "approve" ? "approved ✓" : "rejected ✕"}.`,
      );
      setRefreshKey((current) => current + 1);
    } catch (err) {
      pushFeedback(getApiErrorMessage(err, `Could not ${decision} ${vendor.business_name}.`));
    }
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dashboard/admin"
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Admin Tools
        </Link>
        <h1 className="mb-1 text-2xl font-semibold">Pending Vendor Approvals</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          New vendor signups waiting for review before they can list inventory.
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

        {!loading && pending.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No pending approvals right now.
          </p>
        ) : (
          <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm dark:divide-gray-800 dark:border-gray-800">
            {pending.map((vendor) => (
              <div key={vendor.pk} className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-medium">{vendor.business_name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{vendor.email}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {vendor.category_tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      >
                        {CATEGORY_LABELS[tag]}
                      </span>
                    ))}
                    <span className="text-xs text-gray-400">
                      Submitted {new Date(vendor.date_joined).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDecision(vendor, "approve")}
                    className="rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleDecision(vendor, "reject")}
                    className="rounded-md border border-gray-300 px-3.5 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
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
