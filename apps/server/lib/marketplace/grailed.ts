/**
 * Grailed marketplace posting module.
 * Ported from tools/grailed/grailed-api.js with TypeScript + Vercel Blob URL support.
 *
 * Auth: CSRF token + session cookies (WebView capture)
 * Photos: Blob URLs are uploaded to Grailed S3 via presign flow
 */

import type {
  CanonicalListing,
  GrailedTokens,
  PublishResult,
  DelistResult,
  StatusResult,
  ConnectionProbeResult,
  PublishOptions,
} from "./types";
import { mapCanonicalCategoryToGrailed } from "../categories";
import { getCategoryGroupKey, getSizeSystemsForCategory, type SizeSystem, type StructuredSize } from "../sizes";
import GRAILED_DRAFT_CATEGORY_MAP from "./grailed-draft-category-map.json";
import {
  attachMarketplaceDebugData,
  createMarketplaceDebugData,
  debugPlatformData,
  recordMarketplaceRequest,
} from "./debug";

const GRAILED_DRAFT_CATEGORY_LOOKUP = GRAILED_DRAFT_CATEGORY_MAP as Record<string, string>;

const GRAILED_API = "https://www.grailed.com/api";
const GRAILED_S3 = "https://grailed-media.s3.amazonaws.com/";
const ALGOLIA_URL = "https://mnrwefss2q-dsn.algolia.net/1/indexes/Designer_production/query";
const ALGOLIA_PARAMS =
  "x-algolia-agent=Algolia&x-algolia-application-id=MNRWEFSS2Q&x-algolia-api-key=bc9ee1c014521ccf312525a4ef324a16";

export function mapCategory(category: string | null): string {
  return mapCanonicalCategoryToGrailed(category) ?? "tops.t_shirts";
}

function isRetryableGrailedError(err: unknown) {
  if (err instanceof GrailedPublishStepError) {
    return err.statusCode !== undefined ? err.statusCode >= 500 || err.statusCode === 429 : true;
  }
  if (err instanceof GrailedError) {
    return err.statusCode >= 500 || err.statusCode === 429;
  }
  return true;
}

// ─── Condition mapping ────────────────────────────────────────────────────────

const CONDITION_MAP: Record<string, string> = {
  "new": "is_new",
  "brand_new": "is_new",
  "nwt": "is_new",
  "gently_used": "is_gently_used",
  "used": "is_used",
  "heavily_used": "is_heavily_used",
};

const GRAILED_ALLOWED_COLORS = [
  "black",
  "white",
  "blue",
  "red",
  "green",
  "silver",
  "gold",
  "brown",
  "grey",
  "navy",
  "orange",
  "pink",
  "purple",
  "yellow",
  "multi",
  "cream",
] as const;

