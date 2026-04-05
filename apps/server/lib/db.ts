import { neon } from "@neondatabase/serverless";
import * as mockDb from "./db.mock";
import { isMockMode } from "./mock";

const MOCK_MODE = isMockMode();

if (!MOCK_MODE && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const mockSql = (async () => {
  throw new Error("sql is unavailable in MOCK_MODE");
}) as unknown as ReturnType<typeof neon>;

export const sql = (MOCK_MODE ? mockSql : neon(process.env.DATABASE_URL as string)) as any;

// Helper to run a raw parameterized query (used for dynamic UPDATE SET clauses)
export async function rawQuery<T = Record<string, unknown>>(query: string, params: unknown[]): Promise<T[]> {
  if (MOCK_MODE) return mockDb.rawQuery<T>(query, params);
  // neon() supports calling as a function: sql(query, params)
  return (sql as unknown as (q: string, p: unknown[]) => Promise<T[]>)(query, params);
}

// ---- User helpers ----

export async function upsertUser(clerkId: string, email: string) {
  if (MOCK_MODE) return mockDb.upsertUser(clerkId, email);
  const rows = await sql`
    INSERT INTO users (clerk_id, email)
    VALUES (${clerkId}, ${email})
    ON CONFLICT (clerk_id) DO UPDATE SET email = EXCLUDED.email
    RETURNING id, clerk_id, email, created_at
  `;
  return rows[0] as { id: string; clerk_id: string; email: string; created_at: string };
}

export async function getUserByClerkId(clerkId: string) {
  if (MOCK_MODE) return mockDb.getUserByClerkId(clerkId);
  const rows = await sql`
    SELECT id, clerk_id, email, created_at
    FROM users
    WHERE clerk_id = ${clerkId}
  `;
  return rows[0] as { id: string; clerk_id: string; email: string; created_at: string } | undefined;
}

// ---- Listing helpers ----

export type ListingRow = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  price: string;
  size: string | null;
  condition: string | null;
  brand: string | null;
  category: string | null;
  traits: Record<string, unknown>;
  photos: string[];
  voice_transcript: string | null;
  ai_raw_response: Record<string, unknown> | null;
  status: "active" | "deleted";
  created_at: string;
  updated_at: string;
};

export type PlatformListingRow = {
  id: string;
  listing_id: string;
  platform: "grailed" | "depop" | "ebay";
  platform_listing_id: string | null;
  platform_data: Record<string, unknown>;
  status: "pending" | "publishing" | "live" | "failed" | "sold" | "delisted";
  last_error: string | null;
  attempt_count: number;
  idempotency_key: string;
  published_at: string | null;
  delisted_at: string | null;
  last_synced_at: string | null;
};

export async function getListings(userId: string) {
  if (MOCK_MODE) return mockDb.getListings(userId);
  const rows = await sql`
    SELECT l.*, json_agg(pl.*) FILTER (WHERE pl.id IS NOT NULL) AS platform_listings
    FROM listings l
    LEFT JOIN platform_listings pl ON pl.listing_id = l.id
    WHERE l.user_id = ${userId} AND l.status = 'active'
    GROUP BY l.id
    ORDER BY l.created_at DESC
  `;
  return rows as unknown as (ListingRow & { platform_listings: PlatformListingRow[] | null })[];
}

export async function getListingById(userId: string, listingId: string) {
  if (MOCK_MODE) return mockDb.getListingById(userId, listingId);
  const rows = await sql`
    SELECT l.*, json_agg(pl.*) FILTER (WHERE pl.id IS NOT NULL) AS platform_listings
    FROM listings l
    LEFT JOIN platform_listings pl ON pl.listing_id = l.id
    WHERE l.id = ${listingId} AND l.user_id = ${userId} AND l.status = 'active'
    GROUP BY l.id
  `;
  const typed = rows as unknown as (ListingRow & { platform_listings: PlatformListingRow[] | null })[];
  return typed[0];
}

export type CreateListingInput = {
  userId: string;
  title: string;
  description: string;
  price: number;
  size?: string;
  condition?: string;
  brand?: string;
  category?: string | null;
  traits?: Record<string, unknown>;
  photos: string[];
  voiceTranscript?: string;
  aiRawResponse?: Record<string, unknown>;
};

