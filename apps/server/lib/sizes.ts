const SIZE_SYSTEMS = {
  US_MENS_SHOE: ["5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "13", "14", "15"],
  US_WOMENS_SHOE: ["5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "12"],
  EU_SHOE: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48"],
  UK_SHOE: ["3", "3.5", "4", "4.5", "5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "12", "13"],
  CLOTHING_LETTER: ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"],
  PANTS_WAIST: ["26", "27", "28", "29", "30", "31", "32", "33", "34", "36", "38", "40", "42"],
  EU_CLOTHING: ["44", "46", "48", "50", "52", "54", "56"],
  IT_CLOTHING: ["44", "46", "48", "50", "52", "54", "56"],
  ONE_SIZE: ["ONE SIZE"],
} as const;

const CATEGORY_SIZE_SYSTEMS = {
  footwear: ["US_MENS_SHOE", "US_WOMENS_SHOE", "EU_SHOE", "UK_SHOE"],
  tops: ["CLOTHING_LETTER", "EU_CLOTHING", "IT_CLOTHING"],
  outerwear: ["CLOTHING_LETTER", "EU_CLOTHING", "IT_CLOTHING"],
  tailoring: ["CLOTHING_LETTER", "EU_CLOTHING", "IT_CLOTHING"],
  bottoms: ["PANTS_WAIST", "CLOTHING_LETTER", "EU_CLOTHING"],
  accessories: ["ONE_SIZE", "CLOTHING_LETTER"],
  bags: ["ONE_SIZE", "CLOTHING_LETTER"],
} as const;

export const ALL_SIZE_SYSTEMS = SIZE_SYSTEMS;

export type SizeSystem = keyof typeof SIZE_SYSTEMS;
export type StructuredSize = { system: SizeSystem; value: string };
type SizeLike = StructuredSize | { system: string; value: string };

export function getSizeSystemsForCategory(categoryKey: string | null | undefined): SizeSystem[] {
  const groupKey = categoryKey?.split(".")[0] as keyof typeof CATEGORY_SIZE_SYSTEMS | undefined;
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

export function getDisplaySizeValue(size: SizeLike | string | null | undefined) {
  if (!size) return null;
  if (typeof size !== "string") return size.value;

  try {
    const parsed = JSON.parse(size) as unknown;
    if (parsed && typeof parsed === "object" && "value" in parsed) {
      const value = parsed.value;
      return typeof value === "string" ? value : null;
    }
  } catch {
    return size;
  }

  return size;
}