const GRAILED_LETTER_SIZES = ["xxs", "xs", "s", "m", "l", "xl", "xxl"] as const;
const GRAILED_LETTER_SIZE_SET = new Set<string>(GRAILED_LETTER_SIZES);
const GRAILED_ONE_SIZE_ALIASES = new Set(["one size", "one-size", "onesize", "os"]);
const GRAILED_COUNTRY_CODES = [
  "AF", "AL", "DZ", "AD", "AO", "AG", "AR", "AM", "AU", "AT", "AZ", "BS", "BH", "BD", "BB", "BY", "BE", "BZ", "BJ", "BT",
  "BO", "BA", "BW", "BR", "BN", "BG", "BF", "BI", "CV", "KH", "CM", "CA", "CF", "TD", "CL", "CN", "CO", "KM", "CG", "CR",
  "CI", "HR", "CU", "CY", "CZ", "CD", "DK", "DJ", "DM", "DO", "EC", "EG", "SV", "GQ", "ER", "EE", "SZ", "ET", "FJ", "FI",
  "FR", "GA", "GM", "GE", "DE", "GH", "GR", "GD", "GT", "GN", "GW", "GY", "HT", "HN", "HU", "IS", "IN", "ID", "IR", "IQ",
  "IE", "IL", "IT", "JM", "JP", "JO", "KZ", "KE", "KI", "KW", "KG", "LA", "LV", "LB", "LS", "LR", "LY", "LI", "LT", "LU",
  "MG", "MW", "MY", "MV", "ML", "MT", "MH", "MR", "MU", "MX", "FM", "MD", "MC", "MN", "ME", "MA", "MZ", "MM", "NA", "NR",
  "NP", "NL", "NZ", "NI", "NE", "NG", "KP", "MK", "NO", "OM", "PK", "PW", "PS", "PA", "PG", "PY", "PE", "PH", "PL", "PT",
  "QA", "RO", "RU", "RW", "KN", "LC", "VC", "WS", "SM", "ST", "SA", "SN", "RS", "SC", "SL", "SG", "SK", "SI", "SB", "SO",
  "ZA", "KR", "SS", "ES", "LK", "SD", "SR", "SE", "CH", "SY", "TW", "TJ", "TZ", "TH", "TL", "TG", "TO", "TT", "TN", "TR",
  "TM", "TV", "UG", "UA", "AE", "GB", "US", "UY", "UZ", "VU", "VA", "VE", "VN", "YE", "ZM", "ZW",
] as const;
const GRAILED_COUNTRY_CODE_SET = new Set<string>(GRAILED_COUNTRY_CODES);
const GRAILED_COUNTRY_ALIASES: Record<string, string> = {
  usa: "US",
  "united states of america": "US",
  uk: "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "ivory coast": "CI",
  czechia: "CZ",
  "south korea": "KR",
  "republic of korea": "KR",
  "north korea": "KP",
  uae: "AE",
};

const COLOR_ALIASES: Record<string, typeof GRAILED_ALLOWED_COLORS[number]> = {
  gray: "grey",
  grey: "grey",
  multicolor: "multi",
  "multi-color": "multi",
  colourful: "multi",
  colorful: "multi",
  offwhite: "cream",
  "off-white": "cream",
  ivory: "cream",
  beige: "cream",
  tan: "cream",
  khaki: "cream",
};

type GrailedTrait = { name: "color" | "country_of_origin"; value: string };
type GrailedDesigner = { id?: number; name: string; slug?: string };
type CanonicalListingWithStructuredSize = CanonicalListing & { structuredSize?: StructuredSize | null };

export function mapCondition(condition: string | null): string {
  if (!condition) return "is_gently_used";
  const lower = condition.toLowerCase().replace(/\s+/g, "_");
  return CONDITION_MAP[lower] ?? "is_gently_used";
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function makeHeaders(csrfToken: string, cookies: string) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "accept-version": "v1",
    "x-csrf-token": csrfToken,
    Cookie: cookies,
  };
}

async function apiFetch(url: string, options: RequestInit = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    let detail: unknown;
    try { detail = JSON.parse(text); } catch { detail = text; }
    throw new GrailedError(res.status, JSON.stringify(detail));
  }
  return res.json() as Promise<Record<string, unknown>>;
}

class GrailedError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(`Grailed API error ${statusCode}: ${message}`);
    this.name = "GrailedError";
  }
}

class GrailedPublishStepError extends Error {
  constructor(
    public readonly step: string,
    message: string,
    public readonly statusCode?: number,
  ) {
    super(`Grailed publish failed while ${step}: ${message}`);
    this.name = "GrailedPublishStepError";
  }
}

async function runGrailedPublishStep<T>(step: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof GrailedError) {
      throw new GrailedPublishStepError(step, err.message, err.statusCode);
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new GrailedPublishStepError(step, message);
  }
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeGrailedColor(value: string | null | undefined) {
  const raw = pickString(value);
  if (!raw) return null;

  const lower = raw.toLowerCase().trim();
  const normalized = COLOR_ALIASES[lower] ?? lower;
  if ((GRAILED_ALLOWED_COLORS as readonly string[]).includes(normalized)) {
    return normalized;
  }

  return null;
}

