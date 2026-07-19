"use client";

import Link from "next/link";

import { useAuth } from "@/lib/AuthContext";
import { formatEventDateRange, type ShowEvent } from "@/lib/events";

export function ShowCard({ show }: { show: ShowEvent }) {
  const { user } = useAuth();
  const canSelectBooth =
    show.status === "upcoming" &&
    show.map_visible_to_vendors &&
    user?.role === "vendor" &&
    user?.vendor_status === "approved";

  return (
    <div className="group flex flex-col gap-1.5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-800">
      <Link href={`/events/${show.id}`} className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold group-hover:underline">{show.name}</h3>
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
        <p className="text-sm text-gray-500 dark:text-gray-400">{formatEventDateRange(show)}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {show.venue}, {show.city}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          {show.status === "upcoming"
            ? `${show.vendor_count} vendors booked`
            : `${show.vendor_count} vendors · ~${show.estimated_attendees.toLocaleString()} attendees`}
        </p>
      </Link>

      {canSelectBooth && (
        <Link
          href={`/dashboard/vendor/booths/${show.id}`}
          className="mt-2 rounded-md bg-brand-blue px-3 py-1.5 text-center text-xs font-medium text-white hover:bg-brand-navy"
        >
          Select a Booth
        </Link>
      )}
    </div>
  );
}
