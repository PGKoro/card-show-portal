"use client";

import Link from "next/link";
import { useState } from "react";

import type { EventMap, PublicBooth } from "@/lib/floorMap";
import { percent, resolveMapImage } from "@/lib/floorMap";
import { CATEGORY_LABELS, type VendorCategory } from "@/lib/mockData";

/**
 * Renders a floor map's image plus its booth markers — hover a booth
 * (desktop) or tap it (mobile) for vendor info, with a click-through to the
 * vendor's profile for booths linked to a real account. Shared by the
 * standalone /events/[eventId]/map page and the embedded section on the
 * event detail page, so booth-overlay/tooltip behavior only lives in one
 * place.
 */
export function FloorMapCanvas({ map }: { map: EventMap }) {
  const [selectedBooth, setSelectedBooth] = useState<PublicBooth | null>(null);
  const displayImageUrl = resolveMapImage(map);

  if (!displayImageUrl) return null;

  return (
    <div>
      <div className="relative w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={displayImageUrl} alt="Event floor map" className="block w-full" />

        {map.booths.map((booth) => (
          <button
            key={booth.id}
            type="button"
            onClick={() => setSelectedBooth(booth)}
            className="group absolute rounded border-2 border-brand-blue bg-brand-blue/20 hover:bg-brand-blue/30"
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
              {booth.vendor_name}
              {booth.vendor_category_tags.length > 0 &&
                ` — ${booth.vendor_category_tags
                  .map((tag) => CATEGORY_LABELS[tag as VendorCategory] ?? tag)
                  .join(", ")}`}
            </span>
          </button>
        ))}
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
            <h2 className="mt-1 text-lg font-semibold">{selectedBooth.vendor_name}</h2>
            {selectedBooth.vendor_category_tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedBooth.vendor_category_tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  >
                    {CATEGORY_LABELS[tag as VendorCategory] ?? tag}
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