function inferGrailedColor(...sources: Array<string | null | undefined>) {
  const haystack = sources.filter(Boolean).join(" ").toLowerCase();
  if (!haystack) return null;

  for (const color of GRAILED_ALLOWED_COLORS) {
    if (haystack.includes(color)) return color;
  }

  for (const [alias, canonical] of Object.entries(COLOR_ALIASES)) {
    if (haystack.includes(alias)) return canonical;
  }

  return null;
}

function normalizeCountryLookupKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const GRAILED_COUNTRY_LOOKUP = (() => {
  const displayNames = typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

  const lookup = new Map<string, string>();
  for (const code of GRAILED_COUNTRY_CODES) {
    lookup.set(code.toLowerCase(), code);
    const displayName = displayNames?.of(code);
    if (displayName && displayName !== code) {
      lookup.set(normalizeCountryLookupKey(displayName), code);
    }
  }

  for (const [alias, code] of Object.entries(GRAILED_COUNTRY_ALIASES)) {
    lookup.set(normalizeCountryLookupKey(alias), code);
  }

  return lookup;
})();

function normalizeGrailedCountryOfOrigin(value: string | null | undefined) {
  const raw = pickString(value);
  if (!raw) return null;

  const maybeCode = raw.toUpperCase();
  if (GRAILED_COUNTRY_CODE_SET.has(maybeCode as typeof GRAILED_COUNTRY_CODES[number])) {
    return maybeCode;
  }

  return GRAILED_COUNTRY_LOOKUP.get(normalizeCountryLookupKey(raw)) ?? null;
}

function normalizeGrailedLetterSize(value: string) {
  const normalized = value.trim().toLowerCase();
  return GRAILED_LETTER_SIZE_SET.has(normalized) ? normalized : null;
}

function normalizeGrailedOneSize(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return GRAILED_ONE_SIZE_ALIASES.has(normalized) ? "one size" : null;
}

function getGrailedCategoryLabel(category: string | null) {
  return getCategoryGroupKey(category) ?? (category?.trim() || "this category");
}

function formatStructuredSize(size: StructuredSize) {
  return `${size.system} ${size.value}`;
}

function validateStructuredSizeForCategory(category: string | null, size: StructuredSize) {
  const allowedSystems = getSizeSystemsForCategory(category);
  if (allowedSystems.length === 0) return { ok: true as const };

  if (allowedSystems.includes(size.system)) {
    return { ok: true as const };
  }

  return {
    ok: false as const,
    error: `Grailed size is invalid for ${getGrailedCategoryLabel(category)}. Current listing size uses ${formatStructuredSize(size)}, which cannot be published to this category.`,
  };
}

function normalizeGrailedStructuredSize(category: string | null, size: StructuredSize) {
  const compatibility = validateStructuredSizeForCategory(category, size);
  if (!compatibility.ok) return compatibility;

  if (size.system === "CLOTHING_LETTER") {
    const normalized = normalizeGrailedLetterSize(size.value);
    if (!normalized) {
      return {
        ok: false as const,
        error: `Grailed size is invalid for ${getGrailedCategoryLabel(category)}. Expected one of: ${GRAILED_LETTER_SIZES.join(", ")}. Current listing size: ${formatStructuredSize(size)}.`,
      };
    }
    return { ok: true as const, size: normalized };
  }

  if (size.system === "ONE_SIZE") {
    const normalized = normalizeGrailedOneSize(size.value);
    if (!normalized) {
      return {
        ok: false as const,
        error: `Grailed size is invalid for ${getGrailedCategoryLabel(category)}. Use ONE SIZE for one-size items. Current listing size: ${formatStructuredSize(size)}.`,
      };
    }
    return { ok: true as const, size: normalized };
  }

  const rawValue = pickString(size.value);
  if (!rawValue) {
    return {
      ok: false as const,
      error: `Grailed size is invalid for ${getGrailedCategoryLabel(category)}. Current listing size: ${formatStructuredSize(size)}.`,
    };
  }

  return { ok: true as const, size: rawValue };
}

