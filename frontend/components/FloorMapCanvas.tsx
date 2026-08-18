"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useCategories } from "@/lib/CategoriesContext";
import type { EventMap, PublicBooth } from "@/lib/floorMap";
import { percent, resolveMapImage } from "@/lib/floorMap";
import { initialsFor, themeFor } from "@/lib/profileThemes";

/** Trimmed to just what the hover-preview shows — not the vendor's full
 * public-profile payload (see /vendors/[vendorId]/page.tsx for that). */
type VendorPreview = {
  avatar_image_url: string;
};

/** Pixel anchor (viewport coordinates) the preview card positions itself against. */
type Anchor = { top: number; left: number; width: number; height: number };

/**
 * Renders a floor map's image plus its booth markers — hover a booth
 * (desktop) or tap it (mobile) for a small vendor preview card. Shared by
 * the standalone /events/[eventId]/map page and the embedded section on the
 * event detail page, so booth-overlay/tooltip behavior only lives in one
 * place.
 */
export function FloorMapCanvas({ map }: { map: EventMap }) {
  const { labelFor, styleFor } = useCategories();
  const [selectedBooth, setSelectedBooth] = useState<PublicBooth | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<Anchor | null>(null);
  // Paired with the vendor_pk it was fetched for (rather than nulled out
  // whenever selectedBooth changes) so switching straight from one taken
  // booth to another never flashes the previous vendor's stale preview —
  // the pairing check below just stops using it once it's stale.
  const [fetchedPreview, setFetchedPreview] = useState<{
    vendorPk: number;
    data: VendorPreview;
  } | null>(null);
  const displayImageUrl = resolveMapImage(map);

  // Hover opens the card immediately; leaving schedules a short-delayed close
  // (cancelled if the mouse lands on the card itself) so moving from the
  // booth to a link inside the card doesn't dismiss it. Click/tap opens it
  // immediately too, for touch devices that have no real hover.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dismissing on an outside tap/click is done via a document-level listener
  // rather than a full-page overlay — an overlay would sit on top of the
  // map (to catch clicks anywhere), which also covers the very booth being
  // hovered and immediately fires its mouseleave, closing the card before
  // it can ever be used.
  const previewCardRef = useRef<HTMLDivElement | null>(null);
  function clearCloseTimer() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }
  function openPreview(booth: PublicBooth, target: HTMLElement) {
    clearCloseTimer();
    const rect = target.getBoundingClientRect();
    setHoverAnchor({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    setSelectedBooth(booth);
  }
  function scheduleClosePreview() {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setSelectedBooth(null);
      setHoverAnchor(null);
    }, 150);
  }
  function closePreviewNow() {
    clearCloseTimer();
    setSelectedBooth(null);
    setHoverAnchor(null);
  }
  useEffect(() => clearCloseTimer, []);

  useEffect(() => {
    if (!selectedBooth) return;
    function handlePointerDown(e: PointerEvent) {
      if (previewCardRef.current?.contains(e.target as Node)) return;
      closePreviewNow();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBooth]);

  // Search/filter bar — search matches a taken booth's vendor name; category
  // chips are derived from only the categories actually attending this event
  // (not the full site-wide category list), so there's never an empty chip
  // for a category no one at this show sells. Non-matching booths get
  // dimmed rather than hidden, so the floor plan's shape stays recognizable.
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [alsoBuyingOnly, setAlsoBuyingOnly] = useState(false);

  const presentCategories = useMemo(() => {
    const set = new Set<string>();
    for (const booth of map.booths) {
      if (booth.status === "taken") {
        booth.vendor_category_tags.forEach((tag) => set.add(tag));
      }
    }
    return Array.from(set);
  }, [map.booths]);

  const hasActiveFilter =
    searchQuery.trim() !== "" || selectedCategories.size > 0 || alsoBuyingOnly;

  function boothMatchesFilter(booth: PublicBooth): boolean {
    if (!hasActiveFilter) return true;
    if (booth.status !== "taken") return false;
    const query = searchQuery.trim().toLowerCase();
    const nameMatches = !query || booth.vendor_name.toLowerCase().includes(query);
    const categoryMatches =
      selectedCategories.size === 0 ||
      booth.vendor_category_tags.some((tag) => selectedCategories.has(tag));
    const buyingMatches = !alsoBuyingOnly || booth.also_buying;
    return nameMatches && categoryMatches && buyingMatches;
  }

  function toggleCategory(category: string) {
    setSelectedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  function clearFilters() {
    setSearchQuery("");
    setSelectedCategories(new Set());
    setAlsoBuyingOnly(false);
  }

  useEffect(() => {
    if (!selectedBooth || selectedBooth.vendor_pk === null) return;
    const vendorPk = selectedBooth.vendor_pk;
    let cancelled = false;
    apiFetch<VendorPreview>(`/vendors/${vendorPk}/`)
      .then((data) => {
        if (!cancelled) setFetchedPreview({ vendorPk, data });
      })
      .catch(() => {
        // Falls back to the booth's own initials-only avatar.
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBooth]);

  if (!displayImageUrl) return null;

  const selectedVendorPk = selectedBooth?.vendor_pk ?? null;
  const vendorPreview =
    fetchedPreview?.vendorPk === selectedVendorPk ? fetchedPreview.data : null;
  const theme = themeFor(selectedBooth?.vendor_name);

  return (
    <div>
      {(presentCategories.length > 0 || map.booths.length > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-sm dark:border-gray-800 dark:bg-transparent">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search vendor name…"
            className="w-full min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-transparent sm:w-auto"
          />

          {presentCategories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {presentCategories.map((category) => {
                const active = selectedCategories.has(category);
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      active
                        ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                        : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
                    }`}
                  >
                    {labelFor(category)}
                  </button>
                );
              })}
            </div>
          )}

          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={alsoBuyingOnly}
              onChange={(e) => setAlsoBuyingOnly(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Also buying
          </label>

          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-brand-blue underline hover:no-underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* min-w keeps booth numbers at a legible pixel size on phones —
          booths are a fixed percent of this width, so a narrow container
          shrinks the text past reading size long before it looks
          "crowded." Below that width the map scrolls horizontally
          instead. */}
      <div className="overflow-x-auto">
        <div className="relative w-full min-w-[1200px] overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
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

        {map.booths.map((booth) => {
          const matches = boothMatchesFilter(booth);
          return (
            <button
              key={booth.id}
              type="button"
              onMouseEnter={(e) => openPreview(booth, e.currentTarget)}
              onMouseLeave={scheduleClosePreview}
              onClick={(e) => openPreview(booth, e.currentTarget)}
              className={`absolute flex items-center justify-center overflow-hidden rounded border-2 ${
                booth.status === "taken"
                  ? "border-brand-blue bg-brand-blue/20 hover:bg-brand-blue/30"
                  : "border-green-500 bg-green-500/15 hover:bg-green-500/25"
              } ${hasActiveFilter && !matches ? "opacity-25 grayscale" : ""} ${
                hasActiveFilter && matches ? "z-10 ring-2 ring-amber-400 ring-offset-1" : ""
              }`}
              style={{
                left: `${percent(booth.position_x)}%`,
                top: `${percent(booth.position_y)}%`,
                width: `${percent(booth.width)}%`,
                height: `${percent(booth.height)}%`,
              }}
            >
              <span className="pointer-events-none truncate px-0.5 text-[10px] font-medium text-brand-navy dark:text-white">
                {booth.booth_number}
              </span>
            </button>
          );
        })}

        {map.amenities.map((amenity) => {
          const theme = themeFor(amenity.label);
          return (
            <div
              key={amenity.id}
              title={amenity.label || "Custom vendor"}
              className="pointer-events-none absolute overflow-hidden rounded border-2 border-emerald-500"
              style={{
                left: `${percent(amenity.position_x)}%`,
                top: `${percent(amenity.position_y)}%`,
                width: `${percent(amenity.width)}%`,
                height: `${percent(amenity.height)}%`,
              }}
            >
              {amenity.logo_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={amenity.logo_image_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div
                  className={`flex h-full w-full items-center justify-center p-0.5 text-center ${theme.avatarClassName}`}
                >
                  <span className="truncate text-[9px] font-medium text-white">
                    {amenity.label || "Custom"}
                  </span>
                </div>
              )}
            </div>
          );
        })}
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

      {selectedBooth && hoverAnchor && (
        <div
          ref={previewCardRef}
          className="fixed z-50 w-56 max-w-[80vw] rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-900"
          style={
            hoverAnchor.top > 220
              ? {
                  top: hoverAnchor.top - 8,
                  left: Math.min(
                    Math.max(hoverAnchor.left + hoverAnchor.width / 2, 120),
                    (typeof window !== "undefined" ? window.innerWidth : 1200) - 120,
                  ),
                  transform: "translate(-50%, -100%)",
                }
              : {
                  top: hoverAnchor.top + hoverAnchor.height + 8,
                  left: Math.min(
                    Math.max(hoverAnchor.left + hoverAnchor.width / 2, 120),
                    (typeof window !== "undefined" ? window.innerWidth : 1200) - 120,
                  ),
                  transform: "translate(-50%, 0)",
                }
          }
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClosePreview}
        >
          {selectedBooth.status === "taken" ? (
            <div className="flex items-start gap-2.5">
              {selectedBooth.vendor_pk !== null && (
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold text-white ${theme.avatarClassName}`}
                >
                  {vendorPreview?.avatar_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={vendorPreview.avatar_image_url}
                      alt={selectedBooth.vendor_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    initialsFor(selectedBooth.vendor_name)
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase text-gray-400">
                  Booth {selectedBooth.booth_number}
                  {selectedBooth.other_booth_numbers.length > 0 &&
                    ` + ${selectedBooth.other_booth_numbers.join(", ")}`}
                </p>
                <p className="truncate text-sm font-semibold leading-tight">
                  {selectedBooth.vendor_name}
                </p>
                {(selectedBooth.vendor_category_tags.length > 0 ||
                  selectedBooth.also_buying) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedBooth.also_buying && (
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        Also buying
                      </span>
                    )}
                    {selectedBooth.vendor_category_tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      >
                        {labelFor(tag)}
                      </span>
                    ))}
                  </div>
                )}
                {selectedBooth.vendor_pk !== null && (
                  <Link
                    href={`/vendors/profile/${selectedBooth.vendor_pk}`}
                    className="mt-1.5 inline-block text-xs font-medium text-brand-blue hover:underline"
                  >
                    View full profile →
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-[10px] font-medium uppercase text-gray-400">
                Booth {selectedBooth.booth_number}
              </p>
              <p className="text-sm font-semibold">Available</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
