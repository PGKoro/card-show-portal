import Link from "next/link";
import { notFound } from "next/navigation";

import { PlaceholderImage } from "@/components/PlaceholderImage";
import {
  CONDITION_LABELS,
  STATUS_LABELS,
  getItemById,
  getVendorById,
} from "@/lib/mockData";

import { MessageVendorPanel } from "./MessageVendorPanel";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ vendorId: string; itemId: string }>;
}) {
  const { vendorId, itemId } = await params;
  const vendor = getVendorById(vendorId);
  const item = getItemById(itemId);

  if (!vendor || !item || item.vendorId !== vendor.id) {
    notFound();
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/vendors/${vendor.id}`}
          className="text-sm font-medium text-brand-blue hover:underline"
        >
          &larr; Back to {vendor.businessName}
        </Link>

        <div className="mt-4 grid grid-cols-1 gap-8 sm:grid-cols-2">
          <PlaceholderImage label={item.title} category={item.category} className="h-72 w-full" />

          <div className="flex flex-col gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{item.title}</h1>
            <p className="text-2xl font-semibold">${item.price.toLocaleString()}</p>

            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {CONDITION_LABELS[item.condition]}
              </span>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {STATUS_LABELS[item.status]}
              </span>
            </div>

            <p className="text-gray-600 dark:text-gray-300">{item.description}</p>

            <p className="text-sm text-gray-500 dark:text-gray-400">
              Sold by{" "}
              <Link href={`/vendors/${vendor.id}`} className="font-medium text-brand-blue hover:underline">
                {vendor.businessName}
              </Link>
            </p>

            <div className="mt-4">
              <MessageVendorPanel vendorName={vendor.businessName} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
