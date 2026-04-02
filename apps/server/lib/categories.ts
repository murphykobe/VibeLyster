export const CANONICAL_CATEGORY_DEFINITIONS = [
  {
    key: "tops.t_shirt",
    group: "tops",
    label: "T-Shirt",
    aliases: ["tops.t_shirt", "t-shirt", "t shirts", "t shirt", "tee", "tees", "tshirt", "tops.t_shirts"],
    grailed: "tops.t_shirts",
    depop: { group: "clothing", productType: "t-shirts" },
  },
  {
    key: "tops.shirt",
    group: "tops",
    label: "Shirt",
    aliases: ["tops.shirt", "shirt", "button up", "button-up", "button down", "polo", "jersey"],
    grailed: "tops.shirts",
    depop: { group: "clothing", productType: "shirts" },
  },
  {
    key: "tops.hoodie",
    group: "tops",
    label: "Hoodie",
    aliases: ["tops.hoodie", "hoodie", "hooded sweatshirt", "sweatshirt", "crewneck"],
    grailed: "tops.sweatshirts_hoodies",
    depop: { group: "clothing", productType: "sweatshirts-hoodies" },
  },
  {
    key: "tops.sweater",
    group: "tops",
    label: "Sweater",
    aliases: ["tops.sweater", "sweater", "knitwear", "knit", "cardigan"],
    grailed: "tops.sweaters_knitwear",
    depop: { group: "clothing", productType: "knitwear" },
  },
  {
    key: "outerwear.jacket",
    group: "outerwear",
    label: "Jacket",
    aliases: ["outerwear.jacket", "jacket", "vest", "anorak", "windbreaker"],
    grailed: "tops.jackets",
    depop: { group: "clothing", productType: "coats-jackets" },
  },
  {
    key: "outerwear.coat",
    group: "outerwear",
    label: "Coat",
    aliases: ["outerwear.coat", "coat", "parka", "trench"],
    grailed: "tops.coats",
    depop: { group: "clothing", productType: "coats-jackets" },
  },
  {
    key: "bottoms.pants",
    group: "bottoms",
    label: "Pants",
    aliases: ["bottoms.pants", "pants", "trousers", "slacks", "chinos"],
    grailed: "bottoms.pants",
    depop: { group: "clothing", productType: "trousers" },
  },
  {
    key: "bottoms.jeans",
    group: "bottoms",
    label: "Jeans",
    aliases: ["bottoms.jeans", "jeans", "denim", "denim jeans"],
    grailed: "bottoms.denim",
    depop: { group: "clothing", productType: "jeans" },
  },
  {
    key: "bottoms.shorts",
    group: "bottoms",
    label: "Shorts",
    aliases: ["bottoms.shorts", "shorts"],
    grailed: "bottoms.shorts",
    depop: { group: "clothing", productType: "shorts" },
  },
  {
    key: "footwear.sneakers",
    group: "footwear",
    label: "Sneakers",
    aliases: ["footwear.sneakers", "sneakers", "trainers", "athletic shoes", "running shoes", "high top sneakers", "low top sneakers"],
    grailed: "footwear.sneakers",
    depop: { group: "shoes", productType: "trainers" },
  },
  {
    key: "footwear.boots",
    group: "footwear",
    label: "Boots",
    aliases: ["footwear.boots", "boots", "chelsea boots", "work boots"],
    grailed: "footwear.boots",
    depop: { group: "shoes", productType: "boots" },
  },
  {
    key: "footwear.shoes",
    group: "footwear",
    label: "Shoes",
    aliases: ["footwear.shoes", "shoes", "loafers", "derbies", "oxfords", "sandals", "heels", "flats"],
    grailed: "footwear.dress_shoes",
    depop: { group: "shoes", productType: "shoes" },
  },
  {
    key: "bags.bag",
    group: "bags",
    label: "Bag",
    aliases: ["bags.bag", "bag", "backpack", "tote", "duffel", "messenger", "satchel", "luggage"],
    grailed: "accessories.bags_luggage",
    depop: { group: "bags", productType: "bags" },
  },
  {
    key: "accessories.wallet",
    group: "accessories",
    label: "Wallet",
    aliases: ["accessories.wallet", "wallet", "cardholder", "passport holder", "coin purse"],
    grailed: "accessories.wallets",
    depop: { group: "accessories", productType: "wallet-purses" },
  },
  {
    key: "accessories.belt",
    group: "accessories",
    label: "Belt",
    aliases: ["accessories.belt", "belt"],
    grailed: "accessories.belts",
    depop: { group: "accessories", productType: "belts" },
  },
  {
    key: "accessories.hat",
    group: "accessories",
    label: "Hat",
    aliases: ["accessories.hat", "hat", "cap", "beanie"],
    grailed: "accessories.hats_scarves_gloves",
    depop: { group: "accessories", productType: "hats" },
  },
  {
    key: "accessories.watch",
    group: "accessories",
    label: "Watch",
    aliases: ["accessories.watch", "watch", "timepiece"],
    grailed: "accessories.watches",
    depop: { group: "accessories", productType: "watches" },
  },
  {
    key: "tailoring.suit",
    group: "tailoring",
    label: "Suit",
    aliases: ["tailoring.suit", "suit", "formal suit"],
    grailed: "tailoring.suits",
    depop: { group: "clothing", productType: "coats-jackets" },
  },
  {
    key: "tailoring.blazer",
    group: "tailoring",
    label: "Blazer",
    aliases: ["tailoring.blazer", "blazer", "sport coat", "sportcoat"],
    grailed: "tailoring.blazers_sportcoats",
    depop: { group: "clothing", productType: "coats-jackets" },
  },
  {
    key: "unsupported.other",
    group: "unsupported",
    label: "Unsupported",
    aliases: ["unsupported.other", "unsupported", "other", "car", "vehicle", "furniture", "electronics", "toy"],
    grailed: null,
    depop: null,
  },
] as const;

