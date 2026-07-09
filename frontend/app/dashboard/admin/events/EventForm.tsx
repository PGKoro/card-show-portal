"use client";

import { useEffect, useState, type FormEvent } from "react";

import { getApiErrorMessage, apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { VendorDetail } from "@/lib/events";

type VendorSearchResult = { pk: number; email: string; business_name: string };

export type EventFormPayload = {
  name: string;
  venue: string;
  city: string;
  description: string;
  start_date: string;
  end_date: string | null;
  estimated_cards: number;
  estimated_attendees: number;
  vendors: number[];
};

export type EventFormInitialValues = {
  name: string;
  venue: string;
  city: string;
  description: string;
  start_date: string;
  end_date: string | null;
  estimated_cards: number;
  estimated_attendees: number;
  vendors_detail: VendorDetail[];
};

export function EventForm({
  initialValues,
  submitLabel,
  onSubmit,
}: {
  initialValues?: EventFormInitialValues;
  submitLabel: string;
  onSubmit: (payload: EventFormPayload) => Promise<void>;
}) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [venue, setVenue] = useState(initialValues?.venue ?? "");
  const [city, setCity] = useState(initialValues?.city ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [startDate, setStartDate] = useState(initialValues?.start_date ?? "");
  const [endDate, setEndDate] = useState(initialValues?.end_date ?? "");
  const [estimatedCards, setEstimatedCards] = useState(
    String(initialValues?.estimated_cards ?? 0),
  );
  const [estimatedAttendees, setEstimatedAttendees] = useState(
    String(initialValues?.estimated_attendees ?? 0),
  );
  const [selectedVendors, setSelectedVendors] = useState<VendorDetail[]>(
    initialValues?.vendors_detail ?? [],
  );

  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorResults, setVendorResults] = useState<VendorSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name,
        venue,
        city,
        description,
        start_date: startDate,
        end_date: endDate || null,
        estimated_cards: Number(estimatedCards) || 0,
        estimated_attendees: Number(estimatedAttendees) || 0,
        vendors: selectedVendors.map((v) => v.pk),
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save event. Please try again."));
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="venue" className="block text-sm font-medium">
            Venue
          </label>
          <input
            id="venue"
            required
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
          />
        </div>
        <div>
          <label htmlFor="city" className="block text-sm font-medium">
            Location (city, state)
          </label>
          <input
            id="city"
            required
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
          />
        </div>
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
        className="rounded-md bg-brand-blue px-5 py-2.5 font-medium text-white hover:bg-brand-navy disabled:opacity-50"
      >
        {submitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
