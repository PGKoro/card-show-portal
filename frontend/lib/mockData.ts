// Fake data for the clickable prototype. Nothing here is persisted or backed
// by the real API — see backend/config/urls.py for the real endpoints, none
// of which this prototype calls.

export type VendorCategory = "vintage" | "modern" | "pokemon" | "memorabilia" | "supplies";

export const CATEGORY_LABELS: Record<VendorCategory, string> = {
  vintage: "Vintage",
  modern: "Modern",
  pokemon: "Pokémon",
  memorabilia: "Memorabilia",
  supplies: "Supplies",
};

// Tinted with the Perfect Game brand palette so category badges/placeholder
// images feel consistent with the rest of the site's colors.
export const CATEGORY_STYLES: Record<VendorCategory, string> = {
  vintage: "bg-brand-orange/10 text-brand-orange",
  modern: "bg-brand-blue/10 text-brand-blue",
  pokemon: "bg-brand-yellow/20 text-brand-gray-900",
  memorabilia: "bg-brand-red/10 text-brand-red",
  supplies: "bg-brand-teal/10 text-brand-teal",
};

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

export type VendorProfile = {
  id: string;
  businessName: string;
  description: string;
  categoryTags: VendorCategory[];
  location: string;
  rating: number;
};

export type InventoryItem = {
  id: string;
  vendorId: string;
  category: VendorCategory;
  title: string;
  price: number;
  condition: InventoryCondition;
  /** Absent on the mock catalog data below; real listings from the API
   *  always set this (defaulting to "ungraded"). */
  grading?: GradingCompany;
  status: InventoryStatus;
  description: string;
};

export type Message = {
  id: string;
  itemId: string;
  vendorId: string;
  fromName: string;
  preview: string;
  body: string;
  timestamp: string;
};

export const VENDORS: VendorProfile[] = [
  {
    id: "diamond-dynasty",
    businessName: "Diamond Dynasty Cards",
    description:
      "Family-run shop specializing in pre-war and golden-age baseball cards, in business since 1998. We grade in-house before every show.",
    categoryTags: ["vintage", "modern"],
    location: "Chicago, IL",
    rating: 4.8,
  },
  {
    id: "rookie-rush",
    businessName: "Rookie Rush Collectibles",
    description:
      "Your source for the hottest rookie cards and game-used memorabilia across football, basketball, and baseball.",
    categoryTags: ["modern", "memorabilia"],
    location: "Austin, TX",
    rating: 4.6,
  },
  {
    id: "poke-vault",
    businessName: "Poké Vault",
    description:
      "Sealed product, graded slabs, and alt-art chase cards. If it's Pokémon, we probably have it — or can track it down.",
    categoryTags: ["pokemon"],
    location: "Seattle, WA",
    rating: 4.9,
  },
  {
    id: "old-school-slabs",
    businessName: "Old School Slabs",
    description:
      "Strictly vintage. Every card in our case is pre-1980 and professionally graded. No reprints, no exceptions.",
    categoryTags: ["vintage"],
    location: "Philadelphia, PA",
    rating: 4.7,
  },
  {
    id: "grand-slam-supplies",
    businessName: "Grand Slam Supplies",
    description:
      "The supply booth every dealer visits before doors open. Holders, sleeves, storage boxes, and a few modern hits too.",
    categoryTags: ["supplies", "modern"],
    location: "Tampa, FL",
    rating: 4.5,
  },
  {
    id: "the-card-corner",
    businessName: "The Card Corner",
    description:
      "A little bit of everything — vintage, modern, and Pokémon side by side. Great for collectors who don't stick to one lane.",
    categoryTags: ["vintage", "pokemon", "modern"],
    location: "Columbus, OH",
    rating: 4.8,
  },
];

const CONDITIONS: InventoryCondition[] = ["mint", "near-mint", "excellent", "good", "fair"];

function buildItems(
  vendorId: string,
  entries: Array<[VendorCategory, string, number, string]>,
): InventoryItem[] {
  return entries.map(([category, title, price, description], index) => ({
    id: `${vendorId}-item-${index + 1}`,
    vendorId,
    category,
    title,
    price,
    condition: CONDITIONS[index % CONDITIONS.length],
    status: index % 7 === 3 ? "sold" : index % 5 === 2 ? "reserved" : "available",
    description,
  }));
}

