import Image from "next/image";
import Link from "next/link";

import { CATEGORY_LABELS, getExampleVendorImage, type VendorProfile } from "@/lib/mockData";

export function VendorCard({ vendor }: { vendor: VendorProfile }) {
  return (
    <Link
      href={`/vendors/${vendor.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-800"
    >
      <div className="relative h-32 w-full">
        <Image src={getExampleVendorImage(vendor.id)} alt={vendor.businessName} fill className="object-cover" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold group-hover:underline">{vendor.businessName}</h3>
          <span className="whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
            ★ {vendor.rating.toFixed(1)}
          </span>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{vendor.location}</p>
        <p className="line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
          {vendor.description}
        </p>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
          {vendor.categoryTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              {CATEGORY_LABELS[tag]}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
