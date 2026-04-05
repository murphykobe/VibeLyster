import { normalizeCategoryForStorage } from "@/lib/categories";
import type { CanonicalListing, EbayListingMetadata } from "./types";

type AspectMap = Record<string, string[]>;

type CategoryRule = {
  ebayCategoryId: string;
  requiredAspects: string[];
};

const CATEGORY_RULES: Record<string, CategoryRule> = {
  "tops.t_shirt": { ebayCategoryId: "15687", requiredAspects: ["Brand", "Department", "Size Type", "Size"] },
  "tops.shirt": { ebayCategoryId: "57990", requiredAspects: ["Brand", "Department", "Size Type", "Size"] },
  "tops.hoodie": { ebayCategoryId: "155183", requiredAspects: ["Brand", "Department", "Size Type", "Size"] },
  "tops.sweater": { ebayCategoryId: "11484", requiredAspects: ["Brand", "Department", "Size Type", "Size"] },
  "outerwear.jacket": { ebayCategoryId: "57988", requiredAspects: ["Brand", "Department", "Size Type", "Size"] },
  "outerwear.coat": { ebayCategoryId: "63862", requiredAspects: ["Brand", "Department", "Size Type", "Size"] },
  "bottoms.pants": { ebayCategoryId: "57989", requiredAspects: ["Brand", "Department", "Size Type", "Size"] },
  "bottoms.jeans": { ebayCategoryId: "11483", requiredAspects: ["Brand", "Department", "Size Type", "Size"] },
  "bottoms.shorts": { ebayCategoryId: "15689", requiredAspects: ["Brand", "Department", "Size Type", "Size"] },
  "footwear.sneakers": { ebayCategoryId: "15709", requiredAspects: ["Brand", "Department", "US Shoe Size", "Material"] },
  "footwear.boots": { ebayCategoryId: "53557", requiredAspects: ["Brand", "Department", "US Shoe Size", "Material"] },
  "footwear.shoes": { ebayCategoryId: "53120", requiredAspects: ["Brand", "Department", "US Shoe Size", "Material"] },
  "bags.bag": { ebayCategoryId: "169291", requiredAspects: ["Brand", "Department"] },
  "accessories.wallet": { ebayCategoryId: "2996", requiredAspects: ["Brand", "Department"] },
  "accessories.belt": { ebayCategoryId: "2993", requiredAspects: ["Brand", "Department", "Size"] },
  "accessories.hat": { ebayCategoryId: "29960", requiredAspects: ["Brand", "Department", "Size"] },
  "accessories.watch": { ebayCategoryId: "31387", requiredAspects: ["Brand", "Department"] },
  "tailoring.suit": { ebayCategoryId: "3001", requiredAspects: ["Brand", "Department", "Size Type", "Size"] },
  "tailoring.blazer": { ebayCategoryId: "3002", requiredAspects: ["Brand", "Department", "Size Type", "Size"] },
};

const CONDITION_MAP: Record<string, number> = {
  new: 1000,
  gently_used: 3000,
  used: 3000,
  heavily_used: 7000,
};

function uniqueValues(...values: Array<string | null | undefined>) {
  const set = new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)));
  return [...set];
}

function inferDepartment(listing: CanonicalListing) {
  const explicit = typeof listing.traits.department === "string" ? listing.traits.department.trim() : "";
  if (explicit) return explicit;

  const hints = [listing.title, listing.description].join(" ").toLowerCase();
  if (hints.includes("women") || hints.includes("womens") || hints.includes("female")) return "Women";
  if (hints.includes("kids") || hints.includes("youth") || hints.includes("boys") || hints.includes("girls")) return "Kids";
  return undefined;
}

export async function buildEbayListingMetadata({
  listing,
  existing,
  generateFallback,
}: {
  listing: CanonicalListing;
  existing?: EbayListingMetadata;
  generateFallback: (input: { listing: CanonicalListing; missingAspects: string[] }) => Promise<AspectMap>;
}): Promise<{ metadata: EbayListingMetadata }> {
  const categoryKey = normalizeCategoryForStorage(listing.category);
  const categoryRule = CATEGORY_RULES[categoryKey];

  const deterministicAspects: AspectMap = {
    ...(listing.brand ? { Brand: [listing.brand] } : {}),
    ...(listing.size ? { Size: [listing.size], "US Shoe Size": [listing.size], "Size Type": ["Regular"] } : {}),
    ...(listing.traits.color ? { Color: [String(listing.traits.color)] } : {}),
    ...(listing.traits.material ? { Material: [String(listing.traits.material)] } : {}),
    ...(inferDepartment(listing) ? { Department: [inferDepartment(listing) as string] } : {}),
  };

  const metadata: EbayListingMetadata = {
    ...existing,
    ebayCategoryId: existing?.ebayCategoryId ?? categoryRule?.ebayCategoryId,
    ebayConditionId: existing?.ebayConditionId ?? CONDITION_MAP[listing.condition ?? ""],
    ebayListingFormat: existing?.ebayListingFormat ?? "FIXED_PRICE",
    ebayAspects: { ...(existing?.ebayAspects ?? {}) },
    metadataSources: { ...(existing?.metadataSources ?? {}) },
  };

  for (const [key, values] of Object.entries(deterministicAspects)) {
    if (!metadata.ebayAspects?.[key]?.length) {
      metadata.ebayAspects ??= {};
      metadata.ebayAspects[key] = uniqueValues(...values);
      metadata.metadataSources ??= {};
      metadata.metadataSources[key] = "deterministic";
    }
  }

  const missingAspects = (categoryRule?.requiredAspects ?? []).filter((key) => !metadata.ebayAspects?.[key]?.length);
  if (missingAspects.length > 0) {
    const generated = await generateFallback({ listing, missingAspects });
    for (const [key, values] of Object.entries(generated)) {
      if (!metadata.ebayAspects?.[key]?.length && values.length > 0) {
        metadata.ebayAspects ??= {};
        metadata.ebayAspects[key] = uniqueValues(...values);
        metadata.metadataSources ??= {};
        metadata.metadataSources[key] = "ai";
      }
    }
  }

  const finalMissingFields = [
    ...(metadata.ebayCategoryId ? [] : ["ebayCategoryId"]),
    ...(metadata.ebayConditionId ? [] : ["ebayConditionId"]),
    ...(categoryRule?.requiredAspects ?? []).filter((key) => !metadata.ebayAspects?.[key]?.length),
  ];

  metadata.validationStatus = finalMissingFields.length === 0 ? "valid" : "incomplete";
  metadata.missingFields = finalMissingFields;

  return { metadata };
}