export async function createListing(input: CreateListingInput) {
  if (MOCK_MODE) return mockDb.createListing(input);
  const rows = await sql`
    INSERT INTO listings (
      user_id, title, description, price, size, condition, brand,
      category, traits, photos, voice_transcript, ai_raw_response
    ) VALUES (
      ${input.userId}, ${input.title}, ${input.description}, ${input.price},
      ${input.size ?? null}, ${input.condition ?? null}, ${input.brand ?? null},
      ${input.category ?? null}, ${JSON.stringify(input.traits ?? {})},
      ${JSON.stringify(input.photos)},
      ${input.voiceTranscript ?? null},
      ${input.aiRawResponse ? JSON.stringify(input.aiRawResponse) : null}
    )
    RETURNING *
  `;
  return rows[0] as ListingRow;
}

export type UpdateListingInput = Partial<Omit<CreateListingInput, "userId">>;

export async function updateListing(userId: string, listingId: string, input: UpdateListingInput) {
  if (MOCK_MODE) return mockDb.updateListing(userId, listingId, input);
  // Build SET clause dynamically — only update provided fields
  const updates: string[] = [];
  const values: unknown[] = [];

  if (input.title !== undefined) { updates.push(`title = $${values.push(input.title)}`); }
  if (input.description !== undefined) { updates.push(`description = $${values.push(input.description)}`); }
  if (input.price !== undefined) { updates.push(`price = $${values.push(input.price)}`); }
  if (input.size !== undefined) { updates.push(`size = $${values.push(input.size)}`); }
  if (input.condition !== undefined) { updates.push(`condition = $${values.push(input.condition)}`); }
  if (input.brand !== undefined) { updates.push(`brand = $${values.push(input.brand)}`); }
  if (input.category !== undefined) { updates.push(`category = $${values.push(input.category)}`); }
  if (input.traits !== undefined) { updates.push(`traits = $${values.push(JSON.stringify(input.traits))}`); }
  if (input.photos !== undefined) { updates.push(`photos = $${values.push(JSON.stringify(input.photos))}`); }

  if (updates.length === 0) return getListingById(userId, listingId);

  // Use rawQuery for dynamic UPDATE SET clauses
  const query = `
    UPDATE listings
    SET ${updates.join(", ")}
    WHERE id = $${values.push(listingId)} AND user_id = $${values.push(userId)} AND status = 'active'
    RETURNING *
  `;
  const rows = await rawQuery<ListingRow>(query, values);
  return rows[0];
}

export async function softDeleteListing(userId: string, listingId: string) {
  if (MOCK_MODE) return mockDb.softDeleteListing(userId, listingId);
  const rows = await sql`
    UPDATE listings SET status = 'deleted'
    WHERE id = ${listingId} AND user_id = ${userId}
    RETURNING id
  `;
  return rows[0] as { id: string } | undefined;
}

// ---- Platform listing helpers ----

export async function upsertPlatformListing(
  listingId: string,
  platform: "grailed" | "depop" | "ebay",
  data: Partial<PlatformListingRow>
) {
  if (MOCK_MODE) return mockDb.upsertPlatformListing(listingId, platform, data as any);
  const idempotencyKey = `${listingId}-${platform}`;
  const rows = await sql`
    INSERT INTO platform_listings (listing_id, platform, idempotency_key, status, platform_listing_id, platform_data, last_error, attempt_count)
    VALUES (
      ${listingId}, ${platform}, ${idempotencyKey},
      ${data.status ?? "pending"},
      ${data.platform_listing_id ?? null},
      ${JSON.stringify(data.platform_data ?? {})},
      ${data.last_error ?? null},
      ${data.attempt_count ?? 0}
    )
    ON CONFLICT (listing_id, platform) DO UPDATE SET
      status = EXCLUDED.status,
      platform_listing_id = COALESCE(EXCLUDED.platform_listing_id, platform_listings.platform_listing_id),
      platform_data = COALESCE(EXCLUDED.platform_data, platform_listings.platform_data),
      last_error = EXCLUDED.last_error,
      attempt_count = EXCLUDED.attempt_count
    RETURNING *
  `;
  return rows[0] as PlatformListingRow;
}

