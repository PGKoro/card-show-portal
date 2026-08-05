"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { getApiErrorMessage, apiFetch, type PaginatedResponse } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { toDatetimeLocalValue, type VendorDetail, type VenueDetail } from "@/lib/events";
import type { Venue } from "@/lib/floorMap";

type VendorSearchResult = { pk: number; email: string; business_name: string };

export type EventFormPayload = {
  name: string;
  description: string;
  start_date: string;
  end_date: string | null;
  estimated_cards: number;
  estimated_attendees: number;
  vendors: number[];
  map_venue: number;
  announcement: string;
  notes: string;
  registration_deadline: string | null;
};

export type EventFormInitialValues = {
  name: string;
  description: string;
  start_date: string;
  end_date: string | null;
  estimated_cards: number;
  estimated_attendees: number;
  vendors_detail: VendorDetail[];
  map_venue: number | null;
  map_venue_detail: VenueDetail | null;
  announcement?: string;
  notes?: string;
  registration_deadline: string | null;
};

export function EventForm({
  initialValues,
  submitLabel,
  onSubmit,
  showNotes = true,
}: {
  initialValues?: EventFormInitialValues;
  submitLabel: string;
  onSubmit: (payload: EventFormPayload) => Promise<void>;
  showNotes?: boolean;
}) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [startDate, setStartDate] = useState(initialValues?.start_date ?? "");
  const [endDate, setEndDate] = useState(initialValues?.end_date ?? "");
  const [estimatedCards, setEstimatedCards] = useState(String(initialValues?.estimated_cards ?? 0));
  const [estimatedAttendees, setEstimatedAttendees] = useState(
    String(initialValues?.estimated_attendees ?? 0),
  );
  const [selectedVendors, setSelectedVendors] = useState<VendorDetail[]>(
    initialValues?.vendors_detail ?? [],
  );
  const [selectedVenue, setSelectedVenue] = useState<VenueDetail | null>(
    initialValues?.map_venue_detail ?? null,
  );
  const [announcement, setAnnouncement] = useState(initialValues?.announcement ?? "");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [registrationDeadline, setRegistrationDeadline] = useState(
    toDatetimeLocalValue(initialValues?.registration_deadline ?? null),
  );
  const [venueSearch, setVenueSearch] = useState("");
  const [venueResults, setVenueResults] = useState<Venue[]>([]);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorResults, setVendorResults] = useState<VendorSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      if (!venueSearch) {
        setVenueResults([]);
        return;
      }
      apiFetch<PaginatedResponse<Venue>>(`/venues/?search=${encodeURIComponent(venueSearch)}&page_size=10`, {
        accessToken: getAccessToken() ?? undefined,
      }).then((data) => {
        if (!cancelled) setVenueResults(data.results);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [venueSearch]);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      if (!vendorSearch) {
        setVendorResults([]);
        return;
      }
      apiFetch<{ results: VendorSearchResult[] }>(
        `/admin/users/?role=vendor&search=${encodeURIComponent(vendorSearch)}`,
        { accessToken: getAccessToken() ?? undefined },
      ).then((data) => {
        if (!cancelled) setVendorResults(data.results);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [vendorSearch]);

  function addVendor(vendor: VendorSearchResult) {
    setSelectedVendors((current) =>
      current.some((v) => v.pk === vendor.pk)
        ? current
        : [...current, { pk: vendor.pk, label: vendor.business_name || vendor.email }],
    );
  }

  function removeVendor(pk: number) {
    setSelectedVendors((current) => current.filter((v) => v.pk !== pk));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedVenue) {
      setError("Pick a venue before saving — create one in Manage Venues if it isn't listed yet.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name,
        description,
        start_date: startDate,
        end_date: endDate || null,
        estimated_cards: Number(estimatedCards) || 0,
        estimated_attendees: Number(estimatedAttendees) || 0,
        vendors: selectedVendors.map((v) => v.pk),
        map_venue: selectedVenue.pk,
        announcement,
        notes,
        registration_deadline: registrationDeadline ? new Date(registrationDeadline).toISOString() : null,
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save event. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          Title
        </label>
        <input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
        />
      </div>

      <div>
        <span className="block text-sm font-medium">Venue</span>
        {selectedVenue ? (
          <div className="mt-1 flex items-center justify-between gap-3 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700">
            <span>{selectedVenue.name}</span>
            <button
              type="button"
              onClick={() => setSelectedVenue(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={venueSearch}
              onChange={(e) => setVenueSearch(e.target.value)}
              placeholder="Search venues by name or city..."
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
            />
            {venueResults.length > 0 && (
              <div className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                {venueResults.map((venue) => (
                  <button
                    type="button"
                    key={venue.id}
                    onClick={() => {
                      setSelectedVenue({ pk: venue.id, name: venue.name });
                      setVenueSearch("");
                      setVenueResults([]);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    <span>
                      {venue.name}
                      {venue.city ? ` — ${venue.city}` : ""}
                    </span>
                    <span className="text-xs text-brand-blue">Select</span>
                  </button>
                ))}
              </div>
            )}
            <Link
              href="/dashboard/admin/venues/new"
              className="mt-2 inline-block text-xs font-medium text-brand-blue hover:underline"
            >
              + Add a new venue
            </Link>
          </>
        )}
        <p className="mt-1 text-xs text-gray-400">
          Don&apos;t see the venue you need? Create it in Manage Venues first, then it&apos;ll show up here.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="start_date" className="block text-sm font-medium">
            Start date
          </label>
          <input
            id="start_date"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
          />
        </div>
        <div>
          <label htmlFor="end_date" className="block text-sm font-medium">
            End date <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="end_date"
            type="date"
            value={endDate ?? ""}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
          />
        </div>
      </div>

      <div>
        <label htmlFor="registration_deadline" className="block text-sm font-medium">
          Vendor registration deadline <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          id="registration_deadline"
          type="datetime-local"
          value={registrationDeadline}
          onChange={(e) => setRegistrationDeadline(e.target.value)}
          className="mt-1 w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
        />
        <p className="mt-1 text-xs text-gray-400">
          Shown to vendors as a countdown on this event&apos;s page. Purely informational — it
          doesn&apos;t stop booth requests on its own.
        </p>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium">
          Description
        </label>
        <textarea
          id="description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
        />
      </div>

      <div>
        <label htmlFor="announcement" className="block text-sm font-medium text-amber-700 dark:text-amber-300">
          Announcement <span className="font-normal text-gray-400">(public)</span>
        </label>
        <textarea
          id="announcement"
          rows={4}
          value={announcement}
          onChange={(e) => setAnnouncement(e.target.value)}
          placeholder="Public announcement shown on the event page..."
          className="mt-1 w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950 placeholder:text-amber-400 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
        />
      </div>

      {showNotes && (
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-brand-blue dark:text-blue-300">
            Notes <span className="font-normal text-gray-400">(admin only)</span>
          </label>
          <textarea
            id="notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal note for admins only..."
            className="mt-1 w-full rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-blue-950 placeholder:text-blue-400 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="estimated_cards" className="block text-sm font-medium">
            Estimated cards
          </label>
          <input
            id="estimated_cards"
            type="number"
            min="0"
            value={estimatedCards}
            onChange={(e) => setEstimatedCards(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
          />
        </div>
        <div>
          <label htmlFor="estimated_attendees" className="block text-sm font-medium">
            Estimated attendees
          </label>
          <input
            id="estimated_attendees"
            type="number"
            min="0"
            value={estimatedAttendees}
            onChange={(e) => setEstimatedAttendees(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
          />
        </div>
      </div>

      <div>
        <span className="block text-sm font-medium">Vendors attending</span>
        <input
          type="text"
          value={vendorSearch}
          onChange={(e) => setVendorSearch(e.target.value)}
          placeholder="Search vendors by email..."
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
        />
        {vendorResults.length > 0 && (
          <div className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            {vendorResults.map((vendor) => (
              <button
                type="button"
                key={vendor.pk}
                onClick={() => addVendor(vendor)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                <span>{vendor.business_name || vendor.email}</span>
                <span className="text-xs text-brand-blue">Add</span>
              </button>
            ))}
          </div>
        )}
        {selectedVendors.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedVendors.map((vendor) => (
              <span
                key={vendor.pk}
                className="flex items-center gap-1.5 rounded-full bg-gray-100 py-1 pl-3 pr-1.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                {vendor.label}
                <button
                  type="button"
                  onClick={() => removeVendor(vendor.pk)}
                  aria-label={`Remove ${vendor.label}`}
                  className="rounded-full px-1 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50"
      >
        {submitting ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
