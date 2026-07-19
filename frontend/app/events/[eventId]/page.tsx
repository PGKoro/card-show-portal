"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { FloorMapCanvas } from "@/components/FloorMapCanvas";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { formatEventDateRange, getEventImage, type ShowEvent } from "@/lib/events";
import type { EventMap } from "@/lib/floorMap";

export default function EventDetailPage() {
  const params = useParams<{ eventId: string }>();
  const { user } = useAuth();
  const [event, setEvent] = useState<ShowEvent | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [map, setMap] = useState<EventMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ShowEvent>(`/events/${params.eventId}/`)
      .then((data) => {
        if (!cancelled) setEvent(data);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.eventId]);

  useEffect(() => {
    if (!event?.map_visible) return;
    let cancelled = false;
    apiFetch<EventMap>(`/events/${event.id}/map/`)
      .then((data) => {
        if (!cancelled) setMap(data);
      })
      .catch(() => {
        // Quietly skip the section — this can only happen if visibility was
        // just turned off, which the next event fetch will reflect anyway.
      });
    return () => {
      cancelled = true;
    };
  }, [event?.id, event?.map_visible]);

  if (loading) {
    return null;
  }

  if (notFound || !event) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Event not found</h1>
        <Link href="/events" className="mt-4 text-sm font-medium text-brand-blue hover:underline">
          &larr; Back to all events
        </Link>
      </main>
    );
  }

  const stats = [
    { label: "Vendors", value: event.vendor_count.toLocaleString() },
    { label: "Estimated cards", value: event.estimated_cards.toLocaleString() },
    {
      label: event.status === "upcoming" ? "Projected attendees" : "Attendees",
      value: event.estimated_attendees.toLocaleString(),
    },
  ];

  const canSelectBooth =
    event.status === "upcoming" &&
    event.map_visible_to_vendors &&
    user?.role === "vendor" &&
    user?.vendor_status === "approved";

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <Link href="/events" className="text-sm font-medium text-brand-blue hover:underline">
          &larr; Back to all events
        </Link>

        <div className="relative mt-4 h-56 w-full overflow-hidden rounded-lg sm:h-72">
          <Image
            src={getEventImage(event.id)}
            alt={`${event.name} card show floor`}
            fill
            className="object-cover"
          />
        </div>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{event.name}</h1>
            <p className="mt-1 text-gray-500 dark:text-gray-400">
              {event.venue}, {event.city}
            </p>
            <p className="text-gray-500 dark:text-gray-400">{formatEventDateRange(event)}</p>
          </div>
          <span
            className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium ${
              event.status === "upcoming"
                ? "bg-brand-blue/10 text-brand-blue"
                : "bg-gray-200 text-gray-600"
            }`}
          >
            {event.status === "upcoming" ? "Upcoming" : "Completed"}
          </span>
        </div>

        <p className="mt-4 max-w-2xl text-gray-600 dark:text-gray-300">{event.description}</p>

        {event.vendors_detail.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {event.vendors_detail.map((vendor) => (
              <span
                key={vendor.pk}
                className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                {vendor.label}
              </span>
            ))}
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-gray-200 bg-white p-5 text-center shadow-sm dark:border-gray-800"
            >
              <p className="text-2xl font-bold text-brand-navy">{stat.value}</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
            </div>
          ))}
        </div>

        {canSelectBooth && (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-brand-blue/30 bg-brand-blue/5 p-5">
            <div>
              <p className="font-semibold">Booths are open for this show</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Pick your spot before they fill up.
              </p>
            </div>
            <Link
              href={`/dashboard/vendor/booths/${event.id}`}
              className="whitespace-nowrap rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy"
            >
              Select a Booth
            </Link>
          </div>
        )}

        {map && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold">Floor Map</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Hover a booth for details, or tap it on mobile.
            </p>
            <div className="mt-3">
              <FloorMapCanvas map={map} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