export async function updatePlatformListingStatus(
  listingId: string,
  platform: "grailed" | "depop" | "ebay",
  status: PlatformListingRow["status"],
  opts?: {
    platformListingId?: string;
    lastError?: string;
    incrementAttempt?: boolean;
    platformData?: Record<string, unknown>;
  }
) {
  if (MOCK_MODE) return mockDb.updatePlatformListingStatus(listingId, platform, status, opts);
  const rows = await sql`
    UPDATE platform_listings SET
      status = ${status},
      platform_listing_id = COALESCE(${opts?.platformListingId ?? null}, platform_listing_id),
      platform_data = COALESCE(${opts?.platformData ? JSON.stringify(opts.platformData) : null}, platform_data),
      last_error = ${opts?.lastError ?? null},
      attempt_count = attempt_count + ${opts?.incrementAttempt ? 1 : 0},
      published_at = CASE WHEN ${status} = 'live' THEN now() ELSE published_at END,
      delisted_at = CASE WHEN ${status} = 'delisted' THEN now() ELSE delisted_at END,
      last_synced_at = now()
    WHERE listing_id = ${listingId} AND platform = ${platform}
    RETURNING *
  `;
  return rows[0] as PlatformListingRow | undefined;
}

// ---- Marketplace connection helpers ----

export type MarketplaceConnectionRow = {
  id: string;
  user_id: string;
  platform: "grailed" | "depop" | "ebay";
  encrypted_tokens: Record<string, unknown>;
  platform_username: string | null;
  connected_at: string;
  expires_at: string | null;
};

export async function getConnections(userId: string, opts?: { includeEncryptedTokens?: boolean }) {
  if (MOCK_MODE) return mockDb.getConnections(userId, opts);
  if (opts?.includeEncryptedTokens) {
    const rows = await sql`
      SELECT *
      FROM marketplace_connections
      WHERE user_id = ${userId}
    `;
    return rows as unknown as MarketplaceConnectionRow[];
  }
  const rows = await sql`
    SELECT id, user_id, platform, platform_username, connected_at, expires_at
    FROM marketplace_connections
    WHERE user_id = ${userId}
  `;
  return rows as unknown as Omit<MarketplaceConnectionRow, "encrypted_tokens">[];
}

export async function getConnection(userId: string, platform: string) {
  if (MOCK_MODE) return mockDb.getConnection(userId, platform);
  const rows = await sql`
    SELECT * FROM marketplace_connections
    WHERE user_id = ${userId} AND platform = ${platform}
  `;
  return rows[0] as MarketplaceConnectionRow | undefined;
}

export async function upsertConnection(
  userId: string,
  platform: string,
  encryptedTokens: Record<string, unknown>,
  platformUsername?: string | null,
  expiresAt?: string,
  opts?: { replacePlatformUsername?: boolean }
) {
  if (MOCK_MODE) return mockDb.upsertConnection(userId, platform, encryptedTokens, platformUsername, expiresAt, opts);
  if (opts?.replacePlatformUsername) {
    const rows = await sql`
      INSERT INTO marketplace_connections (user_id, platform, encrypted_tokens, platform_username, expires_at)
      VALUES (${userId}, ${platform}, ${JSON.stringify(encryptedTokens)}, ${platformUsername ?? null}, ${expiresAt ?? null})
      ON CONFLICT (user_id, platform) DO UPDATE SET
        encrypted_tokens = EXCLUDED.encrypted_tokens,
        platform_username = EXCLUDED.platform_username,
        connected_at = now(),
        expires_at = EXCLUDED.expires_at
      RETURNING id, user_id, platform, platform_username, connected_at, expires_at
    `;
    return rows[0] as Omit<MarketplaceConnectionRow, "encrypted_tokens">;
  }
  const rows = await sql`
    INSERT INTO marketplace_connections (user_id, platform, encrypted_tokens, platform_username, expires_at)
    VALUES (${userId}, ${platform}, ${JSON.stringify(encryptedTokens)}, ${platformUsername ?? null}, ${expiresAt ?? null})
    ON CONFLICT (user_id, platform) DO UPDATE SET
      encrypted_tokens = EXCLUDED.encrypted_tokens,
      platform_username = COALESCE(EXCLUDED.platform_username, marketplace_connections.platform_username),
      connected_at = now(),
      expires_at = EXCLUDED.expires_at
    RETURNING id, user_id, platform, platform_username, connected_at, expires_at
  `;
  return rows[0] as Omit<MarketplaceConnectionRow, "encrypted_tokens">;
}

export async function deleteConnection(userId: string, platform: string) {
  if (MOCK_MODE) return mockDb.deleteConnection(userId, platform);
  const rows = await sql`
    DELETE FROM marketplace_connections
    WHERE user_id = ${userId} AND platform = ${platform}
    RETURNING id
  `;
  return rows[0] as { id: string } | undefined;
}
