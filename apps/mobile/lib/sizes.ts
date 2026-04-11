const SIZE_SYSTEMS = {
  US_MENS_SHOE: ["5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "13", "14", "15"],
  US_WOMENS_SHOE: ["5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "12"],
  EU_SHOE: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48"],
  UK_SHOE: ["3", "3.5", "4", "4.5", "5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "12", "13"],
  CLOTHING_LETTER: ["XS", "S", "M", "L", "XL", "XXL", "3XL"],
  PANTS_WAIST: ["26", "27", "28", "29", "30", "31", "32", "33", "34", "36", "38", "40", "42"],
  EU_CLOTHING: ["44", "46", "48", "50", "52", "54", "56"],
  IT_CLOTHING: ["44", "46", "48", "50", "52", "54", "56"],
  US_CLOTHING: ["34", "36", "38", "40", "42", "44", "46"],
  JP_CLOTHING: ["1", "2", "3", "4", "5", "6"],
  ONE_SIZE: ["ONE SIZE"],
} as const;

const CATEGORY_SIZE_SYSTEMS = {
  footwear: ["US_MENS_SHOE", "US_WOMENS_SHOE", "EU_SHOE", "UK_SHOE"],
  tops: ["CLOTHING_LETTER"],
  outerwear: ["CLOTHING_LETTER"],
  tailoring: ["CLOTHING_LETTER"],
  bottoms: ["PANTS_WAIST", "CLOTHING_LETTER", "EU_CLOTHING"],
  accessories: ["ONE_SIZE", "CLOTHING_LETTER"],
  bags: ["ONE_SIZE", "CLOTHING_LETTER"],
} as const;

const TOP_CATEGORY_GROUPS = new Set(["tops", "outerwear", "tailoring"]);
const EU_TO_TOP_SIZE: Record<string, string> = {
  "44": "XS",
  "46": "S",
  "48": "M",
  "50": "L",
  "52": "XL",
  "54": "XXL",
  "56": "3XL",
};

const US_TO_TOP_SIZE: Record<string, string> = {
  "34": "XS",
  "36": "S",
  "38": "M",
  "40": "L",
  "42": "XL",
  "44": "XXL",
  "46": "3XL",
};

const JP_TO_TOP_SIZE: Record<string, string> = {
  "1": "S",
  "2": "M",
  "3": "L",
  "4": "XL",
  "5": "XXL",
  "6": "3XL",
};

export const ALL_SIZE_SYSTEMS = SIZE_SYSTEMS;

export type SizeSystem = keyof typeof SIZE_SYSTEMS;
export type StructuredSize = { system: SizeSystem; value: string };
type SizeLike = StructuredSize | { system: string; value: string };

export function getCategoryGroupKey(categoryKey: string | null | undefined) {
  return categoryKey?.split(".")[0] ?? null;
}

export function isTopCategory(categoryKey: string | null | undefined) {
  const groupKey = getCategoryGroupKey(categoryKey);
  return groupKey ? TOP_CATEGORY_GROUPS.has(groupKey) : false;
}

export function translateApparelSizeToTopSize(system: string, value: string): string | null {
  const normalizedSystem = system.trim().toUpperCase();
  const normalizedValue = value.trim().toUpperCase();
  if (!normalizedSystem || !normalizedValue) return null;
  if (normalizedSystem === "CLOTHING_LETTER") return normalizedValue;
  if (normalizedSystem === "EU_CLOTHING" || normalizedSystem === "IT_CLOTHING") {
    return EU_TO_TOP_SIZE[normalizedValue] ?? null;
  }
  if (normalizedSystem === "US_CLOTHING") {
    return US_TO_TOP_SIZE[normalizedValue] ?? null;
  }
  if (normalizedSystem === "JP_CLOTHING") {
    return JP_TO_TOP_SIZE[normalizedValue] ?? null;
  }
  return null;
}

export function getSizeSystemsForCategory(categoryKey: string | null | undefined): SizeSystem[] {
  const groupKey = getCategoryGroupKey(categoryKey) as keyof typeof CATEGORY_SIZE_SYSTEMS | null;
  return groupKey ? [...CATEGORY_SIZE_SYSTEMS[groupKey]] : [];
}

export function getValuesForSystem(system: SizeSystem) {
  return [...SIZE_SYSTEMS[system]] as string[];
}

export function parseStructuredSize(size: unknown): StructuredSize | null {
  if (!size) return null;

  if (typeof size === "object") {
    const candidate = size as Partial<StructuredSize>;
    if (typeof candidate.system === "string" && candidate.system in SIZE_SYSTEMS && typeof candidate.value === "string") {
      const value = candidate.value.trim();
      if (!value) return null;
      return { system: candidate.system as SizeSystem, value };
    }
    return null;
  }

  if (typeof size !== "string") return null;
  try {
    return parseStructuredSize(JSON.parse(size));
  } catch {
    return null;
  }
}

export function toDisplaySize(size: SizeLike | string | null | undefined): string | null {
  if (!size) return null;
  if (typeof size === "string") {
    const normalized = size.trim();
    return normalized || null;
  }
  if (size.system === "ONE_SIZE") return "one size";
  const normalized = size.value.trim();
  return normalized || null;
}

export function getSizeFieldLabel(categoryKey: string | null | undefined): string {
  const groupKey = getCategoryGroupKey(categoryKey);
  if (groupKey && TOP_CATEGORY_GROUPS.has(groupKey)) return "Top Size";
  if (groupKey === "bottoms") return "Bottom Size";
  return "Size";
}

export function getSizeSystemLabel(system: SizeSystem, categoryKey: string | null | undefined): string {
  const groupKey = getCategoryGroupKey(categoryKey);
  if (system === "CLOTHING_LETTER") {
    return groupKey && TOP_CATEGORY_GROUPS.has(groupKey) ? "Top Size" : "Size";
  }
  if (system === "PANTS_WAIST") return "Bottom Size";
  if (system === "ONE_SIZE") return "Size";
  if (system === "US_MENS_SHOE") return "US Men's";
  if (system === "US_WOMENS_SHOE") return "US Women's";
  if (system === "EU_SHOE") return "EU";
  if (system === "UK_SHOE") return "UK";
  return system.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getTraitLabel(key: string): string {
  return key.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