export const INVENTORY_ITEMS: InventoryItem[] = [
  ...buildItems("diamond-dynasty", [
    ["vintage", "1957 Topps Mickey Mantle #95", 12500, "Classic 1957 Topps design, corners show light wear consistent with the grade."],
    ["vintage", "1969 Topps Nolan Ryan Rookie #533", 8200, "Shared rookie card, centering slightly off but strong color and gloss."],
    ["vintage", "1963 Topps Pete Rose Rookie", 6400, "One of the most recognizable rookie cards in the hobby."],
    ["vintage", "1971 Topps Roberto Clemente #630", 3100, "Black-bordered 1971 issue, tough to find without edge wear."],
    ["vintage", "1965 Topps Sandy Koufax #300", 2800, "Iconic photo variation, clean surfaces front and back."],
    ["modern", "2023 Topps Chrome Julio Rodriguez Refractor", 145, "Sharp corners, strong refractor shine under light."],
    ["modern", "2020 Prizm Justin Herbert RC", 210, "Base Prizm rookie, a staple in any modern QB collection."],
    ["modern", "2018 Bowman Chrome Shohei Ohtani Auto", 890, "On-card autograph, encapsulated for protection."],
    ["vintage", "1968 Topps Johnny Bench Rookie", 4200, "Shared rookie card featuring a young Johnny Bench."],
    ["modern", "2022 Panini Optic Ja'Marr Chase", 165, "Optic parallel with strong pack-fresh appearance."],
  ]),
  ...buildItems("rookie-rush", [
    ["modern", "2021 Topps Update Wander Franco RC", 240, "High-demand rookie from the Update series."],
    ["modern", "2019 Panini Prizm Zion Williamson RC", 520, "Base Prizm rookie from a stacked draft class."],
    ["modern", "2023 Bowman Draft Paul Skenes", 310, "Pre-MLB debut prospect card, already climbing in value."],
    ["modern", "2020 Donruss Optic Joe Burrow RC", 195, "Optic finish rookie from Burrow's draft year."],
    ["modern", "2022 Topps Chrome Update Aaron Judge", 175, "Released during Judge's record-setting season."],
    ["modern", "2021 Panini Mosaic Trevor Lawrence RC", 130, "Mosaic parallel, bright and eye-catching in person."],
    ["memorabilia", "Game-Worn Jersey Patch Card", 280, "Multi-color patch swatch, numbered to 99."],
    ["memorabilia", "Signed Mini Helmet Display", 150, "Includes display case and certificate of authenticity."],
    ["memorabilia", "Autographed Baseball in Case", 220, "Clean sweet-spot signature, comes in a UV-protective case."],
    ["memorabilia", "Game-Used Bat Relic Card", 95, "Small bat barrel relic, corners sharp."],
  ]),
  ...buildItems("poke-vault", [
    ["pokemon", "Charizard VMAX Rainbow Rare", 380, "Champion's Path chase card, holo pattern is flawless."],
    ["pokemon", "Base Set Blastoise Holo", 260, "Unlimited print, classic shadowless-era holo pattern."],
    ["pokemon", "Umbreon VMAX Alt Art", 410, "Evolving Skies chase card, one of the most requested alt arts."],
    ["pokemon", "Lugia Legend", 190, "Neo Genesis holo, a fan favorite from the era."],
    ["pokemon", "Mewtwo GX Rainbow Rare", 140, "Shining Legends rainbow rare, bright and vibrant."],
    ["pokemon", "Base Set 1st Edition Venusaur", 950, "First edition shadowless, a true grail for set collectors."],
    ["pokemon", "Rayquaza VMAX Alt Art", 340, "Evolving Skies alt art, consistently one of the set's top pulls."],
    ["pokemon", "Gengar VMAX Alt Art", 220, "Fusion Strike alt art with a moody, popular illustration."],
    ["pokemon", "Eevee Heroes Sylveon", 260, "Japanese exclusive promo, highly sought after by alt-art collectors."],
  ]),
  ...buildItems("old-school-slabs", [
    ["vintage", "1959 Topps Hank Aaron #380", 3400, "Solid centering for the era, graded and encapsulated."],
    ["vintage", "1962 Topps Willie Mays #300", 3900, "Wood-grain border design, a fan favorite vintage issue."],
    ["vintage", "1975 Topps Robin Yount Rookie", 1200, "Colorful borders, shared rookie card with George Brett."],
    ["vintage", "1970 Topps Reggie Jackson #66", 1600, "Grey-back variation, strong eye appeal for the grade."],
    ["vintage", "1957 Topps Frank Robinson Rookie", 2100, "Clean surfaces, tough card to find without print defects."],
    ["vintage", "1969 Topps Reggie Jackson Rookie #260", 2800, "High-demand rookie card from the 1969 set."],
    ["vintage", "1963 Topps Willie Stargell Rookie", 980, "Shared rookie card, great color for the assigned grade."],
    ["vintage", "1971 Topps Thurman Munson #5", 740, "Early-career card of the late Yankees catcher."],
  ]),
  ...buildItems("grand-slam-supplies", [
    ["supplies", "One-Touch Magnetic Card Holders (25ct)", 45, "UV-protective, fits standard card thickness."],
    ["supplies", "Card Saver Semi-Rigid Sleeves (100ct)", 18, "The standard sleeve for submitting cards to grading."],
    ["supplies", "Graded Slab Display Case (10ct)", 32, "Stackable cases sized for standard graded slabs."],
    ["supplies", "Team Bag Sleeves (1000ct)", 22, "Penny-sleeve-compatible outer sleeves, bulk pack."],
    ["supplies", "Card Storage Box (5000ct)", 15, "Sturdy cardboard box with lid, holds five rows."],
    ["modern", "2022 Topps Series 1 Hobby Box", 95, "Factory sealed, 24 packs per box."],
    ["modern", "2023 Prizm Football Hobby Box", 420, "Factory sealed, one of the year's most popular releases."],
    ["supplies", "Trimmer & Corner Rounder Kit", 60, "For supply booth demos only — not for altering graded cards."],
  ]),
  ...buildItems("the-card-corner", [
    ["vintage", "1968 Topps Nolan Ryan/Jerry Koosman", 5100, "Shared rookie card, one of the hobby's most iconic images."],
    ["pokemon", "Base Set Charizard Holo (Unlimited)", 720, "The card that built the modern hobby's Pokémon side."],
    ["modern", "2021 Topps Chrome Wander Franco Auto RC", 610, "On-card rookie autograph, refractor finish."],
    ["vintage", "1972 Topps Carlton Fisk Rookie", 890, "High-number series card, tough to find well-centered."],
    ["pokemon", "Neo Destiny Espeon Holo", 210, "Iconic Eeveelution holo from the Neo Destiny set."],
    ["modern", "2019 Panini National Treasures Ja Morant RC Patch Auto", 1450, "Low-numbered patch autograph from a premium product."],
    ["vintage", "1974 Topps Mike Schmidt Rookie", 640, "Shared rookie card, solid corners for the grade."],
    ["pokemon", "Hidden Fates Shiny Charizard GX", 260, "Fan-favorite shiny vault chase card."],
    ["modern", "2020 Contenders Justin Herbert Rookie Ticket Auto", 480, "On-card rookie ticket autograph."],
  ]),
];

