"use client";

import Link from "next/link";

const SECTIONS = [
  {
    href: "/dashboard/admin/collections/sets",
    title: "Sets",
    description: "Create, edit, and delete registry sets (category + year + company).",
  },
  {
    href: "/dashboard/admin/collections/companies",
    title: "Companies",
    description: "Manage the brand/company vocabulary sets are assigned to.",
  },
  {
    href: "/dashboard/admin/collections/cards",
    title: "Cards",
    description: "Search and manage individual registry cards across every set.",
  },
  {
    href: "/dashboard/admin/collections/submissions",
    title: "Card Submissions",
    description: "Review \"Can't find your card?\" requests from dealers.",
  },
];

export default function ManageCollectionsPage() {
  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Link href="/dashboard/admin" className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline">
          ← Admin Tools
        </Link>
        <h1 className="mb-1 text-2xl font-semibold">Manage Collections</h1>
        <p className="mb-8 text-sm text-gray-500 dark:text-gray-400">
          Manage the Set Registry that backs the public Collections browsing experience.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-800"
            >
              <h2 className="font-semibold">{section.title}</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{section.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