function normalizeGrailedLegacySize(category: string | null, size: string | null) {
  const rawSize = pickString(size);
  if (!rawSize) {
    return {
      ok: false as const,
      error: `Grailed size is required before publish. Add a valid size for ${getGrailedCategoryLabel(category)}.`,
    };
  }

  const oneSize = normalizeGrailedOneSize(rawSize);
  if (oneSize) return { ok: true as const, size: oneSize };

  const letterSize = normalizeGrailedLetterSize(rawSize);
  if (letterSize) return { ok: true as const, size: letterSize };

  const groupKey = getCategoryGroupKey(category);
  if (groupKey === "tops" || groupKey === "outerwear" || groupKey === "tailoring") {
    return {
      ok: false as const,
      error: `Grailed size is invalid for ${groupKey}. Expected one of: ${GRAILED_LETTER_SIZES.join(", ")}. Current listing size: ${rawSize}.`,
    };
  }

  return { ok: true as const, size: rawSize };
}

function normalizeGrailedSize(listing: CanonicalListing) {
  const structuredSize = (listing as CanonicalListingWithStructuredSize).structuredSize;
  if (structuredSize?.system && structuredSize.value) {
    return normalizeGrailedStructuredSize(listing.category, {
      system: structuredSize.system.trim().toUpperCase() as SizeSystem,
      value: structuredSize.value,
    });
  }

  return normalizeGrailedLegacySize(listing.category, listing.size);
}

export function normalizeGrailedTraits(listing: CanonicalListing):
  | { ok: true; traits: GrailedTrait[] }
  | { ok: false; error: string } {
  const rawTraits = listing.traits ?? {};
  const color = normalizeGrailedColor(rawTraits.color) ?? inferGrailedColor(
    rawTraits.color,
    listing.title,
    listing.description,
    listing.category,
  );

  if (!color) {
    return {
      ok: false,
      error: "Grailed requires a color trait before publish. Add traits.color in the listing details.",
    };
  }

  const traits: GrailedTrait[] = [{ name: "color", value: color }];
  const rawCountryOfOrigin = pickString(rawTraits.country_of_origin);
  if (rawCountryOfOrigin) {
    const countryOfOrigin = normalizeGrailedCountryOfOrigin(rawCountryOfOrigin);
    if (!countryOfOrigin) {
      return {
        ok: false,
        error: `Grailed country of origin is invalid. Use a supported country name or ISO country code. Current value: ${rawCountryOfOrigin}.`,
      };
    }
    traits.push({ name: "country_of_origin", value: countryOfOrigin });
  }

  return { ok: true, traits };
}

// ─── Image upload ─────────────────────────────────────────────────────────────

/**
 * Uploads a photo from a Vercel Blob URL to Grailed S3.
 * Returns the Grailed image_url for use in listing photos array.
 */