export function getVendorById(vendorId: string): VendorProfile | undefined {
  return VENDORS.find((vendor) => vendor.id === vendorId);
}

export function getItemsByVendor(vendorId: string): InventoryItem[] {
  return INVENTORY_ITEMS.filter((item) => item.vendorId === vendorId);
}

export function getItemById(itemId: string): InventoryItem | undefined {
  return INVENTORY_ITEMS.find((item) => item.id === itemId);
}

// Real (but unrelated) card photos standing in for actual per-listing
// photography, which doesn't exist yet. The mapping is deterministic per
// item id rather than re-randomized on every render, so a given item
// always shows the same photo instead of flickering between re-renders.
const EXAMPLE_CARD_IMAGES = [
  "/example-cards/card-1.webp",
  "/example-cards/card-2.webp",
  "/example-cards/card-3.avif",
  "/example-cards/card-4.webp",
  "/example-cards/card-5.webp",
  "/example-cards/card-6.jpeg",
  "/example-cards/card-7.jpeg",
  "/example-cards/card-8.jpeg",
  "/example-cards/card-9.jpeg",
  "/example-cards/card-10.jpeg",
  "/example-cards/card-11.jpeg",
  "/example-cards/card-12.jpeg",
  "/example-cards/card-13.jpeg",
  "/example-cards/card-14.jpeg",
  "/example-cards/card-15.jpeg",
  "/example-cards/card-16.jpeg",
  "/example-cards/card-17.jpeg",
  "/example-cards/card-18.jpeg",
  "/example-cards/card-19.jpeg",
  "/example-cards/card-20.jpeg",
  "/example-cards/card-21.jpeg",
  "/example-cards/card-22.jpeg",
  "/example-cards/card-23.jpeg",
  "/example-cards/card-24.jpeg",
  "/example-cards/card-25.jpeg",
  "/example-cards/card-26.jpeg",
  "/example-cards/card-27.jpeg",
  "/example-cards/card-28.jpeg",
  "/example-cards/card-29.jpeg",
  "/example-cards/card-30.jpeg",
  "/example-cards/card-31.jpeg",
  "/example-cards/card-32.jpeg",
  "/example-cards/card-33.jpeg",
  "/example-cards/card-34.jpeg",
  "/example-cards/card-35.jpeg",
];

