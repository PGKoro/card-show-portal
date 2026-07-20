"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthPageSpinner } from "@/components/AuthPageSpinner";
import { FloorMapCanvas } from "@/components/FloorMapCanvas";
import { ApiError, apiFetch } from "@/lib/api";
import type { EventMap } from "@/lib/floorMap";

export default function PublicEventMapPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [map, setMap] = useState<EventMap | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<EventMap>(`/events/${eventId}/map/`)
      .then((data) => {
        if (!cancelled) setMap(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setUnavailable(true);
          return;
        }
        throw err;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (loading) {
    return <AuthPageSpinner />;
  }

  if (unavailable || !map) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Map not available yet</h1>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          The organizer hasn&apos;t published a floor map for this show yet.
        </p>
        <Link
          href={`/events/${eventId}`}
          className="mt-4 text-sm font-medium text-brand-blue hover:underline"
        >
          &larr; Back to event
        </Link>
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <Link
          href={`/events/${eventId}`}
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          &larr; Back to event
        </Link>

        <h1 className="text-2xl font-semibold">Floor Map — {map.name}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Hover a booth for details, or tap it on mobile.
        </p>

        <div className="mt-6">
          <FloorMapCanvas map={map} />
        </div>
      </div>
    </main>
  );
}
