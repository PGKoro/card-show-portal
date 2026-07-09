export type EventStatus = "upcoming" | "past";

export type VendorDetail = { pk: number; label: string };

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
