"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Pagination } from "@/components/Pagination";
import { Spinner } from "@/components/Spinner";
import { ApiError, apiFetch, type PaginatedResponse } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { formatEventDateRange, type ShowEvent } from "@/lib/events";

const PAGE_SIZE = 5;
type EventTab = "upcoming" | "completed" | "archived";
type DemoEvent = Omit<ShowEvent, "archived"> & { archived?: boolean };

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
    description: "These are archived for reference only.",
  },
};

const DEMO_UPCOMING_EVENTS: DemoEvent[] = [
  {
    id: 9001,
    name: "Spring Card Classic",
    venue: "Metro Convention Center",
    city: "Dallas, TX",
    description: "Demo upcoming event for the admin page.",
    start_date: "2026-08-14",
    end_date: "2026-08-15",
    vendors: [],
    vendors_detail: [],
    vendor_count: 28,
    estimated_cards: 125000,
    estimated_attendees: 3100,
    status: "upcoming",
    archived: false,
    map_venue: null,
    map_venue_detail: null,
    map_visible: false,
    map_visible_to_vendors: false,
    loyalty_priority_deadline: null,
  },
  {
    id: 9002,
    name: "Summer Hobby Showcase",
    venue: "Civic Expo Hall",
    city: "Phoenix, AZ",
    description: "Demo upcoming event for the admin page.",
    start_date: "2026-09-05",
    end_date: "2026-09-06",
    vendors: [],
    vendors_detail: [],
    vendor_count: 35,
    estimated_cards: 165000,
    estimated_attendees: 4200,
    status: "upcoming",
    archived: false,
    map_venue: null,
    map_venue_detail: null,
    map_visible: false,
    map_visible_to_vendors: false,
    loyalty_priority_deadline: null,
  },
  {
    id: 9003,
    name: "Collectors Weekend",
    venue: "Bayfront Center",
    city: "Tampa, FL",
    description: "Demo upcoming event for the admin page.",
    start_date: "2026-09-19",
    end_date: "2026-09-20",
    vendors: [],
    vendors_detail: [],
    vendor_count: 24,
    estimated_cards: 94000,
    estimated_attendees: 2600,
    status: "upcoming",
    archived: false,
    map_venue: null,
    map_venue_detail: null,
    map_visible: false,
    map_visible_to_vendors: false,
    loyalty_priority_deadline: null,
  },
  {
    id: 9004,
    name: "Autumn Sports & TCG Expo",
    venue: "Grand Arena Hall",
    city: "Columbus, OH",
    description: "Demo upcoming event for the admin page.",
    start_date: "2026-10-03",
    end_date: "2026-10-04",
    vendors: [],
    vendors_detail: [],
    vendor_count: 31,
    estimated_cards: 147000,
    estimated_attendees: 3900,
    status: "upcoming",
    archived: false,
    map_venue: null,
    map_venue_detail: null,
    map_visible: false,
    map_visible_to_vendors: false,
    loyalty_priority_deadline: null,
  },
  {
    id: 9005,
    name: "Holiday Card Bash",
    venue: "Riverfront Expo",
    city: "Nashville, TN",
    description: "Demo upcoming event for the admin page.",
    start_date: "2026-11-21",
    end_date: "2026-11-22",
    vendors: [],
    vendors_detail: [],
    vendor_count: 18,
    estimated_cards: 72000,
    estimated_attendees: 1800,
    status: "upcoming",
    archived: false,
    map_venue: null,
    map_venue_detail: null,
    map_visible: false,
    map_visible_to_vendors: false,
    loyalty_priority_deadline: null,
  },
];

const DEMO_COMPLETED_EVENTS: DemoEvent[] = [
  {
    id: 9101,
    name: "Winter Card Expo",
    venue: "Lakeside Convention Center",
    city: "Chicago, IL",
    description: "Demo completed event for the admin page.",
    start_date: "2026-01-10",
    end_date: "2026-01-11",
    vendors: [],
    vendors_detail: [],
    vendor_count: 42,
    estimated_cards: 210000,
    estimated_attendees: 5200,
    status: "past",
    archived: false,
    map_venue: null,
    map_venue_detail: null,
    map_visible: false,
    map_visible_to_vendors: false,
    loyalty_priority_deadline: null,
  },
  {
    id: 9102,
    name: "New Year Collectors Con",
    venue: "Harbor Hall",
    city: "San Diego, CA",
    description: "Demo completed event for the admin page.",
    start_date: "2026-02-07",
    end_date: "2026-02-08",
    vendors: [],
    vendors_detail: [],
    vendor_count: 36,
    estimated_cards: 154000,
    estimated_attendees: 4100,
    status: "past",
    archived: false,
    map_venue: null,
    map_venue_detail: null,
    map_visible: false,
    map_visible_to_vendors: false,
    loyalty_priority_deadline: null,
  },
  {
    id: 9103,
    name: "Vintage Card Weekend",
    venue: "Civic Center",
    city: "Milwaukee, WI",
    description: "Demo completed event for the admin page.",
    start_date: "2026-03-15",
    end_date: "2026-03-16",
    vendors: [],
    vendors_detail: [],
    vendor_count: 22,
    estimated_cards: 88000,
    estimated_attendees: 2300,
    status: "past",
    archived: false,
    map_venue: null,
    map_venue_detail: null,
    map_visible: false,
    map_visible_to_vendors: false,
    loyalty_priority_deadline: null,
  },
  {
    id: 9104,
    name: "Spring Showcase",
    venue: "State Fair Expo",
    city: "Indianapolis, IN",
    description: "Demo completed event for the admin page.",
    start_date: "2026-04-12",
    end_date: "2026-04-13",
    vendors: [],
    vendors_detail: [],
    vendor_count: 29,
    estimated_cards: 132000,
    estimated_attendees: 3400,
    status: "past",
    archived: false,
    map_venue: null,
    map_venue_detail: null,
    map_visible: false,
    map_visible_to_vendors: false,
    loyalty_priority_deadline: null,
  },
  {
    id: 9105,
    name: "Collectors Invitational",
    venue: "Downtown Event Hall",
    city: "Atlanta, GA",
    description: "Demo completed event for the admin page.",
    start_date: "2026-05-24",
    end_date: "2026-05-24",
    vendors: [],
    vendors_detail: [],
    vendor_count: 26,
    estimated_cards: 97000,
    estimated_attendees: 2800,
    status: "past",
    archived: false,
    map_venue: null,
    map_venue_detail: null,
    map_visible: false,
    map_visible_to_vendors: false,
    loyalty_priority_deadline: null,
  },
];

