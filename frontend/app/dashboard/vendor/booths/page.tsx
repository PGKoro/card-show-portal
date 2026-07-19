"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiFetch, type PaginatedResponse } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { formatEventDateRange, type ShowEvent } from "@/lib/events";

export default function VendorBoothsIndexPage() {
  const [events, setEvents] = useState<ShowEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<PaginatedResponse<ShowEvent>>("/events/?page_size=200", {
      accessToken: getAccessToken() ?? undefined,
    })
      .then((data) => {
        if (!cancelled) setEvents(data.results);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const open = events
    .filter((e) => e.map_visible_to_vendors)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard/vendor"
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← My Inventory
        </Link>
        <h1 className="mb-1 text-2xl font-semibold">Attend an Event</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          Upcoming events with booths available — pick your spot.
        </p>

        {!loading && open.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No events are open for booth selection right now — check back soon.
          </p>
        ) : (
          <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm dark:divide-gray-800 dark:border-gray-800">
            {open.map((event) => (
              <Link
                key={event.id}
                href={`/dashboard/vendor/booths/${event.id}`}
                className="flex flex-wrap items-center justify-between gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                <div>
                  <p className="font-medium">{event.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {formatEventDateRange(event)} · {event.venue}, {event.city}
                  </p>
                </div>
                <span className="text-sm font-medium text-brand-blue">Choose a booth →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
