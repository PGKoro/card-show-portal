// Shared condition/grading vocabulary — mirrors the choices defined on the
// backend (apps.listings.models.Listing) so the frontend has matching
// types/labels without re-fetching them. Category is *not* here — it's a
// live, admin-managed list fetched via lib/CategoriesContext instead of a
// fixed enum. No fake data lives here; real vendors/listings come from the
// API (see lib/api.ts).

export type InventoryCondition = "mint" | "near-mint" | "excellent" | "good" | "fair";

export const CONDITION_LABELS: Record<InventoryCondition, string> = {
  mint: "Mint",
  "near-mint": "Near Mint",
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
};

export type GradingCompany = "ungraded" | "psa" | "bgs" | "sgc" | "cgc" | "other";

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
  condition: InventoryCondition;
  grading?: GradingCompany;
  status: InventoryStatus;
  description: string;
};
