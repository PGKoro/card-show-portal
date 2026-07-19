// Types for the venue floor-map + booth-registration marketplace.
// Position/size fields are percentages (0-100) of the map image's rendered
// width/height, not raw pixels, so a marker stays correctly placed at any
// screen size. DecimalFields come back from DRF as strings (matching how
// Listing.price is already handled elsewhere in this app), so these are
// typed as strings and parsed with `percent()` wherever they're used for
// inline positioning styles.
//
// The floor plan (image + booth slots + category zones) lives on a Venue,
// reused across every Event held there (see backend/apps/events/models.py).
// Who's actually claimed a booth for a specific event is tracked separately
// by BoothRegistration, keyed by (event, booth) — that split is what makes
// "reuse this venue's layout next year" and the loyalty-hold system work.

export type Venue = {
  id: number;
  name: string;
  city: string;
  booth_count: number;
  created_at: string;
  updated_at: string;
};

/** A physical booth slot on a Venue's floor plan — position/size/price. */
export type VenueBooth = {
  id: number;
  booth_number: string;
  position_x: string;
  position_y: string;
  width: string;
  height: string;
  price: string;
  created_at: string;
  updated_at: string;
};

/**
 * A labeled zone drawn on the map to indicate what a general area is for
 * (e.g. "top-left corner is Pokémon vendors") — a wayfinding overlay,
 * independent of individual booth markers. No admin-vs-public variant
 * needed here, unlike booths, since there's no sensitive data on a section.
 */
export type VenueSection = {
  id: number;
  category: string;
  position_x: string;
  position_y: string;
  width: string;
  height: string;
  created_at: string;
  updated_at: string;
};

/** Backs the admin venue floor-plan editor (GET /venues/:id/map/). */
export type VenueMap = {
  id: number;
  name: string;
  map_image_url: string | null;
  map_image_preset: string;
  booths: VenueBooth[];
  sections: VenueSection[];
};

export type RegistrationStatus =
  | "loyalty_hold"
  | "requested"
  | "confirmed"
  | "declined"
  | "released";

/**
 * A vendor's claim on a booth for one specific event — the admin-facing
 * shape (includes unlinked_vendor_contact, admin reference only). Used by
 * the event's booth-registration review page.
 */
export type BoothRegistration = {
  id: number;
  booth: number;
  booth_number: string;
  status: RegistrationStatus;
  vendor: number | null;
  vendor_detail: { pk: number; label: string } | null;
  unlinked_vendor_name: string;
  unlinked_vendor_category: string;
  unlinked_vendor_contact: string;
  price: string;
  requested_at: string;
  decided_at: string | null;
};

/**
 * One row from the site-wide "Booth Requests" admin tool — a pending
 * request from any event, with enough about its booth/venue to render a
 * floor-plan thumbnail with that booth highlighted. Backs
 * GET /events/registrations/pending/.
 */
export type PendingBoothRegistration = {
  id: number;
  event: number;
  event_name: string;
  booth: number;
  booth_number: string;
  venue_id: number;
  status: RegistrationStatus;
  vendor_detail: { pk: number; label: string } | null;
  unlinked_vendor_name: string;
  unlinked_vendor_category: string;
  price: string;
  requested_at: string;
};

/** Read-only, public-safe shape — never includes price or contact info. */
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
  sections: VenueSection[];
};

export type BoothAvailability =
  | "available"
  | "mine"
  | "taken"
  | "loyalty_held"
  | "loyalty_hold_mine";

/** A booth from the selecting vendor's own point of view — includes price. */
export type VendorBooth = {
  id: number;
  booth_number: string;
  position_x: string;
  position_y: string;
  width: string;
  height: string;
  price: string;
  availability: BoothAvailability;
  is_mine: boolean;
  registration_status: RegistrationStatus | null;
  /** Set only when is_mine — lets the vendor release their own booth. */
  registration_id: number | null;
};

/** Backs the vendor booth-selection page (GET /events/:id/vendor-booths/). */
export type VendorEventBooths = {
  map_image_url: string | null;
  map_image_preset: string;
  loyalty_priority_deadline: string | null;
  sections: VenueSection[];
  booths: VendorBooth[];
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

/**
 * Standard booth footprints (percentages of the map image) — "large" is
 * just two "small" booths pushed together lengthwise (same depth, double
 * width), matching how real card shows sell booths in table units. Sized
 * small enough that a single map can comfortably hold 50-100+ booths
 * (a 4%-wide booth still leaves room for ~25 across a row with gaps to
 * spare). These are quick-placement defaults, not hard limits: a booth can
 * still be dragged/resized freely on the canvas after being placed.
 */
export const BOOTH_SIZE_PRESETS = {
  small: { label: "Small", w: 4, h: 3 },
  large: { label: "Large", w: 8, h: 3 },
} as const;

export type BoothSizeKey = keyof typeof BOOTH_SIZE_PRESETS;
