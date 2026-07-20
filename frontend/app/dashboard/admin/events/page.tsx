"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Pagination } from "@/components/Pagination";
import { Spinner } from "@/components/Spinner";
import { ApiError, apiFetch, type PaginatedResponse } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { formatEventDateRange, type ShowEvent } from "@/lib/events";

const PAGE_SIZE = 5;

export default function AdminEventsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [events, setEvents] = useState<ShowEvent[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      apiFetch<PaginatedResponse<ShowEvent>>(
        `/events/?search=${encodeURIComponent(search)}&page_size=${PAGE_SIZE}&page=${page}`,
        { accessToken: getAccessToken() ?? undefined },
      )
        .then((data) => {
          if (cancelled) return;
          setEvents(data.results);
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
  }, [search, page]);

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-4xl">
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
              Create events and adjust their details, vendors, and estimates — upcoming or past.
            </p>
          </div>
          <Link
            href="/dashboard/admin/events/new"
            className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy"
          >
            Add Event
          </Link>
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
        ) : events.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {search ? "No matching events." : "No events yet."}
          </p>
        ) : (
          <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm dark:divide-gray-800 dark:border-gray-800">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/dashboard/admin/events/${event.id}`}
                className="flex flex-wrap items-center justify-between gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                <div>
                  <p className="font-medium">{event.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {event.venue}, {event.city} · {formatEventDateRange(event)}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {event.vendor_count} vendors · {event.estimated_cards.toLocaleString()}{" "}
                    estimated cards · {event.estimated_attendees.toLocaleString()} estimated
                    attendees
                  </p>
                </div>
                <span
                  className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    event.status === "upcoming"
                      ? "bg-brand-blue/10 text-brand-blue"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {event.status === "upcoming" ? "Upcoming" : "Completed"}
                </span>
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
