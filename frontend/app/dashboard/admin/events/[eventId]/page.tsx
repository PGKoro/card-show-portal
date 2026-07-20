"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { AuthPageSpinner } from "@/components/AuthPageSpinner";
import { apiFetch, getApiErrorMessage } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { ShowEvent } from "@/lib/events";
import { EventForm, type EventFormPayload } from "../EventForm";

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function FloorPlanPanel({ event, onEventUpdate }: { event: ShowEvent; onEventUpdate: (e: ShowEvent) => void }) {
  const [mapVisible, setMapVisible] = useState(event.map_visible);
  const [mapVisibleToVendors, setMapVisibleToVendors] = useState(event.map_visible_to_vendors);
  const [loyaltyDeadline, setLoyaltyDeadline] = useState(
    toDatetimeLocal(event.loyalty_priority_deadline),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const hasVenue = Boolean(event.map_venue_detail);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiFetch<ShowEvent>(`/events/${event.id}/`, {
        method: "PATCH",
        accessToken: getAccessToken() ?? undefined,
        body: {
          map_visible: mapVisible,
          map_visible_to_vendors: mapVisibleToVendors,
          loyalty_priority_deadline: loyaltyDeadline
            ? new Date(loyaltyDeadline).toISOString()
            : null,
        },
      });
      onEventUpdate(updated);
      setSaved(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save floor plan settings."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-8 rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-transparent">
      <h2 className="text-lg font-semibold">Floor Plan &amp; Booths</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Pick a floor plan venue above, then control who can see it here.
      </p>

      {!hasVenue ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Link a floor plan venue above (and save) to enable booth visibility and requests.
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700">
            <span>{event.map_venue_detail!.name}</span>
            <Link
              href={`/dashboard/admin/venues/${event.map_venue_detail!.pk}`}
              className="text-brand-blue hover:underline"
            >
              Edit floor plan
            </Link>
          </div>

          <form onSubmit={handleSave} className="mt-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mapVisibleToVendors}
              onChange={(e) => setMapVisibleToVendors(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Visible to vendors (booth self-selection open)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mapVisible}
              onChange={(e) => setMapVisible(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Visible to the public
          </label>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Loyalty priority deadline <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="datetime-local"
            value={loyaltyDeadline}
            onChange={(e) => setLoyaltyDeadline(e.target.value)}
            className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Until this passes, a vendor who held a booth at this venue&apos;s most recent event
            gets first right of refusal on that same booth.
          </p>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {saved && !error && (
          <p className="text-sm text-green-600 dark:text-green-400">Saved.</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save floor plan settings"}
          </button>
          <Link
            href={`/dashboard/admin/events/${event.id}/registrations`}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
          >
            Review booth requests
          </Link>
        </div>
          </form>
        </>
      )}
    </div>
  );
}

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
    return <AuthPageSpinner />;
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
        <h1 className="mb-6 text-2xl font-semibold">Edit Event</h1>
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
            map_venue: event.map_venue,
            map_venue_detail: event.map_venue_detail,
          }}
          onSubmit={handleSubmit}
        />

        <FloorPlanPanel event={event} onEventUpdate={setEvent} />
      </div>
    </main>
  );
}
