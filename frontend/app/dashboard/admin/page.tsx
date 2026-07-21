"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Spinner } from "@/components/Spinner";
import { apiFetch, type PaginatedResponse } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type CountKey = "vendorApprovals" | "boothRequests";

type AdminTool = {
  href: string;
  title: string;
  description: string;
  countKey: CountKey | null;
};

// Grouped by the kind of work each tool is for, rather than one flat list —
// makes it easier to scan as more tools get added over time.
const ADMIN_SECTIONS: { title: string; tools: AdminTool[] }[] = [
  {
    title: "Approvals",
    tools: [
      {
        href: "/dashboard/admin/vendor-approvals",
        title: "Vendor Approvals",
        description: "Review new vendor signups before they can list inventory.",
        countKey: "vendorApprovals",
      },
      {
        href: "/dashboard/admin/booth-requests",
        title: "Booth Requests",
        description: "Confirm or decline vendor booth requests across every event.",
        countKey: "boothRequests",
      },
    ],
  },
  {
    title: "Events",
    tools: [
      {
        href: "/dashboard/admin/events",
        title: "Manage Events",
        description: "Create events and adjust their details, vendors, and estimates.",
        countKey: null,
      },
      {
        href: "/dashboard/admin/venues",
        title: "Manage Venues",
        description: "Build reusable floor plans (booths + pricing) for each location.",
        countKey: null,
      },
    ],
  },
  {
    title: "Website",
    tools: [
      {
        href: "/dashboard/admin/manage-roles",
        title: "Manage Roles",
        description: "Search for a user and switch their role.",
        countKey: null,
      },
      {
        href: "/dashboard/admin/categories",
        title: "Manage Categories",
        description: "Add, remove, and reorder the card categories used across the site.",
        countKey: null,
      },
    ],
  },
];

export default function AdminDashboardPage() {
  const [counts, setCounts] = useState<Record<CountKey, number | null>>({
    vendorApprovals: null,
    boothRequests: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    const accessToken = getAccessToken() ?? undefined;
    Promise.allSettled([
      apiFetch<PaginatedResponse<unknown>>("/admin/vendors/pending/?page_size=1", {
        accessToken,
      }).then((data) => {
        if (!cancelled) setCounts((c) => ({ ...c, vendorApprovals: data.count }));
      }),
      apiFetch<PaginatedResponse<unknown>>("/events/registrations/pending/?page_size=1", {
        accessToken,
      }).then((data) => {
        if (!cancelled) setCounts((c) => ({ ...c, boothRequests: data.count }));
      }),
    ]).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredSections = ADMIN_SECTIONS.map((section) => ({
    ...section,
    tools: section.tools.filter(
      (tool) =>
        !normalizedSearch ||
        tool.title.toLowerCase().includes(normalizedSearch) ||
        tool.description.toLowerCase().includes(normalizedSearch),
    ),
  })).filter((section) => section.tools.length > 0);

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-2xl font-semibold">Admin Tools</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">Pick a tool below.</p>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search admin tools..."
          className="mb-8 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
        />

        {isLoading ? (
          <Spinner />
        ) : filteredSections.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No matching tools.
          </p>
        ) : (
          <div className="space-y-8">
            {filteredSections.map((section) => (
              <div key={section.title}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {section.title}
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {section.tools.map((tool) => {
                    const count = tool.countKey ? counts[tool.countKey] : null;
                    return (
                      <Link
                        key={tool.href}
                        href={tool.href}
                        className="relative rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-800"
                      >
                        {!!count && (
                          <span className="absolute -top-2 -right-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
                            {count}
                          </span>
                        )}
                        <h3 className="font-semibold">{tool.title}</h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          {tool.description}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
