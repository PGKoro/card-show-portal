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
  archived: boolean;
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

/**
 * A manually-authored "custom vendor" marker on a Venue's floor plan (e.g. a
 * sponsor table or food truck) — a brand name + optional logo, resizable
 * like a real Booth, deliberately not linked to any vendor account. Fixed
 * facility types (ticketing, seating, food, etc.) are constant per venue,
 * so those get drawn directly into the floor plan image/builder instead of
 * being a separate runtime marker.
 */
export type VenueAmenity = {
  id: number;
  label: string;
  logo_image_url: string | null;
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
  amenities: VenueAmenity[];
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

/**
 * One row from a vendor's own booking history (GET /events/registrations/mine/)
 * — every status, across every event, with enough event detail to render a
 * "My Shows" card without a second fetch per row.
 */
export type VendorBoothRegistration = {
  id: number;
  event: number;
  event_name: string;
  event_status: "upcoming" | "past";
  event_start_date: string;
  event_end_date: string | null;
  event_venue: string;
  event_city: string;
  booth: number;
  booth_number: string;
  status: RegistrationStatus;
  price: string;
  requested_at: string;
  decided_at: string | null;
};

/**
 * Read-only, public-safe shape — never includes price or contact info.
 * Every booth on the venue's map is included, not just occupied ones, so
 * `status` says whether a given slot is open or already taken;
 * vendor_pk/vendor_name/vendor_category_tags are only meaningful when
 * status is "taken".
 */
export type PublicBooth = {
  id: number;
  booth_number: string;
  position_x: string;
  position_y: string;
  width: string;
  height: string;
  status: "available" | "taken";
  vendor_pk: number | null;
  vendor_name: string;
  vendor_category_tags: string[];
  /** Any other booths this same (linked) vendor holds at this event. */
  other_booth_numbers: string[];
  /** False (not just absent) for available/unlinked booths — safe to filter on directly. */
  also_buying: boolean;
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
  amenities: VenueAmenity[];
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
 * Standard booth footprint (percentage of the map image) used for
 * click-to-place and Generate Grid. Sized small enough that a single map
 * can comfortably hold 50-100+ booths (a 4%-wide booth still leaves room
 * for ~25 across a row with gaps to spare). Just a quick-placement
 * default, not a hard limit: a booth can still be dragged/resized freely
 * on the canvas after being placed. A vendor needing more than one table
 * just claims a second booth — see PublicBooth.other_booth_numbers —
 * rather than this needing a separate double-wide size.
 */
export const BOOTH_SIZE = { w: 4, h: 3 } as const;

/**
 * Auto-generates a precisely-aligned grid of booths instead of placing them
 * one at a time by hand — matches the common real-world convention of
 * booths arranged back-to-back in pairs across a walking aisle, with plain
 * numeric booth numbers (no row letters). For each "band" of two rows, the
 * top row numbers count up by `columnStep` per column (e.g. 200, 202, 204,
 * ...) and the bottom row is always top+1 (facing across the aisle, e.g.
 * 201, 203, 205...); the next band down starts `bandStep` higher (e.g. the
 * 300s, then 400s). `columnsPerGroup` controls how many columns sit flush
 * against each other before a wider aisle gap — 2 gives the classic
 * "pair of booths, then an aisle" layout.
 */
export type AisleGridParams = {
  rows: number;
  columns: number;
  columnsPerGroup: number;
  startNumber: number;
  columnStep: number;
  bandStep: number;
  boothWidth: number;
  boothHeight: number;
};

export type GeneratedBooth = {
  booth_number: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
};

const GRID_MARGIN_X = 2;
const GRID_MARGIN_Y = 5;
const GRID_WITHIN_GROUP_GAP = 0.4;
const GRID_AISLE_GAP = 3;
const GRID_WITHIN_BAND_GAP = 1;
const GRID_BAND_GAP = 4;

function aisleGridGeometry(params: AisleGridParams) {
  const groupWidth =
    params.columnsPerGroup * params.boothWidth + (params.columnsPerGroup - 1) * GRID_WITHIN_GROUP_GAP;
  const numGroups = Math.ceil(params.columns / params.columnsPerGroup);
  const bandHeight = 2 * params.boothHeight + GRID_WITHIN_BAND_GAP;
  return { groupWidth, numGroups, bandHeight };
}

/** Total footprint (percent of the map) a grid with these params would need. */
export function aisleGridBounds(params: AisleGridParams): { width: number; height: number } {
  const { groupWidth, numGroups, bandHeight } = aisleGridGeometry(params);
  const width = GRID_MARGIN_X * 2 + numGroups * groupWidth + (numGroups - 1) * GRID_AISLE_GAP;
  const height = GRID_MARGIN_Y * 2 + params.rows * bandHeight + (params.rows - 1) * GRID_BAND_GAP;
  return { width, height };
}

export function generateAisleGrid(params: AisleGridParams): GeneratedBooth[] {
  const { groupWidth, bandHeight } = aisleGridGeometry(params);
  const booths: GeneratedBooth[] = [];

  for (let band = 0; band < params.rows; band++) {
    const bandY = GRID_MARGIN_Y + band * (bandHeight + GRID_BAND_GAP);
    for (let col = 0; col < params.columns; col++) {
      const groupIndex = Math.floor(col / params.columnsPerGroup);
      const posInGroup = col % params.columnsPerGroup;
      const x =
        GRID_MARGIN_X +
        groupIndex * (groupWidth + GRID_AISLE_GAP) +
        posInGroup * (params.boothWidth + GRID_WITHIN_GROUP_GAP);
      const topNumber = params.startNumber + band * params.bandStep + col * params.columnStep;

      booths.push({
        booth_number: String(topNumber),
        position_x: x,
        position_y: bandY,
        width: params.boothWidth,
        height: params.boothHeight,
      });
      booths.push({
        booth_number: String(topNumber + 1),
        position_x: x,
        position_y: bandY + params.boothHeight + GRID_WITHIN_BAND_GAP,
        width: params.boothWidth,
        height: params.boothHeight,
      });
    }
  }

  return booths;
}