// Real (but unrelated) vendor booth/shop photos standing in for actual
// per-vendor photography. Same deterministic-per-id approach as the card
// images above.
const EXAMPLE_VENDOR_IMAGES = [
  "/vendor-examples/vendor-1.webp",
  "/vendor-examples/vendor-2.jpeg",
  "/vendor-examples/vendor-3.jpeg",
  "/vendor-examples/vendor-4.jpeg",
  "/vendor-examples/vendor-5.jpeg",
  "/vendor-examples/vendor-6.jpeg",
  "/vendor-examples/vendor-7.jpeg",
];

function stableIndex(id: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

export function getExampleCardImage(itemId: string): string {
  return EXAMPLE_CARD_IMAGES[stableIndex(itemId, EXAMPLE_CARD_IMAGES.length)];
}

export function getExampleVendorImage(vendorId: string): string {
  return EXAMPLE_VENDOR_IMAGES[stableIndex(vendorId, EXAMPLE_VENDOR_IMAGES.length)];
}

// A handful of available items spread across different vendors, for the
// homepage's "Recent Listings" section.
export function getRecentListings(count: number): InventoryItem[] {
  const perVendor = Math.max(1, Math.ceil(count / VENDORS.length));
  const picks = VENDORS.flatMap((vendor) =>
    getItemsByVendor(vendor.id)
      .filter((item) => item.status === "available")
      .slice(0, perVendor),
  );
  return picks.slice(0, count);
}

export const MESSAGES: Message[] = [
  {
    id: "msg-1",
    itemId: "diamond-dynasty-item-1",
    vendorId: "diamond-dynasty",
    fromName: "Diamond Dynasty Cards",
    preview: "Thanks for the interest! Yes, it's still available...",
    body:
      "Thanks for the interest! Yes, it's still available. Happy to send extra photos of the corners if that helps — just let me know.",
    timestamp: "2 hours ago",
  },
  {
    id: "msg-2",
    itemId: "poke-vault-item-1",
    vendorId: "poke-vault",
    fromName: "Poké Vault",
    preview: "We can hold it for you until the show this weekend...",
    body:
      "We can hold it for you until the show this weekend if you'd like to see it in person before buying. No pressure either way!",
    timestamp: "1 day ago",
  },
  {
    id: "msg-3",
    itemId: "rookie-rush-item-2",
    vendorId: "rookie-rush",
    fromName: "Rookie Rush Collectibles",
    preview: "Appreciate you reaching out — sending a couple more angles...",
    body:
      "Appreciate you reaching out — sending a couple more angles of the corners and edges now so you can see the full condition.",
    timestamp: "3 days ago",
  },
];

