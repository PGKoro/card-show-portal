"use client";

import { useEffect, useState } from "react";

import { ShowCard } from "@/components/ShowCard";
import { apiFetch } from "@/lib/api";
import type { ShowEvent } from "@/lib/events";

export default function EventsPage() {
  const [events, setEvents] = useState<ShowEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ results: ShowEvent[] }>("/events/")
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

  const upcomingShows = [...events]
    .filter((event) => event.status === "upcoming")
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const pastShows = [...events]
    .filter((event) => event.status === "past")
    .sort((a, b) => b.start_date.localeCompare(a.start_date));

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-bold tracking-tight">Browse Events</h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          Card shows and conventions on the Collectors Village network. Click an event for vendor counts,
          estimated cards on the floor, and attendee estimates.
        </p>

        <h2 className="mb-4 mt-10 text-xl font-semibold">Upcoming events</h2>
        {!loading && upcomingShows.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No upcoming events.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {upcomingShows.map((show) => (
              <ShowCard key={show.id} show={show} />
            ))}
          </div>
        )}

        <h2 className="mb-4 mt-12 text-xl font-semibold">Past events</h2>
        {!loading && pastShows.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No past events.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pastShows.map((show) => (
              <ShowCard key={show.id} show={show} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
