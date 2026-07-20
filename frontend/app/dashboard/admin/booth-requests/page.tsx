"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiFetch, getApiErrorMessage, type PaginatedResponse } from "@/lib/api";
import { useCategories } from "@/lib/CategoriesContext";
import { getAccessToken } from "@/lib/auth";
import { percent, resolveMapImage, type PendingBoothRegistration, type VenueMap } from "@/lib/floorMap";

function FloorPlanThumbnail({ venueMap, boothId }: { venueMap: VenueMap | undefined; boothId: number }) {
  if (!venueMap) {
    return (
      <div className="flex h-32 w-full items-center justify-center rounded-md border border-dashed border-gray-300 text-xs text-gray-400 dark:border-gray-700">
        Loading floor plan...
      </div>
    );
  }

  const displayImageUrl = resolveMapImage(venueMap);
  if (!displayImageUrl) {
    return (
      <div className="flex h-32 w-full items-center justify-center rounded-md border border-dashed border-gray-300 text-xs text-gray-400 dark:border-gray-700">
        No floor plan set up
      </div>
    );
  }

  return (
    <div className="relative h-32 w-full overflow-hidden rounded-md border border-gray-200 dark:border-gray-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={displayImageUrl} alt="Venue floor plan" className="block h-full w-full object-cover" />
      {venueMap.booths.map((booth) => {
        const isTarget = booth.id === boothId;
        return (
          <div
            key={booth.id}
            className={
              isTarget
                ? "absolute rounded border-2 border-amber-500 bg-amber-400/60 ring-2 ring-amber-500 ring-offset-1"
                : "absolute rounded border border-brand-blue/60 bg-brand-blue/20"
            }
            style={{
              left: `${percent(booth.position_x)}%`,
              top: `${percent(booth.position_y)}%`,
              width: `${percent(booth.width)}%`,
              height: `${percent(booth.height)}%`,
            }}
          />
        );
      })}
    </div>
  );
}

function formatRequestedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function BoothRequestsPage() {
  const { labelFor } = useCategories();
  const [rows, setRows] = useState<PendingBoothRegistration[]>([]);
  const [venueMaps, setVenueMaps] = useState<Record<number, VenueMap>>({});
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    setPageError(null);
    try {
      const data = await apiFetch<PaginatedResponse<PendingBoothRegistration>>(
        "/events/registrations/pending/?page_size=500",
        { accessToken: getAccessToken() ?? undefined },
      );
      setRows(data.results);

      const uniqueVenueIds = Array.from(new Set(data.results.map((r) => r.venue_id)));
      const missing = uniqueVenueIds.filter((id) => !(id in venueMaps));
      if (missing.length > 0) {
        const fetched = await Promise.all(
          missing.map((id) =>
            apiFetch<VenueMap>(`/venues/${id}/map/`, {
              accessToken: getAccessToken() ?? undefined,
            }).then((map) => [id, map] as const),
          ),
        );
        setVenueMaps((current) => {
          const next = { ...current };
          for (const [id, map] of fetched) next[id] = map;
          return next;
        });
      }
    } catch (err) {
      setPageError(getApiErrorMessage(err, "Could not load pending booth requests."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDecision(id: number, decision: "confirm" | "decline") {
    setBusyId(id);
    try {
      await apiFetch(`/events/registrations/${id}/${decision}/`, {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
      });
      setRows((current) => current.filter((r) => r.id !== id));
    } catch (err) {
      setPageError(getApiErrorMessage(err, "Could not update this request."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dashboard/admin"
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Admin Tools
        </Link>
        <h1 className="mb-1 text-2xl font-semibold">Booth Requests</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          Every vendor booth request awaiting a decision, across every event.
        </p>

        {pageError && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {pageError}
          </p>
        )}

        {!loading && rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No pending booth requests right now.
          </p>
        ) : (
          <div className="space-y-4">
            {rows.map((row) => (
              <div
                key={row.id}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-transparent"
              >
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="sm:w-48 sm:shrink-0">
                    <FloorPlanThumbnail venueMap={venueMaps[row.venue_id]} boothId={row.booth} />
                  </div>
                  <div className="flex flex-1 flex-col justify-between gap-3">
                    <div>
                      <Link
                        href={`/dashboard/admin/events/${row.event}/registrations`}
                        className="font-semibold hover:underline"
                      >
                        {row.event_name}
                      </Link>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Booth {row.booth_number} · ${row.price}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {row.vendor_detail?.label || row.unlinked_vendor_name}
                        {row.unlinked_vendor_category
                          ? ` — ${labelFor(row.unlinked_vendor_category)}`
                          : ""}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        Requested {formatRequestedAt(row.requested_at)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => handleDecision(row.id, "decline")}
                        className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => handleDecision(row.id, "confirm")}
                        className="rounded-md bg-brand-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50"
                      >
                        Confirm
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
