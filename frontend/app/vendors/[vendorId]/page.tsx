import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InventoryCard } from "@/components/InventoryCard";
import { CATEGORY_LABELS, getExampleVendorImage, getItemsByVendor, getVendorById } from "@/lib/mockData";

export default async function VendorProfilePage({
  params,
}: {
  params: Promise<{ vendorId: string }>;
}) {
  const { vendorId } = await params;
  const vendor = getVendorById(vendorId);

  if (!vendor) {
    notFound();
  }

  const items = getItemsByVendor(vendor.id);

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <Link href="/vendors" className="text-sm font-medium text-brand-blue hover:underline">
          &larr; Back to all vendors
        </Link>

        <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="relative h-40 w-full flex-shrink-0 overflow-hidden rounded-md sm:w-56">
            <Image
              src={getExampleVendorImage(vendor.id)}
              alt={vendor.businessName}
              fill
              className="object-cover"
            />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{vendor.businessName}</h1>
            <p className="mt-1 text-gray-500 dark:text-gray-400">
              {vendor.location} &middot; ★ {vendor.rating.toFixed(1)}
            </p>
            <p className="mt-3 max-w-2xl text-gray-600 dark:text-gray-300">{vendor.description}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
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
        </div>

        <h2 className="mb-4 mt-10 text-xl font-semibold">
          Inventory <span className="text-gray-400">({items.length})</span>
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <InventoryCard key={item.id} item={item} href={`/vendors/${vendor.id}/items/${item.id}`} />
          ))}
        </div>
      </div>
    </main>
  );
}
