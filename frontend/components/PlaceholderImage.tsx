"use client";

import { useCategories } from "@/lib/CategoriesContext";

type Props = {
  label: string;
  category: string;
  className?: string;
};

// Stand-in for real card/vendor photos, which don't exist yet. Colored by
// category so grids still read as visually distinct at a glance.
export function PlaceholderImage({ label, category, className = "" }: Props) {
  const { styleFor } = useCategories();
  return (
    <div
      className={`flex items-center justify-center rounded-md p-3 text-center ${styleFor(category)} ${className}`}
    >
      <span className="text-sm font-medium leading-snug">{label}</span>
    </div>
  );
}
