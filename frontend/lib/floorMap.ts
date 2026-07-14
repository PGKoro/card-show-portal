// Types for the event floor map feature. Position/size fields are
// percentages (0-100) of the map image's rendered width/height, not raw
// pixels, so a booth marker stays correctly placed at any screen size —
// see backend/apps/events/models.py:BoothAssignment for the source of
// truth. DecimalFields come back from DRF as strings (matching how
// Listing.price is already handled elsewhere in this app), so these are
// typed as strings and parsed with `percent()` wherever they're used for
// inline positioning styles.

export type Booth = {
  id: number;
  booth_number: string;
  position_x: string;
  position_y: string;
  width: string;
  height: string;
  vendor: number | null;
  vendor_detail: { pk: number; label: string } | null;
  unlinked_vendor_name: string;
  unlinked_vendor_category: string;
  unlinked_vendor_contact: string;
  created_at: string;
  updated_at: string;
};

/** Read-only, public-safe shape — never includes unlinked_vendor_contact. */
export type PublicBooth = {
  id: number;
  booth_number: string;
  position_x: string;
  position_y: string;
  width: string;
  height: string;
  vendor_pk: number | null;
  vendor_name: string;
  vendor_category_tags: string[];
};

export type EventMap = {
  id: number;
  name: string;
  map_image_url: string | null;
  /** Empty string means none chosen — matches DRF's blank=True CharField. */
  map_image_preset: string;
  map_visible: boolean;
  booths: PublicBooth[];
};

/** Parses a DRF DecimalField string into a number for CSS positioning. */
export function percent(value: string): number {
  return Number(value);
}

/**
 * Generic layout diagrams an admin can fall back to when a venue can't
 * provide a real floor plan — static assets (frontend/public/preset-maps/),
 * not uploaded files. Keys must match backend MAP_IMAGE_PRESET_KEYS
 * (apps/events/models.py) since the value round-trips through the API.
 */
export const MAP_PRESETS: { key: string; label: string; path: string }[] = [
  { key: "single_hall", label: "Single Open Hall", path: "/preset-maps/single-hall.svg" },
  { key: "center_aisle", label: "Hall with Center Aisle", path: "/preset-maps/center-aisle.svg" },
  { key: "l_shaped", label: "L-Shaped Hall", path: "/preset-maps/l-shaped.svg" },
  { key: "two_room", label: "Two Connected Rooms", path: "/preset-maps/two-room.svg" },
];

/** Resolves a stored map_image_preset key to its static asset path. */
export function presetImagePath(key: string): string | undefined {
  return MAP_PRESETS.find((preset) => preset.key === key)?.path;
}

/** The image to actually render for a map — a real upload wins over a preset. */
export function resolveMapImage(map: {
  map_image_url: string | null;
  map_image_preset: string;
}): string | null {
  return (
    map.map_image_url ?? (map.map_image_preset ? presetImagePath(map.map_image_preset) ?? null : null)
  );
}
