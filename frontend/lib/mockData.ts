// Shared grading vocabulary — mirrors the choices defined on the backend
// (apps.listings.models.Listing) so the frontend has matching types/labels
// without re-fetching them. Category is *not* here — it's a live,
// admin-managed list fetched via lib/CategoriesContext instead of a fixed
// enum. No fake data lives here; real vendors/listings come from the API
// (see lib/api.ts).

export type GradingCompany = "ungraded" | "psa" | "bgs" | "sgc" | "cgc" | "other";

// Standard 1-10 grading scale in half-point increments (PSA/BGS/SGC/CGC all
// use this), offered highest-first to match how graded cards are usually
// listed.
export const GRADE_VALUES: string[] = Array.from({ length: 19 }, (_, i) => (10 - i * 0.5).toFixed(1));

export const GRADING_LABELS: Record<GradingCompany, string> = {
  ungraded: "Ungraded",
  psa: "PSA",
  bgs: "BGS",
  sgc: "SGC",
  cgc: "CGC",
  other: "Other",
};

export type InventoryStatus = "available" | "reserved" | "sold";

export const STATUS_LABELS: Record<InventoryStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
};

export type InventoryItem = {
  id: string;
  vendorId: string;
  category: string;
  title: string;
  price: number;
  grading: GradingCompany;
  /** The numeric grade (e.g. 9.5, 10) a grading company assigned — null
   *  while ungraded. */
  grade: number | null;
  status: InventoryStatus;
  description: string;
};
