import GRAILED_DRAFT_CATEGORY_MAP from "../lib/marketplace/grailed-draft-category-map.json" with { type: "json" };

function makeDraftPhoto(url, position) {
  return {
    url,
    width: 1080,
    height: 1080,
    rotate: 0,
    position,
  };
}

export function mapGrailedDraftCategory(category) {
  return GRAILED_DRAFT_CATEGORY_MAP[category ?? ""] ?? null;
}

export function buildGrailedDraftPayload({
  listing,
  designer,
  department = "menswear",
  uploadedPhotoUrls,
}) {
  const categoryPath = mapGrailedDraftCategory(listing.category);
  if (!categoryPath) {
    throw new Error(`Unsupported Grailed draft category: ${listing.category ?? "(missing)"}`);
  }

  if (!designer?.id || !designer?.name || !designer?.slug) {
    throw new Error("Grailed draft payload requires a designer with id, name, and slug.");
  }

  if (!Array.isArray(uploadedPhotoUrls) || uploadedPhotoUrls.length === 0) {
    throw new Error("Grailed draft payload requires at least one uploaded photo URL.");
  }

  return {
    title: listing.title,
    description: listing.description,
    price: Number(listing.price),
    category_path: categoryPath,
    designers: [designer],
    condition:
      listing.condition === "new"
        ? "is_new"
        : listing.condition === "used"
          ? "is_used"
          : listing.condition === "heavily_used"
            ? "is_worn"
            : "is_gently_used",
    traits: [
      ...(listing.traits?.color ? [{ name: "color", value: String(listing.traits.color) }] : []),
      ...(listing.traits?.country_of_origin
        ? [{ name: "country_of_origin", value: String(listing.traits.country_of_origin) }]
        : []),
    ],
    size: listing.size ?? "one size",
    department,
    make_offer: true,
    buy_now: true,
    photos: uploadedPhotoUrls.map((url, index) => makeDraftPhoto(url, index)),
    shipping: {
      us: { amount: 15, enabled: true },
      ca: { amount: 0, enabled: false },
      uk: { amount: 0, enabled: false },
      eu: { amount: 0, enabled: false },
      asia: { amount: 0, enabled: false },
      au: { amount: 0, enabled: false },
      other: { amount: 0, enabled: false },
    },
  };
}