async function uploadPhotoFromUrl(
  blobUrl: string,
  csrfToken: string,
  cookies: string
): Promise<string> {
  // Step 1: Get presigned URL
  const presign = await apiFetch(`${GRAILED_API}/photos/presign/listing`, {
    headers: makeHeaders(csrfToken, cookies),
  });
  const { fields, url: s3Url, image_url: imageUrl } = (presign as { data: { fields: Record<string, string>; url: string; image_url: string } }).data;

  // Step 2: Fetch the photo from Vercel Blob
  const photoRes = await fetch(blobUrl);
  if (!photoRes.ok) throw new Error(`Failed to fetch photo from Blob: ${blobUrl}`);
  const photoBuffer = await photoRes.arrayBuffer();
  const blob = new Blob([photoBuffer], { type: "image/jpeg" });

  // Step 3: Upload to S3
  const form = new FormData();
  for (const [key, val] of Object.entries(fields)) {
    form.append(key, val);
  }
  form.append("Content-Type", "image/jpeg");
  form.append("file", blob, "photo.jpg");

  const s3Res = await fetch(s3Url ?? GRAILED_S3, {
    method: "POST",
    body: form,
    headers: {
      accept: "*/*",
      origin: "https://www.grailed.com",
      referer: "https://www.grailed.com",
    },
  });

  if (!s3Res.ok && s3Res.status !== 204) {
    const text = await s3Res.text();
    throw new Error(`Grailed S3 upload failed ${s3Res.status}: ${text}`);
  }

  return imageUrl;
}

async function uploadPhotos(
  photoUrls: string[],
  csrfToken: string,
  cookies: string
): Promise<string[]> {
  const uploadedPhotoUrls: string[] = [];
  for (const [i, url] of photoUrls.slice(0, 8).entries()) {
    const imageUrl = await runGrailedPublishStep(
      `uploading photo ${i + 1}`,
      () => uploadPhotoFromUrl(url, csrfToken, cookies)
    );
    uploadedPhotoUrls.push(imageUrl);
  }
  return uploadedPhotoUrls;
}

// ─── User info ────────────────────────────────────────────────────────────────

async function getMe(csrfToken: string, cookies: string) {
  return apiFetch(`${GRAILED_API}/users/me`, { headers: makeHeaders(csrfToken, cookies) });
}

async function getAddresses(userId: number | string, csrfToken: string, cookies: string) {
  return apiFetch(`${GRAILED_API}/users/${userId}/postal_addresses`, {
    headers: makeHeaders(csrfToken, cookies),
  });
}

async function searchBrand(query: string, department = "menswear"): Promise<GrailedDesigner[] | null> {
  const res = await fetch(`${ALGOLIA_URL}?${ALGOLIA_PARAMS}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: JSON.stringify({
      params: `query=${encodeURIComponent(query)}&page=0&hitsPerPage=5&filters=departments:${department}`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Grailed brand search failed ${res.status}`);
  }

  const data = await res.json() as { hits?: Array<{ id: number; name: string; slug: string }> };
  if (!data.hits?.length) return null;
  return data.hits.map((hit) => ({ id: hit.id, name: hit.name, slug: hit.slug }));
}

async function resolveDesigners(brand: string | null | undefined): Promise<GrailedDesigner[]> {
  if (!brand) return [];
  try {
    const matches = await searchBrand(brand, "menswear");
    const match = matches?.[0];
    return match ? [match] : [{ name: brand }];
  } catch {
    return [{ name: brand }];
  }
}

function mapDraftCondition(condition: string | null): string {
  if (!condition) return "is_gently_used";
  const lower = condition.toLowerCase().replace(/\s+/g, "_");
  if (lower === "new" || lower === "brand_new" || lower === "nwt") return "is_new";
  if (lower === "used") return "is_used";
  if (lower === "heavily_used") return "is_worn";
  return "is_gently_used";
}

function mapGrailedDraftCategory(category: string | null) {
  if (!category) return null;
  return GRAILED_DRAFT_CATEGORY_LOOKUP[category] ?? null;
}

function buildDraftPhotos(urls: string[]) {
  return urls.map((url, position) => ({
    url,
    width: 1080,
    height: 1080,
    rotate: 0,
    position,
  }));
}

function shouldAcceptOffers(listing: CanonicalListing) {
  return listing.traits?.accept_offers === "true";
}

