import Link from "next/link";

const ADMIN_TOOLS = [
  {
    href: "/dashboard/admin/vendor-approvals",
    title: "Vendor Approvals",
    description: "Review new vendor signups before they can list inventory.",
  },
  {
    href: "/dashboard/admin/manage-roles",
    title: "Manage Roles",
    description: "Search for a user and switch their role.",
  },
  {
    href: "/dashboard/admin/events",
    title: "Manage Events",
    description: "Create events and adjust their details, vendors, and estimates.",
  },
];

export default function AdminDashboardPage() {
  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-2xl font-semibold">Admin Tools</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          Pick a tool below.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {ADMIN_TOOLS.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-800"
            >
              <h2 className="font-semibold">{tool.title}</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{tool.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
