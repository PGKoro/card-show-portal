"use client";

import Link from "next/link";
import { useState } from "react";

import { useCategories } from "@/lib/CategoriesContext";
import type { EventMap, PublicBooth } from "@/lib/floorMap";
import { percent, resolveMapImage } from "@/lib/floorMap";

/**
 * Renders a floor map's image plus its booth markers — hover a booth
 * (desktop) or tap it (mobile) for vendor info, with a click-through to the
 * vendor's profile for booths linked to a real account. Shared by the
 * standalone /events/[eventId]/map page and the embedded section on the
 * event detail page, so booth-overlay/tooltip behavior only lives in one
 * place.
 */
export function FloorMapCanvas({ map }: { map: EventMap }) {
  const { labelFor, styleFor } = useCategories();
  const [selectedBooth, setSelectedBooth] = useState<PublicBooth | null>(null);
  const displayImageUrl = resolveMapImage(map);

  if (!displayImageUrl) return null;

  return (
    <div>
      {/* min-w keeps booth markers/labels from crowding into an unreadable
          mess on narrow screens — below that width the map scrolls
          horizontally instead of squeezing everything down. */}
      <div className="overflow-x-auto">
        <div className="relative w-full min-w-[560px] overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={displayImageUrl} alt="Event floor map" className="block w-full" />

        {map.sections.map((section) => (
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

        {map.booths.map((booth) => (
          <button
            key={booth.id}
            type="button"
            onClick={() => setSelectedBooth(booth)}
            className={`group absolute rounded border-2 ${
              booth.status === "taken"
                ? "border-brand-blue bg-brand-blue/20 hover:bg-brand-blue/30"
                : "border-green-500 bg-green-500/15 hover:bg-green-500/25"
            }`}
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
            <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-brand-navy px-2 py-1 text-xs text-white group-hover:block">
              {booth.status === "taken"
                ? `${booth.vendor_name}${
                    booth.vendor_category_tags.length > 0
                      ? ` — ${booth.vendor_category_tags.map((tag) => labelFor(tag)).join(", ")}`
                      : ""
                  }`
                : "Available"}
            </span>
          </button>
        ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border-2 border-brand-blue bg-brand-blue/20" />
          Taken
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border-2 border-green-500 bg-green-500/15" />
          Available
        </span>
      </div>

      {map.booths.length === 0 && (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          No booths have been placed on this map yet.
        </p>
      )}

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
            <h2 className="mt-1 text-lg font-semibold">
              {selectedBooth.status === "taken" ? selectedBooth.vendor_name : "Available"}
            </h2>
            {selectedBooth.status === "taken" && selectedBooth.vendor_category_tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedBooth.vendor_category_tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  >
                    {labelFor(tag)}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setSelectedBooth(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Close
              </button>
              {selectedBooth.vendor_pk !== null && (
                <Link
                  href={`/vendors/profile/${selectedBooth.vendor_pk}`}
                  className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy"
                >
                  View vendor
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
