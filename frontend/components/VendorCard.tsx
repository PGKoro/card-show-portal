"use client";

import Link from "next/link";

import { PlaceholderImage } from "@/components/PlaceholderImage";
import { useCategories } from "@/lib/CategoriesContext";

export type PublicVendor = {
  pk: number;
  business_name: string;
  business_description: string;
  location: string;
  category_tags: string[];
};

export function VendorCard({ vendor }: { vendor: PublicVendor }) {
  const { labelFor } = useCategories();
  return (
    <Link
      href={`/vendors/profile/${vendor.pk}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-800"
    >
      <PlaceholderImage
        label={vendor.business_name}
        category={vendor.category_tags[0] ?? ""}
        className="h-32 w-full rounded-none"
      />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-semibold group-hover:underline">{vendor.business_name}</h3>
        {vendor.location && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{vendor.location}</p>
        )}
        {vendor.business_description && (
          <p className="line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
            {vendor.business_description}
          </p>
        )}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
          {vendor.category_tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              {labelFor(tag)}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
