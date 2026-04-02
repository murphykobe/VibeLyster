export const CATEGORY_GROUPS = [
  {
    key: "tops",
    label: "Tops",
    options: [
      { key: "tops.t_shirt", label: "T-Shirt" },
      { key: "tops.shirt", label: "Shirt" },
      { key: "tops.hoodie", label: "Hoodie" },
      { key: "tops.sweater", label: "Sweater" },
    ],
  },
  {
    key: "outerwear",
    label: "Outerwear",
    options: [
      { key: "outerwear.jacket", label: "Jacket" },
      { key: "outerwear.coat", label: "Coat" },
    ],
  },
  {
    key: "bottoms",
    label: "Bottoms",
    options: [
      { key: "bottoms.pants", label: "Pants" },
      { key: "bottoms.jeans", label: "Jeans" },
      { key: "bottoms.shorts", label: "Shorts" },
    ],
  },
  {
    key: "footwear",
    label: "Footwear",
    options: [
      { key: "footwear.sneakers", label: "Sneakers" },
      { key: "footwear.boots", label: "Boots" },
      { key: "footwear.shoes", label: "Shoes" },
    ],
  },
  {
    key: "bags",
    label: "Bags",
    options: [
      { key: "bags.bag", label: "Bag" },
    ],
  },
  {
    key: "accessories",
    label: "Accessories",
    options: [
      { key: "accessories.wallet", label: "Wallet" },
      { key: "accessories.belt", label: "Belt" },
      { key: "accessories.hat", label: "Hat" },
      { key: "accessories.watch", label: "Watch" },
    ],
  },
  {
    key: "tailoring",
    label: "Tailoring",
    options: [
      { key: "tailoring.suit", label: "Suit" },
      { key: "tailoring.blazer", label: "Blazer" },
    ],
  },
  {
    key: "unsupported",
    label: "Unsupported",
    options: [
      { key: "unsupported.other", label: "Unsupported Item" },
    ],
  },
] as const;

export type CategoryGroupKey = typeof CATEGORY_GROUPS[number]["key"];
export type CanonicalCategoryKey = typeof CATEGORY_GROUPS[number]["options"][number]["key"];

export const CATEGORY_OPTIONS = CATEGORY_GROUPS.flatMap((group) =>
  group.options.map((option) => ({ ...option, group: group.key, groupLabel: group.label }))
);

export function getCategoryOption(key: string | null | undefined) {
  if (!key) return null;
  return CATEGORY_OPTIONS.find((option) => option.key === key) ?? null;
}
