"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthPageSpinner } from "@/components/AuthPageSpinner";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { ShowEvent } from "@/lib/events";

export default function EventVendorsPage() {
  const params = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<ShowEvent | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ShowEvent>(`/events/${params.eventId}/`, { accessToken: getAccessToken() ?? undefined })
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

  if (loading) {
    return <AuthPageSpinner />;
  }

  if (notFound || !event) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Event not found</h1>
        <Link href="/dashboard/admin/events" className="mt-4 text-sm font-medium text-brand-blue hover:underline">
          ← Manage Events
        </Link>
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <Link
          href={`/dashboard/admin/events/${event.id}`}
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Edit Event
        </Link>
        <h1 className="text-2xl font-semibold">Attending vendors</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{event.name}</p>

        {event.vendors_detail.length === 0 ? (
          <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
            No vendors with a confirmed booth yet.
          </p>
        ) : (
          <div className="mt-6 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm dark:divide-gray-800 dark:border-gray-800 dark:bg-transparent">
            {event.vendors_detail.map((vendor) => (
              <Link
                key={vendor.pk}
                href={`/vendors/profile/${vendor.pk}`}
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                <span className="font-medium">{vendor.label}</span>
                <span className="text-xs text-brand-blue">View profile</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
