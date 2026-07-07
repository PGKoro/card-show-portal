import { CATEGORY_STYLES, type VendorCategory } from "@/lib/mockData";

type Props = {
  label: string;
  category: VendorCategory;
  className?: string;
};

// Stand-in for real card/vendor photos, which don't exist yet. Colored by
// category so grids still read as visually distinct at a glance.
export function PlaceholderImage({ label, category, className = "" }: Props) {
  return (
    <div
      className={`flex items-center justify-center rounded-md p-3 text-center ${CATEGORY_STYLES[category]} ${className}`}
    >
      <span className="text-sm font-medium leading-snug">{label}</span>
    </div>
  );
}
