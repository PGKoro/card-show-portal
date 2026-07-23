export type EventStatus = "upcoming" | "past";

export type VendorDetail = { pk: number; label: string };
export type VenueDetail = { pk: number; name: string };

/** A vendor's own active booth-registration status on an event, from
 * their point of view — null if they don't have one (or aren't a vendor/
 * aren't signed in). Mirrors BoothRegistration.Status minus loyalty_hold's
 * distinction, since a hold is included as "loyalty_hold" too. */
export type VendorRegistrationStatus =
  | "loyalty_hold"
  | "requested"
  | "confirmed"
  | null;

export type ShowEvent = {
  id: number;
  name: string;
  venue: string;
  city: string;
  description: string;
  start_date: string;
  end_date: string | null;
  vendors: number[];
  vendors_detail: VendorDetail[];
  vendor_count: number;
  estimated_cards: number;
  estimated_attendees: number;
  status: EventStatus;
  /** True once start_date has been reached — distinct from `status`,
   * which only flips to "past" once a multi-day event has fully ended.
   * Vendor booth registration closes as soon as this is true. */
  has_started: boolean;
  archived: boolean;
  map_venue: number | null;
  map_venue_detail: VenueDetail | null;
  /** Doesn't say whether an image has actually been uploaded — that's
   * only ever revealed through the gated /events/:id/map/ endpoint. */
  map_visible: boolean;
  /** Separate from map_visible — controls vendor booth self-selection. */
  map_visible_to_vendors: boolean;
  /** Until this passes, a booth a vendor held at this venue's most recent
   * prior event is held exclusively for them. Null = no loyalty window. */
  loyalty_priority_deadline: string | null;
  /** Only populated when the requesting user is a vendor — their own
   * active registration status for this event, or null if they don't
   * have one yet. */
  vendor_registration_status: VendorRegistrationStatus;
};

const EVENT_IMAGES = ["/cardshow1.webp", "/cardshow2.avif", "/cardshow3.jpeg"];

export function getEventImage(id: number): string {
  return EVENT_IMAGES[id % EVENT_IMAGES.length];
}

function formatDate(dateString: string): string {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatEventDateRange(event: Pick<ShowEvent, "start_date" | "end_date">): string {
  if (!event.end_date || event.end_date === event.start_date) {
    return formatDate(event.start_date);
  }

  const start = new Date(`${event.start_date}T00:00:00`);
  const end = new Date(`${event.end_date}T00:00:00`);
  const sameMonthYear =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();

  if (sameMonthYear) {
    const month = start.toLocaleDateString("en-US", { month: "long" });
    return `${month} ${start.getDate()} - ${end.getDate()}, ${end.getFullYear()}`;
  }

  return `${formatDate(event.start_date)} - ${formatDate(event.end_date)}`;
}
