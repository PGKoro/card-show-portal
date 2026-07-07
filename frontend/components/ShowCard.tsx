import type { CardShow } from "@/lib/mockData";

// Informational only — there's no show detail page yet, so these aren't
// links, unlike vendor/inventory cards.
export function ShowCard({ show }: { show: CardShow }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{show.name}</h3>
        <span
          className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
            show.status === "upcoming"
              ? "bg-brand-blue/10 text-brand-blue"
              : "bg-gray-200 text-gray-600"
          }`}
        >
          {show.status === "upcoming" ? "Upcoming" : "Completed"}
        </span>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">{show.dateLabel}</p>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {show.venue}, {show.city}
      </p>
      <p className="mt-1 text-xs text-gray-400">
        {show.status === "upcoming"
          ? `${show.vendorCount} vendors booked`
          : `${show.vendorCount} vendors · ~${show.attendeeEstimate?.toLocaleString()} attendees`}
      </p>
    </div>
  );
}
