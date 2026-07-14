"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { ShowEvent } from "@/lib/events";
import { EventForm, type EventFormPayload } from "../EventForm";

export default function EditEventPage() {
  const params = useParams<{ eventId: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<ShowEvent | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

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

  async function handleSubmit(payload: EventFormPayload) {
    await apiFetch(`/events/${params.eventId}/`, {
      method: "PATCH",
      accessToken: getAccessToken() ?? undefined,
      body: payload,
    });
    router.push("/dashboard/admin/events");
  }

  if (loading) {
    return null;
  }

  if (notFound || !event) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Event not found</h1>
        <Link
          href="/dashboard/admin/events"
          className="mt-4 text-sm font-medium text-brand-blue hover:underline"
        >
          ← Manage Events
        </Link>
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard/admin/events"
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Manage Events
        </Link>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Edit Event</h1>
          <Link
            href={`/dashboard/admin/events/${params.eventId}/map`}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
          >
            Floor Map
          </Link>
        </div>
        <EventForm
          submitLabel="Save changes"
          initialValues={{
            name: event.name,
            venue: event.venue,
            city: event.city,
            description: event.description,
            start_date: event.start_date,
            end_date: event.end_date,
            estimated_cards: event.estimated_cards,
            estimated_attendees: event.estimated_attendees,
            vendors_detail: event.vendors_detail,
          }}
          onSubmit={handleSubmit}
        />
      </div>
    </main>
  );
}