const DEMO_ARCHIVED_EVENTS: DemoEvent[] = [
  {
    id: 9201,
    name: "Archived Card Swap 1",
    venue: "Archive Hall",
    city: "Orlando, FL",
    description: "Demo archived event for the admin page.",
    start_date: "2025-01-18",
    end_date: "2025-01-18",
    vendors: [],
    vendors_detail: [],
    vendor_count: 12,
    estimated_cards: 42000,
    estimated_attendees: 900,
    status: "past",
    archived: true,
    map_venue: null,
    map_venue_detail: null,
    map_visible: false,
    map_visible_to_vendors: false,
    loyalty_priority_deadline: null,
  },
  {
    id: 9202,
    name: "Archived Card Swap 2",
    venue: "Archive Hall",
    city: "Orlando, FL",
    description: "Demo archived event for the admin page.",
    start_date: "2025-02-15",
    end_date: "2025-02-16",
    vendors: [],
    vendors_detail: [],
    vendor_count: 14,
    estimated_cards: 51000,
    estimated_attendees: 1100,
    status: "past",
    archived: true,
    map_venue: null,
    map_venue_detail: null,
    map_visible: false,
    map_visible_to_vendors: false,
    loyalty_priority_deadline: null,
  },
  {
    id: 9203,
    name: "Archived Card Swap 3",
    venue: "Archive Hall",
    city: "Orlando, FL",
    description: "Demo archived event for the admin page.",
    start_date: "2025-03-22",
    end_date: "2025-03-22",
    vendors: [],
    vendors_detail: [],
    vendor_count: 11,
    estimated_cards: 38000,
    estimated_attendees: 800,
    status: "past",
    archived: true,
    map_venue: null,
    map_venue_detail: null,
    map_visible: false,
    map_visible_to_vendors: false,
    loyalty_priority_deadline: null,
  },
  {
    id: 9204,
    name: "Archived Card Swap 4",
    venue: "Archive Hall",
    city: "Orlando, FL",
    description: "Demo archived event for the admin page.",
    start_date: "2025-04-12",
    end_date: "2025-04-13",
    vendors: [],
    vendors_detail: [],
    vendor_count: 16,
    estimated_cards: 58000,
    estimated_attendees: 1300,
    status: "past",
    archived: true,
    map_venue: null,
    map_venue_detail: null,
    map_visible: false,
    map_visible_to_vendors: false,
    loyalty_priority_deadline: null,
  },
  {
    id: 9205,
    name: "Archived Card Swap 5",
    venue: "Archive Hall",
    city: "Orlando, FL",
    description: "Demo archived event for the admin page.",
    start_date: "2025-05-10",
    end_date: "2025-05-10",
    vendors: [],
    vendors_detail: [],
    vendor_count: 13,
    estimated_cards: 46000,
    estimated_attendees: 950,
    status: "past",
    archived: true,
    map_venue: null,
    map_venue_detail: null,
    map_visible: false,
    map_visible_to_vendors: false,
    loyalty_priority_deadline: null,
  },
];

export default function AdminEventsPage() {
  const [search, setSearch] = useState("");
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
  const [loading, setLoading] = useState(true);

  const activeEvents =
    activeTab === "upcoming"
      ? upcomingEvents
      : activeTab === "completed"
        ? completedEvents
        : archivedEvents;
  const demoEvents =
    activeTab === "upcoming"
      ? DEMO_UPCOMING_EVENTS
      : activeTab === "completed"
        ? DEMO_COMPLETED_EVENTS
        : DEMO_ARCHIVED_EVENTS;
  const shownEvents = !search.trim() && !loading && activeEvents.length === 0 ? demoEvents : activeEvents;
  const hasNext = activeTab === "upcoming" ? upcomingHasNext : completedHasNext;
  const hasPrevious = activeTab === "upcoming" ? upcomingHasPrevious : completedHasPrevious;
  const tabMeta = TAB_META[activeTab];
  const tabCount = activeTab === "upcoming" ? upcomingEvents.length : activeTab === "completed" ? completedEvents.length : archivedCount;

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
            Upcoming ({upcomingEvents.length || DEMO_UPCOMING_EVENTS.length})
          </button>
          <button type="button" onClick={() => setActiveTab("completed")} className={tabButtonClass("completed")}>
            Completed ({completedEvents.length || DEMO_COMPLETED_EVENTS.length})
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
                  <span className="text-sm text-gray-400">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {activeTab === "archived" ? (
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Archived events are currently read-only examples.
          </p>
        ) : (
          <Pagination
            page={page}
            hasNext={hasNext}
            hasPrevious={hasPrevious}
            onPrevious={() => setPage((current) => current - 1)}
            onNext={() => setPage((current) => current + 1)}
          />
        )}
      </div>
    </main>
  );
}
