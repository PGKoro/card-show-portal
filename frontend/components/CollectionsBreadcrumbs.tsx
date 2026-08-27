"use client";

import Link from "next/link";

export type Breadcrumb = {
  label: string;
  href: string;
};

/** Collections -> Category -> Year -> Company -> Set [-> Card], every
 *  segment clickable. Used on every Collections page below the top level. */
export function CollectionsBreadcrumbs({ items }: { items: Breadcrumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
      {items.map((item, index) => (
        <span key={item.href} className="flex items-center gap-1">
          {index > 0 && <span className="text-gray-400">/</span>}
          {index === items.length - 1 ? (
            <span className="font-medium text-gray-900 dark:text-gray-100">{item.label}</span>
          ) : (
            <Link href={item.href} className="hover:text-brand-blue hover:underline">
              {item.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
