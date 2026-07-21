"use client";

import Link from "next/link";
import { useEffect, useState, type MouseEvent } from "react";

import { useConfirm } from "@/components/ConfirmDialogProvider";
import { Pagination } from "@/components/Pagination";
import { Spinner } from "@/components/Spinner";
import { ApiError, getApiErrorMessage, apiFetch, type PaginatedResponse } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { formatEventDateRange, type ShowEvent } from "@/lib/events";

const PAGE_SIZE = 5;
type EventTab = "upcoming" | "completed" | "archived";

type TabMeta = {
  label: string;
  badge: string;
  description: string;
};

const TAB_META: Record<EventTab, TabMeta> = {
  upcoming: {
    label: "Upcoming",
    badge: "bg-brand-blue/10 text-brand-blue",
    description: "These are the shows still coming up.",
  },
  completed: {
    label: "Completed",
    badge: "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-200",
    description: "These are finished shows you may want to review or reuse.",
  },
  archived: {
    label: "Archived",
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-200",
    description:
      "Hidden from the public site and vendors — restore one to bring it back to Upcoming or Completed.",
  },
};

export default function AdminEventsPage() {
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<EventTab>("upcoming");
  const [upcomingEvents, setUpcomingEvents] = useState<ShowEvent[]>([]);
  const [completedEvents, setCompletedEvents] = useState<ShowEvent[]>([]);
  const [archivedEvents, setArchivedEvents] = useState<ShowEvent[]>([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [upcomingHasNext, setUpcomingHasNext] = useState(false);
  const [upcomingHasPrevious, setUpcomingHasPrevious] = useState(false);
  const [completedHasNext, setCompletedHasNext] = useState(false);
  const [completedHasPrevious, setCompletedHasPrevious] = useState(false);
  const [archivedHasNext, setArchivedHasNext] = useState(false);
  const [archivedHasPrevious, setArchivedHasPrevious] = useState(false);
  const [loading, setLoading] = useState(true);

  const shownEvents =
    activeTab === "upcoming"
      ? upcomingEvents
      : activeTab === "completed"
        ? completedEvents
        : archivedEvents;
  const hasNext =
    activeTab === "upcoming" ? upcomingHasNext : activeTab === "completed" ? completedHasNext : archivedHasNext;
  const hasPrevious =
    activeTab === "upcoming"
      ? upcomingHasPrevious
      : activeTab === "completed"
        ? completedHasPrevious
        : archivedHasPrevious;
  const tabMeta = TAB_META[activeTab];

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      setLoading(true);

      const baseQuery = `search=${encodeURIComponent(search)}&page_size=${PAGE_SIZE}&page=${page}`;
      const upcomingPromise = apiFetch<PaginatedResponse<ShowEvent>>(
        `/events/?${baseQuery}&status=upcoming`,
        { accessToken: getAccessToken() ?? undefined },
      );
      const completedPromise = apiFetch<PaginatedResponse<ShowEvent>>(
        `/events/?${baseQuery}&status=past`,
        { accessToken: getAccessToken() ?? undefined },
      );
      const archivedPromise = apiFetch<PaginatedResponse<ShowEvent>>(
        `/events/?${baseQuery}&status=archived`,
        { accessToken: getAccessToken() ?? undefined },
      );

      Promise.all([upcomingPromise, completedPromise, archivedPromise])
        .then(([upcomingData, completedData, archivedData]) => {
          if (cancelled) return;
          setUpcomingEvents(upcomingData.results);
          setUpcomingHasNext(upcomingData.next !== null);
          setUpcomingHasPrevious(upcomingData.previous !== null);
          setCompletedEvents(completedData.results);
          setCompletedHasNext(completedData.next !== null);
          setCompletedHasPrevious(completedData.previous !== null);
          setArchivedEvents(archivedData.results);
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

  const tabButtonClass = (tab: EventTab) =>
    `rounded-full px-4 py-2 text-sm font-medium transition ${
      activeTab === tab
        ? "bg-brand-blue text-white shadow-sm"
        : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
    }`;

  async function handleDelete(event: ShowEvent, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDeleteError(null);

    const ok = await confirm({
      title: `Permanently delete "${event.name}"?`,
      message: "This can't be undone. Any booth registrations for this event will be removed too.",
      confirmLabel: "Delete event",
      tone: "danger",
    });
    if (!ok) return;

    try {
      await apiFetch(`/events/${event.id}/`, {
        method: "DELETE",
        accessToken: getAccessToken() ?? undefined,
      });
      setUpcomingEvents((current) => current.filter((item) => item.id !== event.id));
      setCompletedEvents((current) => current.filter((item) => item.id !== event.id));
      setArchivedEvents((current) => current.filter((item) => item.id !== event.id));
      if (event.archived) setArchivedCount((current) => Math.max(0, current - 1));
    } catch (error) {
      setDeleteError(getApiErrorMessage(error, `Could not delete "${event.name}".`));
    }
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/dashboard/admin"
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Admin Tools
        </Link>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Manage Events</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Browse, organize, and archive events from one place.
            </p>
          </div>
          <Link
            href="/dashboard/admin/events/new"
            className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy"
          >
            Add Event
          </Link>
        </div>

        <p className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Events are built around a venue — create the venue in{" "}
          <Link href="/dashboard/admin/venues" className="font-medium underline">
            Manage Venues
          </Link>{" "}
          first, then you&apos;ll be able to select it when adding or editing an event.
        </p>

        <div className="mb-4 flex flex-wrap gap-2 border-b border-gray-200 pb-3 dark:border-gray-800">
          <button type="button" onClick={() => setActiveTab("upcoming")} className={tabButtonClass("upcoming")}>
            Upcoming ({upcomingEvents.length})
          </button>
          <button type="button" onClick={() => setActiveTab("completed")} className={tabButtonClass("completed")}>
            Completed ({completedEvents.length})
          </button>
          <button type="button" onClick={() => setActiveTab("archived")} className={tabButtonClass("archived")}>
            Archived ({archivedCount})
          </button>
        </div>

        <div className="mb-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{tabMeta.label} events</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{tabMeta.description}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tabMeta.badge}`}>
              {tabMeta.label}
            </span>
          </div>
          {activeTab === "archived" && (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Archived events are still part of the list — they simply stay read-only until you restore them.
            </p>
          )}
        </div>

        {deleteError && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {deleteError}
          </p>
        )}

        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name, venue, or city..."
          className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
        />

        {loading ? (
          <Spinner />
        ) : shownEvents.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {search
              ? "No matching events."
              : activeTab === "upcoming"
                ? "No upcoming events yet."
                : activeTab === "completed"
                  ? "No completed events yet."
                  : "No archived events yet."}
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
            {shownEvents.map((event, index) => (
              <Link
                key={event.id}
                href={`/dashboard/admin/events/${event.id}`}
                className={`flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition hover:bg-gray-50 dark:hover:bg-gray-900 ${
                  index !== shownEvents.length - 1 ? "border-b border-gray-100 dark:border-gray-800" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-gray-900 dark:text-gray-50">{event.name}</p>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        event.archived
                          ? TAB_META.archived.badge
                          : activeTab === "upcoming"
                            ? TAB_META.upcoming.badge
                            : TAB_META.completed.badge
                      }`}
                    >
                      {event.archived ? "Archived" : activeTab === "upcoming" ? "Upcoming" : "Completed"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {event.venue}, {event.city} · {formatEventDateRange(event)}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {event.vendor_count} vendors · {event.estimated_cards.toLocaleString()} estimated cards · {event.estimated_attendees.toLocaleString()} estimated attendees
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {activeTab !== "archived" && (
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const accessToken = getAccessToken() ?? undefined;
                        try {
                          await apiFetch(`/events/${event.id}/`, {
                            method: "PATCH",
                            body: { archived: true },
                            accessToken,
                          });
                          const archivedEvent = { ...event, archived: true };
                          setUpcomingEvents((current) => current.filter((item) => item.id !== event.id));
                          setCompletedEvents((current) => current.filter((item) => item.id !== event.id));
                          setArchivedEvents((current) => [archivedEvent, ...current.filter((item) => item.id !== event.id)]);
                          setArchivedCount((current) => current + 1);
                        } catch (error) {
                          console.error("Failed to archive event", error);
                        }
                      }}
                      className="rounded-md border border-blue-600 bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-blue-700"
                    >
                      Archive
                    </button>
                  )}
                  {activeTab === "archived" && (
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const accessToken = getAccessToken() ?? undefined;
                        try {
                          await apiFetch(`/events/${event.id}/`, {
                            method: "PATCH",
                            body: { archived: false },
                            accessToken,
                          });
                          const restoredEvent = { ...event, archived: false };
                          const referenceDate = event.end_date ?? event.start_date;
                          const isCompleted = referenceDate ? new Date(referenceDate) < new Date() : event.status === "past";
                          setArchivedEvents((current) => current.filter((item) => item.id !== event.id));
                          setArchivedCount((current) => Math.max(0, current - 1));
                          if (isCompleted) {
                            setCompletedEvents((current) => [restoredEvent, ...current]);
                          } else {
                            setUpcomingEvents((current) => [restoredEvent, ...current]);
                          }
                        } catch (error) {
                          console.error("Failed to restore event", error);
                        }
                      }}
                      className="rounded-md border border-emerald-600 bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-emerald-700"
                    >
                      Restore
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => handleDelete(event, e)}
                    className="rounded-md border border-red-600 bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-red-700"
                  >
                    Delete
                  </button>
                  <span className="text-sm text-gray-400">→</span>
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
