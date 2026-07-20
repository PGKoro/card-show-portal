"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { AuthPageSpinner } from "@/components/AuthPageSpinner";
import { apiFetch, getApiErrorMessage, type PaginatedResponse } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useCategories } from "@/lib/CategoriesContext";
import type { ShowEvent } from "@/lib/events";
import { percent, resolveMapImage, type BoothRegistration, type VenueMap } from "@/lib/floorMap";

const BOOTH_MAP_STATUS_STYLES: Record<string, string> = {
  requested: "border-amber-500 bg-amber-400/50",
  loyalty_hold: "border-purple-500 bg-purple-400/50",
  confirmed: "border-green-600 bg-green-500/40",
  available: "border-gray-400 bg-gray-300/30",
};

type VendorSearchResult = { pk: number; email: string; business_name: string };

const STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  loyalty_hold: "Loyalty hold",
  confirmed: "Confirmed",
  declined: "Declined",
  released: "Released",
};

const STATUS_STYLES: Record<string, string> = {
  requested: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  loyalty_hold: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  declined: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  released: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function registrationName(reg: BoothRegistration): string {
  return reg.vendor_detail?.label || reg.unlinked_vendor_name || "—";
}

function RegistrationRow({
  registration,
  onDecision,
  busy,
}: {
  registration: BoothRegistration;
  onDecision: (id: number, decision: "confirm" | "decline") => void;
  busy: boolean;
}) {
  const { labelFor } = useCategories();
  const canDecide = registration.status === "requested" || registration.status === "loyalty_hold";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <p className="font-medium">
          Booth {registration.booth_number}{" "}
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
              STATUS_STYLES[registration.status]
            }`}
          >
            {STATUS_LABELS[registration.status]}
          </span>
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {registrationName(registration)}
          {registration.unlinked_vendor_category
            ? ` — ${labelFor(registration.unlinked_vendor_category)}`
            : ""}
          {" · $"}
          {registration.price}
        </p>
      </div>
      {canDecide && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecision(registration.id, "decline")}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            Decline
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecision(registration.id, "confirm")}
            className="rounded-md bg-brand-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}

export default function EventRegistrationsPage() {
  const { categories, styleFor } = useCategories();
  const params = useParams<{ eventId: string }>();

  const [event, setEvent] = useState<ShowEvent | null>(null);
  const [registrations, setRegistrations] = useState<BoothRegistration[]>([]);
  const [venueMap, setVenueMap] = useState<VenueMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [assignBoothId, setAssignBoothId] = useState<number | "">("");
  const [assignMode, setAssignMode] = useState<"existing" | "unlinked">("existing");
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorResults, setVendorResults] = useState<VendorSearchResult[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<VendorSearchResult | null>(null);
  const [unlinkedName, setUnlinkedName] = useState("");
  const [unlinkedCategory, setUnlinkedCategory] = useState("");
  const [unlinkedContact, setUnlinkedContact] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  // Defaults to the first live category until the admin picks one —
  // derived at render time rather than synced via an effect, since it's
  // just a fallback display value, not synchronizing an external system.
  const effectiveUnlinkedCategory = unlinkedCategory || categories[0]?.slug || "";

  async function loadRegistrations() {
    const data = await apiFetch<PaginatedResponse<BoothRegistration>>(
      `/events/${params.eventId}/registrations/?page_size=500`,
      { accessToken: getAccessToken() ?? undefined },
    );
    setRegistrations(data.results);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setPageError(null);
      try {
        const eventData = await apiFetch<ShowEvent>(`/events/${params.eventId}/`, {
          accessToken: getAccessToken() ?? undefined,
        });
        if (cancelled) return;
        setEvent(eventData);
        await loadRegistrations();
        if (eventData.map_venue) {
          const map = await apiFetch<VenueMap>(`/venues/${eventData.map_venue}/map/`, {
            accessToken: getAccessToken() ?? undefined,
          });
          if (!cancelled) setVenueMap(map);
        }
      } catch (err) {
        if (!cancelled) setPageError(getApiErrorMessage(err, "Could not load this event."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.eventId]);

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

  async function handleDecision(id: number, decision: "confirm" | "decline") {
    setBusyId(id);
    try {
      await apiFetch(`/events/registrations/${id}/${decision}/`, {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
      });
      await loadRegistrations();
    } catch (err) {
      setPageError(getApiErrorMessage(err, "Could not update this request."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleAssign(e: FormEvent) {
    e.preventDefault();
    if (!assignBoothId) {
      setAssignError("Choose a booth.");
      return;
    }
    if (assignMode === "existing" && !selectedVendor) {
      setAssignError("Search for and select a vendor.");
      return;
    }
    if (assignMode === "unlinked" && !unlinkedName.trim()) {
      setAssignError("Enter a vendor name.");
      return;
    }

    setAssigning(true);
    setAssignError(null);
    try {
      await apiFetch(`/events/${params.eventId}/registrations/`, {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
        body:
          assignMode === "existing"
            ? { booth: assignBoothId, vendor: selectedVendor!.pk }
            : {
                booth: assignBoothId,
                unlinked_vendor_name: unlinkedName,
                unlinked_vendor_category: effectiveUnlinkedCategory,
                unlinked_vendor_contact: unlinkedContact,
              },
      });
      await loadRegistrations();
      setAssignBoothId("");
      setSelectedVendor(null);
      setVendorSearch("");
      setUnlinkedName("");
      setUnlinkedContact("");
    } catch (err) {
      setAssignError(getApiErrorMessage(err, "Could not assign this booth."));
    } finally {
      setAssigning(false);
    }
  }

  if (loading) return <AuthPageSpinner />;

  if (pageError && !event) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Could not load this event</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{pageError}</p>
        <Link
          href="/dashboard/admin/events"
          className="mt-4 text-sm font-medium text-brand-blue hover:underline"
        >
          ← Manage Events
        </Link>
      </main>
    );
  }

  const activeBoothIds = new Set(
    registrations
      .filter((r) => r.status === "requested" || r.status === "confirmed" || r.status === "loyalty_hold")
      .map((r) => r.booth),
  );
  const availableBooths = venueMap?.booths.filter((b) => !activeBoothIds.has(b.id)) ?? [];

  const boothStatusById = new Map<number, string>();
  for (const r of registrations) {
    if (r.status === "requested" || r.status === "confirmed" || r.status === "loyalty_hold") {
      boothStatusById.set(r.booth, r.status);
    }
  }
  const mapImageUrl = venueMap ? resolveMapImage(venueMap) : null;

  const pending = registrations.filter((r) => r.status === "requested");
  const loyaltyHolds = registrations.filter((r) => r.status === "loyalty_hold");
  const confirmed = registrations.filter((r) => r.status === "confirmed");
  const history = registrations.filter((r) => r.status === "declined" || r.status === "released");

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/dashboard/admin/events/${params.eventId}`}
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← {event?.name}
        </Link>
        <h1 className="mb-1 text-2xl font-semibold">Booth Requests</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          Confirm or decline vendor booth requests for this event.
        </p>

        {pageError && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {pageError}
          </p>
        )}

        {!event?.map_venue && (
          <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            This event isn&apos;t linked to a venue yet — link one from the event page to manage
            booths.
          </p>
        )}

        {mapImageUrl && venueMap && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Floor plan
            </h2>
            <div className="flex flex-wrap gap-3 pb-2 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border-2 border-amber-500 bg-amber-400/50" />
                Requested
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border-2 border-purple-500 bg-purple-400/50" />
                Loyalty hold
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border-2 border-green-600 bg-green-500/40" />
                Confirmed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border-2 border-gray-400 bg-gray-300/30" />
                Available
              </span>
            </div>
            <div className="relative w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mapImageUrl} alt="Venue floor plan" className="block w-full" />
              {venueMap.sections.map((section) => (
                <div
                  key={section.id}
                  className={`pointer-events-none absolute flex items-start p-1 ${styleFor(section.category)}`}
                  style={{
                    left: `${percent(section.position_x)}%`,
                    top: `${percent(section.position_y)}%`,
                    width: `${percent(section.width)}%`,
                    height: `${percent(section.height)}%`,
                  }}
                />
              ))}
              {venueMap.booths.map((booth) => {
                const boothStatus = boothStatusById.get(booth.id) ?? "available";
                return (
                  <div
                    key={booth.id}
                    title={`Booth ${booth.booth_number} — ${boothStatus}`}
                    className={`absolute rounded border-2 ${BOOTH_MAP_STATUS_STYLES[boothStatus]}`}
                    style={{
                      left: `${percent(booth.position_x)}%`,
                      top: `${percent(booth.position_y)}%`,
                      width: `${percent(booth.width)}%`,
                      height: `${percent(booth.height)}%`,
                    }}
                  >
                    <span className="pointer-events-none absolute -top-5 left-0 whitespace-nowrap rounded bg-brand-navy px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {booth.booth_number}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {pending.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Pending requests
            </h2>
            <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm dark:divide-gray-800 dark:border-gray-800">
              {pending.map((r) => (
                <RegistrationRow
                  key={r.id}
                  registration={r}
                  onDecision={handleDecision}
                  busy={busyId === r.id}
                />
              ))}
            </div>
          </section>
        )}

        {loyaltyHolds.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Loyalty holds
            </h2>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              Reserved for returning vendors until the loyalty deadline. They&apos;ll show as
              requested once claimed.
            </p>
            <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm dark:divide-gray-800 dark:border-gray-800">
              {loyaltyHolds.map((r) => (
                <RegistrationRow
                  key={r.id}
                  registration={r}
                  onDecision={handleDecision}
                  busy={busyId === r.id}
                />
              ))}
            </div>
          </section>
        )}

        {confirmed.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Confirmed booths
            </h2>
            <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm dark:divide-gray-800 dark:border-gray-800">
              {confirmed.map((r) => (
                <RegistrationRow
                  key={r.id}
                  registration={r}
                  onDecision={handleDecision}
                  busy={busyId === r.id}
                />
              ))}
            </div>
          </section>
        )}

        {event?.map_venue && (
          <section className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-transparent">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Assign a booth directly
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              For vendors confirmed outside the self-service flow (phone, in person, etc).
            </p>

            <form onSubmit={handleAssign} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Booth</label>
                <select
                  value={assignBoothId}
                  onChange={(e) => setAssignBoothId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                >
                  <option value="">Select an available booth...</option>
                  {availableBooths.map((b) => (
                    <option key={b.id} value={b.id}>
                      Booth {b.booth_number} — ${b.price}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => setAssignMode("existing")}
                  className={`rounded-md border px-3 py-1.5 font-medium ${
                    assignMode === "existing"
                      ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                      : "border-gray-300 dark:border-gray-700"
                  }`}
                >
                  Existing vendor
                </button>
                <button
                  type="button"
                  onClick={() => setAssignMode("unlinked")}
                  className={`rounded-md border px-3 py-1.5 font-medium ${
                    assignMode === "unlinked"
                      ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                      : "border-gray-300 dark:border-gray-700"
                  }`}
                >
                  No account
                </button>
              </div>

              {assignMode === "existing" ? (
                <div>
                  {selectedVendor ? (
                    <div className="flex items-center justify-between rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700">
                      <span>{selectedVendor.business_name || selectedVendor.email}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedVendor(null)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={vendorSearch}
                        onChange={(e) => setVendorSearch(e.target.value)}
                        placeholder="Search vendors by email..."
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                      />
                      {vendorResults.length > 0 && (
                        <div className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                          {vendorResults.map((vendor) => (
                            <button
                              type="button"
                              key={vendor.pk}
                              onClick={() => {
                                setSelectedVendor(vendor);
                                setVendorSearch("");
                                setVendorResults([]);
                              }}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-900"
                            >
                              <span>{vendor.business_name || vendor.email}</span>
                              <span className="text-xs text-brand-blue">Select</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    value={unlinkedName}
                    onChange={(e) => setUnlinkedName(e.target.value)}
                    placeholder="Vendor name"
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                  />
                  <select
                    value={effectiveUnlinkedCategory}
                    onChange={(e) => setUnlinkedCategory(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                  >
                    {categories.map((cat) => (
                      <option key={cat.slug} value={cat.slug}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={unlinkedContact}
                    onChange={(e) => setUnlinkedContact(e.target.value)}
                    placeholder="Contact info (optional)"
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm sm:col-span-2 dark:border-gray-700 dark:bg-transparent"
                  />
                </div>
              )}

              {assignError && <p className="text-sm text-red-600 dark:text-red-400">{assignError}</p>}

              <button
                type="submit"
                disabled={assigning}
                className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50"
              >
                {assigning ? "Assigning..." : "Assign booth"}
              </button>
            </form>
          </section>
        )}

        {history.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              History
            </h2>
            <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm dark:divide-gray-800 dark:border-gray-800">
              {history.map((r) => (
                <RegistrationRow
                  key={r.id}
                  registration={r}
                  onDecision={handleDecision}
                  busy={busyId === r.id}
                />
              ))}
            </div>
          </section>
        )}

        {registrations.length === 0 && (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No booth requests yet.
          </p>
        )}
      </div>
    </main>
  );
}
