import Link from "next/link";

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

        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">No messages yet.</p>
        </div>
      </div>
    </main>
  );
}