function buildGrailedDraftPayload(
  listing: CanonicalListing,
  normalizedSize: string,
  photos: string[],
  designers: GrailedDesigner[],
  traits: GrailedTrait[]
) {
  const categoryPath = mapGrailedDraftCategory(listing.category);
  if (!categoryPath) {
    return { ok: false as const, error: "Grailed does not support this category yet." };
  }

  return {
    ok: true as const,
    payload: {
      title: listing.title,
      description: listing.description,
      price: Number(listing.price),
      category_path: categoryPath,
      designers,
      condition: mapDraftCondition(listing.condition),
      traits,
      size: normalizedSize,
      department: "menswear",
      make_offer: shouldAcceptOffers(listing),
      buy_now: true,
      photos: buildDraftPhotos(photos),
      shipping: {
        us: { amount: 15, enabled: true },
        ca: { amount: 0, enabled: false },
        uk: { amount: 0, enabled: false },
        eu: { amount: 0, enabled: false },
        asia: { amount: 0, enabled: false },
        au: { amount: 0, enabled: false },
        other: { amount: 0, enabled: false },
      },
    },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function verifyGrailedConnection(tokens: GrailedTokens): Promise<ConnectionProbeResult> {
  const csrfToken = pickString(tokens.csrf_token);
  const cookies = pickString(tokens.cookies);
  if (!csrfToken || !cookies) {
    return { ok: false, error: "Invalid Grailed tokens: csrf_token and cookies are required" };
  }

  try {
    const me = await getMe(csrfToken, cookies);
    const user = (me as { data?: Record<string, unknown> }).data ?? {};
    const platformUsername = pickString(user.username) ?? pickString(user.name);
    return { ok: true, platformUsername };
  } catch (err) {
    if (err instanceof GrailedError && (err.statusCode === 401 || err.statusCode === 403)) {
      return { ok: false, error: "Grailed authentication failed. Please reconnect your account." };
    }
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Grailed verification failed: ${error}` };
  }
}

export async function publishToGrailed(
  listing: CanonicalListing,
  tokens: GrailedTokens,
  options: PublishOptions = {}
): Promise<PublishResult> {
  const { csrf_token, cookies } = tokens;
  const mode = options.mode ?? "live";
  const normalizedTraits = normalizeGrailedTraits(listing);
  if (!normalizedTraits.ok) {
    return { ok: false, error: normalizedTraits.error, retryable: false };
  }

  const normalizedSize = normalizeGrailedSize(listing);
  if (!normalizedSize.ok) {
    return { ok: false, error: normalizedSize.error, retryable: false };
  }

  const debug = createMarketplaceDebugData();
  let draftId: string | null = options.existingPlatformData?.remote_state === "draft"
    ? options.existingPlatformListingId ?? null
    : null;

  try {
    // 1. Upload photos
    const uploadedPhotoUrls = await uploadPhotos(listing.photos, csrf_token, cookies);

    // 2. Resolve designer when possible
    const designers = await resolveDesigners(listing.brand);

    const draftPayloadResult = buildGrailedDraftPayload(
      listing,
      normalizedSize.size,
      uploadedPhotoUrls,
      designers,
      normalizedTraits.traits
    );
    if (!draftPayloadResult.ok) {
      return { ok: false, error: draftPayloadResult.error, retryable: false };
    }
    const payload = draftPayloadResult.payload;

    // 3. Create or update draft
    const existingDraftId = options.existingPlatformData?.remote_state === "draft"
      ? options.existingPlatformListingId
      : null;

    const draftResponse = existingDraftId
      ? await runGrailedPublishStep("updating draft", () => {
        recordMarketplaceRequest({
          debug,
          platform: "grailed",
          listingId: listing.id,
          request: {
            operation: "update_draft",
            method: "PUT",
            endpoint: `/api/listing_drafts/${existingDraftId}`,
            payload,
          },
        });
        return apiFetch(`${GRAILED_API}/listing_drafts/${existingDraftId}`, {
          method: "PUT",
          headers: makeHeaders(csrf_token, cookies),
          body: JSON.stringify(payload),
        });
      })
      : await runGrailedPublishStep("creating draft", () => {
        recordMarketplaceRequest({
          debug,
          platform: "grailed",
          listingId: listing.id,
          request: {
            operation: "create_draft",
            method: "POST",
            endpoint: "/api/listing_drafts",
            payload,
          },
        });
        return apiFetch(`${GRAILED_API}/listing_drafts`, {
          method: "POST",
          headers: makeHeaders(csrf_token, cookies),
          body: JSON.stringify(payload),
        });
      });

    draftId = String((draftResponse as { data: { id: number } }).data.id ?? existingDraftId);
    if (mode === "draft") {
      return {
        ok: true,
        platformListingId: draftId,
        remoteState: "draft",
        modeUsed: "draft",
        platformData: attachMarketplaceDebugData({ ...payload, remote_state: "draft" }, debug),
      };
    }

    // 4. Submit draft live
    const result = await runGrailedPublishStep("submitting draft", () => {
      recordMarketplaceRequest({
        debug,
        platform: "grailed",
        listingId: listing.id,
        request: {
          operation: "submit_draft",
          method: "POST",
          endpoint: `/api/listing_drafts/${draftId}/submit`,
          payload: null,
        },
      });
      return apiFetch(`${GRAILED_API}/listing_drafts/${draftId}/submit`, {
        method: "POST",
        headers: makeHeaders(csrf_token, cookies),
      });
    });

    const grailedId = String((result as { data: { id: number } }).data.id);
    return {
      ok: true,
      platformListingId: grailedId,
      remoteState: "live",
      modeUsed: "live",
      platformData: attachMarketplaceDebugData({ ...payload, remote_state: "live", source_draft_id: draftId }, debug),
    };
  } catch (err) {
    if (err instanceof GrailedPublishStepError) {
      console.warn(JSON.stringify({
        event: "grailed.publish.step_failure",
        listing_id: listing.id,
        step: err.step,
        status_code: err.statusCode ?? null,
        error: err.message,
      }));
    }
    const error = err instanceof Error ? err.message : String(err);
    const retryable = isRetryableGrailedError(err);
    return {
      ok: false,
      error,
      retryable,
      platformListingId: draftId ?? undefined,
      platformData: draftId
        ? {
            ...debugPlatformData(debug),
            remote_state: "draft",
          }
        : debugPlatformData(debug),
    };
  }
}

export async function deleteGrailedDraft(
  platformListingId: string,
  tokens: GrailedTokens
): Promise<DelistResult> {
  const { csrf_token, cookies } = tokens;
  try {
    await apiFetch(`${GRAILED_API}/listing_drafts/${platformListingId}`, {
      method: "DELETE",
      headers: makeHeaders(csrf_token, cookies),
    });
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const retryable = err instanceof GrailedError ? err.statusCode >= 500 : true;
    return { ok: false, error, retryable };
  }
}

export async function delistFromGrailed(
  platformListingId: string,
  tokens: GrailedTokens
): Promise<DelistResult> {
  const { csrf_token, cookies } = tokens;
  try {
    await apiFetch(`${GRAILED_API}/listings/${platformListingId}`, {
      method: "DELETE",
      headers: makeHeaders(csrf_token, cookies),
    });
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const retryable = err instanceof GrailedError ? err.statusCode >= 500 : true;
    return { ok: false, error, retryable };
  }
}

export async function checkGrailedStatus(
  platformListingId: string
): Promise<StatusResult> {
  try {
    const result = await apiFetch(`${GRAILED_API}/listings/${platformListingId}`);
    const data = (result as { data: { sold: boolean; is_bumped?: boolean } }).data;
    const status = data.sold ? "sold" : "live";
    return { ok: true, status };
  } catch (err) {
    if (err instanceof GrailedError && err.statusCode === 404) {
      return { ok: true, status: "delisted" };
    }
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  }
}
