"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError, apiFetch, getApiErrorMessage } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useCategories } from "@/lib/CategoriesContext";
import {
  percent,
  resolveMapImage,
  type BoothAvailability,
  type VendorBooth,
  type VendorEventBooths,
} from "@/lib/floorMap";

const AVAILABILITY_STYLES: Record<BoothAvailability, string> = {
  available: "border-green-500 bg-green-500/15 hover:bg-green-500/25",
  mine: "border-brand-blue bg-brand-blue/25",
  taken: "border-gray-400 bg-gray-400/20 cursor-default",
  loyalty_held: "border-purple-400 bg-purple-400/15 cursor-default",
  loyalty_hold_mine: "border-purple-500 bg-purple-500/25",
};

const AVAILABILITY_LABELS: Record<BoothAvailability, string> = {
  available: "Available",
  mine: "Your booth",
  taken: "Taken",
  loyalty_held: "Held for a returning vendor",
  loyalty_hold_mine: "Held for you — click to claim",
};

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function VendorBoothSelectionPage() {
  const { labelFor, styleFor } = useCategories();
  const params = useParams<{ eventId: string }>();
  const [data, setData] = useState<VendorEventBooths | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [selectedBooth, setSelectedBooth] = useState<VendorBooth | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  async function load() {
    setPageError(null);
    try {
      const result = await apiFetch<VendorEventBooths>(`/events/${params.eventId}/vendor-booths/`, {
        accessToken: getAccessToken() ?? undefined,
      });
      setData(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setPageError("This event isn't open for booth selection.");
      } else {
        setPageError(getApiErrorMessage(err, "Could not load this event's floor plan."));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.eventId]);

  function openBooth(booth: VendorBooth) {
    if (booth.availability === "taken" || booth.availability === "loyalty_held") return;
    setActionError(null);
    setSelectedBooth(booth);
  }

  async function handleSelect() {
    if (!selectedBooth) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await apiFetch(`/events/${params.eventId}/booths/${selectedBooth.id}/select/`, {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
      });
      setSelectedBooth(null);
      await load();
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Could not select this booth."));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRelease() {
    if (!selectedBooth?.registration_id) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await apiFetch(`/events/registrations/${selectedBooth.registration_id}/release/`, {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
      });
      setSelectedBooth(null);
      await load();
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Could not release this booth."));
    } finally {
      setActionBusy(false);
    }
  }

  if (loading) return null;

  if (pageError) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Can&apos;t open this floor plan</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{pageError}</p>
        <Link
          href="/dashboard/vendor/booths"
          className="mt-4 text-sm font-medium text-brand-blue hover:underline"
        >
          ← Attend an Event
        </Link>
      </main>
    );
  }

  if (!data) return null;

  const displayImageUrl = resolveMapImage({
    map_image_url: data.map_image_url,
    map_image_preset: data.map_image_preset,
  });

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/dashboard/vendor/booths"
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Attend an Event
        </Link>
        <h1 className="mb-1 text-2xl font-semibold">Choose Your Booth</h1>
        {data.loyalty_priority_deadline && (
          <p className="mb-4 text-sm text-purple-700 dark:text-purple-400">
            Booths held for returning vendors open up to everyone on{" "}
            {formatDeadline(data.loyalty_priority_deadline)}.
          </p>
        )}

        <div className="mb-4 flex flex-wrap gap-3 text-xs">
          {(Object.keys(AVAILABILITY_LABELS) as BoothAvailability[]).map((key) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded border-2 ${AVAILABILITY_STYLES[key]}`} />
              {AVAILABILITY_LABELS[key]}
            </span>
          ))}
        </div>

        {!displayImageUrl ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No floor plan has been set up for this event yet.
          </p>
        ) : (
          <div className="relative w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={displayImageUrl} alt="Event floor plan" className="block w-full" />

            {data.sections.map((section) => (
              <div
                key={section.id}
                className={`pointer-events-none absolute flex items-start justify-start p-1 ${styleFor(section.category)}`}
                style={{
                  left: `${percent(section.position_x)}%`,
                  top: `${percent(section.position_y)}%`,
                  width: `${percent(section.width)}%`,
                  height: `${percent(section.height)}%`,
                }}
              >
                <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide dark:bg-black/50">
                  {labelFor(section.category)}
                </span>
              </div>
            ))}

            {data.booths.map((booth) => (
              <button
                key={booth.id}
                type="button"
                onClick={() => openBooth(booth)}
                title={`Booth ${booth.booth_number} — $${booth.price}`}
                className={`absolute rounded border-2 ${AVAILABILITY_STYLES[booth.availability]}`}
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
              </button>
            ))}
          </div>
        )}

        {displayImageUrl && data.booths.length === 0 && (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            No booths have been placed on this floor plan yet.
          </p>
        )}
      </div>

      {selectedBooth && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => setSelectedBooth(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-lg bg-white p-5 shadow-xl sm:rounded-lg dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
              Booth {selectedBooth.booth_number}
            </p>
            <h2 className="mt-1 text-lg font-semibold">${selectedBooth.price}</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {AVAILABILITY_LABELS[selectedBooth.availability]}
              {selectedBooth.registration_status === "requested" &&
                " — waiting on admin confirmation."}
              {selectedBooth.registration_status === "confirmed" && " — confirmed."}
            </p>

            {actionError && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">{actionError}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setSelectedBooth(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Close
              </button>
              {(selectedBooth.availability === "available" ||
                selectedBooth.availability === "loyalty_hold_mine") && (
                <button
                  onClick={handleSelect}
                  disabled={actionBusy}
                  className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50"
                >
                  {actionBusy
                    ? "Requesting..."
                    : selectedBooth.availability === "loyalty_hold_mine"
                      ? "Claim this booth"
                      : "Request this booth"}
                </button>
              )}
              {selectedBooth.availability === "mine" && (
                <button
                  onClick={handleRelease}
                  disabled={actionBusy}
                  className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                >
                  Release booth
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
