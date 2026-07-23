"use client";

import Link from "next/link";
import { useEffect, useState, type MouseEvent } from "react";

import { useConfirm } from "@/components/ConfirmDialogProvider";
import { Pagination } from "@/components/Pagination";
import { Spinner } from "@/components/Spinner";
import { ApiError, apiFetch, getApiErrorMessage, type PaginatedResponse } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { Venue } from "@/lib/floorMap";

const PAGE_SIZE = 10;
type VenueTab = "active" | "archived";

export default function AdminVenuesPage() {
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<VenueTab>("active");
  const [activeVenues, setActiveVenues] = useState<Venue[]>([]);
  const [archivedVenues, setArchivedVenues] = useState<Venue[]>([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [activeHasNext, setActiveHasNext] = useState(false);
  const [activeHasPrevious, setActiveHasPrevious] = useState(false);
  const [archivedHasNext, setArchivedHasNext] = useState(false);
  const [archivedHasPrevious, setArchivedHasPrevious] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const shownVenues = activeTab === "active" ? activeVenues : archivedVenues;
  const hasNext = activeTab === "active" ? activeHasNext : archivedHasNext;
  const hasPrevious = activeTab === "active" ? activeHasPrevious : archivedHasPrevious;

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      setLoading(true);

      const baseQuery = `search=${encodeURIComponent(search)}&page_size=${PAGE_SIZE}&page=${page}`;
      const activePromise = apiFetch<PaginatedResponse<Venue>>(`/venues/?${baseQuery}`, {
        accessToken: getAccessToken() ?? undefined,
      });
      const archivedPromise = apiFetch<PaginatedResponse<Venue>>(
        `/venues/?${baseQuery}&status=archived`,
        { accessToken: getAccessToken() ?? undefined },
      );

      Promise.all([activePromise, archivedPromise])
        .then(([activeData, archivedData]) => {
          if (cancelled) return;
          setActiveVenues(activeData.results);
          setActiveHasNext(activeData.next !== null);
          setActiveHasPrevious(activeData.previous !== null);
          setArchivedVenues(archivedData.results);
          setArchivedCount(archivedData.count);
          setArchivedHasNext(archivedData.next !== null);
          setArchivedHasPrevious(archivedData.previous !== null);
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
  }, [search, page]);

  const tabButtonClass = (tab: VenueTab) =>
    `rounded-full px-4 py-2 text-sm font-medium transition ${
      activeTab === tab
        ? "bg-brand-blue text-white shadow-sm"
        : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
    }`;

  async function handleArchive(venue: Venue, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setActionError(null);
    try {
      await apiFetch(`/venues/${venue.id}/`, {
        method: "PATCH",
        body: { archived: true },
        accessToken: getAccessToken() ?? undefined,
      });
      setActiveVenues((current) => current.filter((item) => item.id !== venue.id));
      setArchivedVenues((current) => [{ ...venue, archived: true }, ...current]);
      setArchivedCount((current) => current + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error, `Could not archive "${venue.name}".`));
    }
  }

  async function handleRestore(venue: Venue, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setActionError(null);
    try {
      await apiFetch(`/venues/${venue.id}/`, {
        method: "PATCH",
        body: { archived: false },
        accessToken: getAccessToken() ?? undefined,
      });
      setArchivedVenues((current) => current.filter((item) => item.id !== venue.id));
      setArchivedCount((current) => Math.max(0, current - 1));
      setActiveVenues((current) => [{ ...venue, archived: false }, ...current]);
    } catch (error) {
      setActionError(getApiErrorMessage(error, `Could not restore "${venue.name}".`));
    }
  }

  async function handleDelete(venue: Venue, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setActionError(null);

    const ok = await confirm({
      title: `Permanently delete "${venue.name}"?`,
      message:
        "This can't be undone. Its floor plan, booths, and category zones are removed too; any event that referenced this venue keeps its own record but loses its floor map.",
      confirmLabel: "Delete venue",
      tone: "danger",
    });
    if (!ok) return;

    try {
      await apiFetch(`/venues/${venue.id}/`, {
        method: "DELETE",
        accessToken: getAccessToken() ?? undefined,
      });
      setActiveVenues((current) => current.filter((item) => item.id !== venue.id));
      setArchivedVenues((current) => current.filter((item) => item.id !== venue.id));
      if (venue.archived) setArchivedCount((current) => Math.max(0, current - 1));
    } catch (error) {
      setActionError(getApiErrorMessage(error, `Could not delete "${venue.name}".`));
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

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Manage Venues</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Each venue&apos;s floor plan (image, booths, pricing) is reusable across every event
              held there.
            </p>
          </div>
          <Link
            href="/dashboard/admin/venues/new"
            className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy"
          >
            Add Venue
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap gap-2 border-b border-gray-200 pb-3 dark:border-gray-800">
          <button type="button" onClick={() => setActiveTab("active")} className={tabButtonClass("active")}>
            Active ({activeVenues.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("archived")}
            className={tabButtonClass("archived")}
          >
            Archived ({archivedCount})
          </button>
        </div>

        {activeTab === "archived" && (
          <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
            Archived venues are hidden from the &quot;pick a venue&quot; list when creating or
            editing an event, but any event already using one keeps working — restore it to make
            it selectable again.
          </p>
        )}

        {actionError && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {actionError}
          </p>
        )}

        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name or city..."
          className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
        />

        {loading ? (
          <Spinner />
        ) : shownVenues.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {search
              ? "No matching venues."
              : activeTab === "active"
                ? "No venues yet."
                : "No archived venues."}
          </p>
        ) : (
          <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm dark:divide-gray-800 dark:border-gray-800">
            {shownVenues.map((venue) => (
              <Link
                key={venue.id}
                href={`/dashboard/admin/venues/${venue.id}`}
                className="flex flex-wrap items-center justify-between gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                <div>
                  <p className="font-medium">{venue.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {venue.city || "No city set"}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {venue.booth_count} booth{venue.booth_count === 1 ? "" : "s"}
                  </span>
                  {activeTab === "active" ? (
                    <button
                      type="button"
                      onClick={(e) => handleArchive(venue, e)}
                      className="rounded-md border border-blue-600 bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-blue-700"
                    >
                      Archive
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => handleRestore(venue, e)}
                      className="rounded-md border border-emerald-600 bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-emerald-700"
                    >
                      Restore
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => handleDelete(venue, e)}
                    className="rounded-md border border-red-600 bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              </Link>
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
