import Image from "next/image";
import Link from "next/link";

import { PlaceholderImage } from "@/components/PlaceholderImage";
import { CONDITION_LABELS, GRADING_LABELS, STATUS_LABELS, type InventoryItem } from "@/lib/mockData";

const STATUS_STYLES: Record<InventoryItem["status"], string> = {
  available: "bg-emerald-100 text-emerald-800",
  reserved: "bg-amber-100 text-amber-800",
  sold: "bg-gray-200 text-gray-600",
};

export function InventoryCard({
  item,
  href,
  vendorName,
  imageSrc,
}: {
  item: InventoryItem;
  href?: string;
  vendorName?: string;
  /** Real (if unrelated) card photo to show instead of the tinted
   *  placeholder — used where we want listings to look like they have
   *  actual photography. */
  imageSrc?: string;
}) {
  const content = (
    <>
      {imageSrc ? (
        <div className="relative h-32 w-full">
          <Image src={imageSrc} alt={item.title} fill className="object-cover" />
        </div>
      ) : (
        <PlaceholderImage label={item.title} category={item.category} className="h-32 w-full rounded-none" />
      )}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {vendorName && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{vendorName}</p>
        )}
        <h3 className="text-sm font-semibold leading-snug group-hover:underline">{item.title}</h3>
        <p className="font-semibold">${item.price.toLocaleString()}</p>
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {CONDITION_LABELS[item.condition]}
          </span>
          {item.grading && item.grading !== "ungraded" && (
            <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-xs font-medium text-brand-blue">
              {GRADING_LABELS[item.grading]}
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[item.status]}`}>
            {STATUS_LABELS[item.status]}
          </span>
        </div>
      </div>
    </>
  );

  const className =
    "group flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800";

  if (!href) {
    // Items added through the "Add Item" demo form aren't in the mock
    // catalog, so there's no detail page to link to.
    return <div className={className}>{content}</div>;
  }

  return (
    <Link href={href} className={`${className} transition hover:-translate-y-0.5 hover:shadow-lg`}>
      {content}
    </Link>
  );
}
