import Link from "next/link";

import { MESSAGES, getItemById, getVendorById } from "@/lib/mockData";

export default function CustomerDashboardPage() {
  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">My Messages</h1>
          <div className="flex gap-2">
            <Link
              href="/dashboard/settings"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              Profile Settings
            </Link>
            <Link
              href="/vendors"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              Browse Vendors
            </Link>
          </div>
        </div>

        <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm dark:divide-gray-800 dark:border-gray-800">
          {MESSAGES.map((message) => {
            const item = getItemById(message.itemId);
            const vendor = getVendorById(message.vendorId);
            if (!item || !vendor) return null;

            return (
              <Link
                key={message.id}
                href={`/vendors/${vendor.id}/items/${item.id}`}
                className="flex flex-col gap-1 p-4 hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{message.fromName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{message.timestamp}</p>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Re: {item.title}</p>
                <p className="truncate text-sm text-gray-600 dark:text-gray-300">{message.preview}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