export type CanonicalCategory = typeof CANONICAL_CATEGORY_DEFINITIONS[number]["key"];
export type SupportedCanonicalCategory = Exclude<CanonicalCategory, "unsupported.other">;

type DepopCategory = { group: string; productType: string };

type CategoryDefinition = (typeof CANONICAL_CATEGORY_DEFINITIONS)[number];

const CATEGORY_BY_KEY = new Map<CanonicalCategory, CategoryDefinition>(
  CANONICAL_CATEGORY_DEFINITIONS.map((definition) => [definition.key, definition])
);

const CATEGORY_ALIAS_ENTRIES = CANONICAL_CATEGORY_DEFINITIONS.flatMap((definition) =>
  definition.aliases.map((alias) => ({ alias, key: definition.key }))
).sort((a, b) => b.alias.length - a.alias.length);

export const CANONICAL_CATEGORY_KEYS = CANONICAL_CATEGORY_DEFINITIONS.map(
  (definition) => definition.key
) as [CanonicalCategory, ...CanonicalCategory[]];

export function getCategoryDefinition(category: string | null | undefined) {
  if (!category) return null;
  return CATEGORY_BY_KEY.get(category as CanonicalCategory) ?? null;
}

export function normalizeCanonicalCategory(input: string | null | undefined): CanonicalCategory | null {
  if (!input) return null;

  const normalized = input.toLowerCase().trim();
  if (!normalized) return null;

  if (CATEGORY_BY_KEY.has(normalized as CanonicalCategory)) {
    return normalized as CanonicalCategory;
  }

  for (const { alias, key } of CATEGORY_ALIAS_ENTRIES) {
    if (normalized === alias) return key;
  }

  for (const { alias, key } of CATEGORY_ALIAS_ENTRIES) {
    if (normalized.includes(alias)) return key;
  }

  return null;
}

export function normalizeCategoryForStorage(input: string | null | undefined): CanonicalCategory {
  return normalizeCanonicalCategory(input) ?? "unsupported.other";
}

export function coerceCategoryForStorage(input: string | null | undefined):
  | { ok: true; category: CanonicalCategory | null | undefined }
  | { ok: false; error: string } {
  if (input === undefined) {
    return { ok: true, category: undefined };
  }

  if (input === null) {
    return { ok: true, category: null };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: true, category: null };
  }

  const canonical = normalizeCanonicalCategory(trimmed);
  if (!canonical) {
    return { ok: false, error: "Unsupported category. Choose a supported marketplace category." };
  }

  if (canonical === "unsupported.other" && trimmed.toLowerCase() !== "unsupported.other") {
    return { ok: false, error: "This item category is not supported for marketplace publishing yet." };
  }

  return { ok: true, category: canonical };
}

export function mapCanonicalCategoryToGrailed(category: string | null | undefined): string | null {
  const canonical = normalizeCanonicalCategory(category);
  if (!canonical) return null;
  return CATEGORY_BY_KEY.get(canonical)?.grailed ?? null;
}

export function mapCanonicalCategoryToDepop(category: string | null | undefined): DepopCategory | null {
  const canonical = normalizeCanonicalCategory(category);
  if (!canonical) return null;
  return CATEGORY_BY_KEY.get(canonical)?.depop ?? null;
}
