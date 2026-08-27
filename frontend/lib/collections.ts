// Shared types + small helpers for the Collections / Set Registry feature.
// Mirrors apps.collections' serializer shapes (backend/apps/collections/serializers.py).

export type Company = {
  id: number;
  name: string;
  slug: string;
};

export type CardSetSummary = {
  id: number;
  name: string;
  year: number;
  company: number;
  company_name: string;
  category: string;
  category_name: string;
  image_url: string | null;
  card_count: number;
};

export type CardSummary = {
  id: number;
  card_number: string;
  player_name: string;
  variation: string;
  print_run: number | null;
  image_front_url: string | null;
  listing_count: number;
};

export type CardDetail = {
  id: number;
  set_id: number;
  set_name: string;
  year: number;
  company_id: number;
  company_name: string;
  category: string;
  category_name: string;
  card_number: string;
  player_name: string;
  team: string;
  variation: string;
  print_run: number | null;
  image_front_url: string | null;
  image_back_url: string | null;
};

export type SearchResultCard = CardSummary & {
  set_id: number;
  set_name: string;
  year: number;
  company_name: string;
  category: string;
  category_name: string;
};

export type CollectionsSearchResponse = {
  sets: CardSetSummary[];
  cards: SearchResultCard[];
};

export type CardDealerListing = {
  id: number;
  title: string;
  description: string;
  category: string;
  card: number | null;
  front_image_url: string | null;
  back_image_url: string | null;
  price: string | null;
  accepting_offers: boolean;
  accepting_trades: boolean;
  grading: "ungraded" | "psa" | "bgs" | "sgc" | "cgc" | "other";
  grading_company_other: string;
  grade: string | null;
  is_serial_numbered: boolean;
  serial_copy_number: number | null;
  serial_print_run: number | null;
  status: "available" | "reserved" | "sold";
  vendor: number;
  vendor_name: string;
  vendor_location: string;
};

/** "PSA 9", "BGS 9.5", or a custom "Other" company name + grade. */
export function formatGrade(
  grading: CardDealerListing["grading"],
  grade: string | null,
  gradingCompanyOther: string,
): string | null {
  if (grading === "ungraded" || grade === null) return null;
  const companyLabel: Record<CardDealerListing["grading"], string> = {
    ungraded: "",
    psa: "PSA",
    bgs: "BGS",
    sgc: "SGC",
    cgc: "CGC",
    other: gradingCompanyOther || "Graded",
  };
  return `${companyLabel[grading]} ${grade}`;
}

/** "57/99" from the structural copy_number/print_run pair. */
export function formatSerial(copyNumber: number | null, printRun: number | null): string | null {
  if (copyNumber === null || printRun === null) return null;
  return `${copyNumber}/${printRun}`;
}

export type AdminCardSet = CardSetSummary & {
  created_at: string;
};

export type AdminCard = {
  id: number;
  set: number;
  set_name: string;
  player_name: string;
  team: string;
  card_number: string;
  variation: string;
  print_run: number | null;
  image_front_url: string | null;
  image_back_url: string | null;
  listing_count: number;
  created_at: string;
};

export type AdminCardSubmission = {
  id: number;
  set: number;
  set_name: string;
  player_name: string;
  team: string;
  card_number: string;
  variation: string;
  print_run: number | null;
  notes: string;
  status: "pending" | "approved" | "rejected";
  resulting_card: number | null;
  submitted_by_name: string | null;
  created_at: string;
};
