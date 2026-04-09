import { z } from "zod";

export const PlatformEnum = z.enum(["grailed", "depop", "ebay"]);
export const PublishModeEnum = z.enum(["live", "draft"]);

const StructuredSizeBody = z.object({
  system: z.string().min(1).max(50),
  value: z.string().min(1).max(50),
});

// ─── Listings ─────────────────────────────────────────────────────────────────

export const CreateListingBody = z.object({
  title: z.string().min(1, "title is required").max(200),
  description: z.string().min(1, "description is required").max(5000),
  price: z.coerce.number().positive("price must be positive"),
  size: z.union([z.string().max(50), StructuredSizeBody]).nullish(),
  condition: z.string().max(50).nullish(),
  brand: z.string().max(100).nullish(),
  category: z.string().max(100).nullish(),
  traits: z.record(z.unknown()).optional(),
  photos: z.array(z.string().url()).min(0, "photos must be an array of URLs"),
  voiceTranscript: z.string().nullish(),
  aiRawResponse: z.record(z.unknown()).nullish(),
});

export const UpdateListingBody = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  price: z.coerce.number().positive().optional(),
  size: z.union([z.string().max(50), StructuredSizeBody]).nullish(),
  condition: z.string().max(50).nullish(),
  brand: z.string().max(100).nullish(),
  category: z.string().max(100).nullish(),
  traits: z.record(z.unknown()).optional(),
  photos: z.array(z.string().url()).optional(),
});

// ─── Publish ──────────────────────────────────────────────────────────────────

export const PublishBody = z.object({
  listingId: z.string().uuid("listingId must be a UUID"),
  platforms: z.array(PlatformEnum).min(1, "at least one platform is required"),
  mode: PublishModeEnum.default("live"),
});

export const BulkPublishBody = z.object({
  listingIds: z.array(z.string().uuid()).min(1, "at least one listingId is required"),
  platforms: z.array(PlatformEnum).min(1, "at least one platform is required"),
  mode: PublishModeEnum.default("live"),
});

// ─── Delist ───────────────────────────────────────────────────────────────────

export const DelistBody = z.object({
  listingId: z.string().uuid("listingId must be a UUID"),
  platform: PlatformEnum,
});

// ─── Connect ──────────────────────────────────────────────────────────────────

const ConnectTokenBody = z.object({
  platform: z.enum(["grailed", "depop"]),
  tokens: z.record(z.unknown()).refine(
    (t) => Object.keys(t).length > 0,
    "tokens must be a non-empty object"
  ),
  platformUsername: z.string().max(100).optional(),
  expiresAt: z.string().datetime().optional(),
});

const ConnectEbayBody = z.object({
  platform: z.literal("ebay"),
  authorizationCode: z.string().min(1, "authorizationCode is required"),
  ruName: z.string().min(1, "ruName is required"),
});

export const ConnectBody = z.discriminatedUnion("platform", [
  ConnectTokenBody,
  ConnectEbayBody,
]);

export const DisconnectQuery = z.object({
  platform: PlatformEnum,
});

export const UpdateEbayMetadataBody = z.object({
  ebayCategoryId: z.string().min(1).optional(),
  ebayConditionId: z.number().int().optional(),
  ebayAspects: z.record(z.array(z.string())).optional(),
  metadataSources: z.record(z.enum(["deterministic", "ai", "user"])).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parses body with a Zod schema; returns a 400 Response on failure, or the parsed data. */
export function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): { data: z.infer<T> } | { error: Response } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const messages = result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`
    );
    return {
      error: Response.json(
        { error: "Validation failed", details: messages },
        { status: 400 },
      ),
    };
  }
  return { data: result.data };
}
