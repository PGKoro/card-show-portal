import Link from "next/link";

// Placeholder hub linking to each role's dashboard. Once auth state is
// wired up, this should read the logged-in user's role (from
// /api/v1/auth/user/) and redirect straight to the matching route below.
export default function DashboardPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="max-w-md text-gray-600 dark:text-gray-300">
        Choose a role to preview its dashboard.
      </p>
      <div className="flex gap-4">
        <Link
          href="/dashboard/vendor"
          className="rounded-md border border-gray-300 px-5 py-2.5 font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
        >
          Vendor
        </Link>
        <Link
          href="/dashboard/customer"
          className="rounded-md border border-gray-300 px-5 py-2.5 font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
        >
          Customer
        </Link>
        <Link
          href="/dashboard/admin"
          className="rounded-md border border-gray-300 px-5 py-2.5 font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
        >
          Admin
        </Link>
      </div>
    </main>
  );
}
