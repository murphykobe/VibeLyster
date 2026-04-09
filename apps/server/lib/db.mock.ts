type Platform = "grailed" | "depop" | "ebay";

type ListingStatus = "active" | "deleted";
type PlatformListingStatus = "pending" | "publishing" | "live" | "failed" | "sold" | "delisted";

type UserRow = {
  id: string;
  clerk_id: string;
  email: string;
  created_at: string;
};

type ListingRow = {
  id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  price: string | null;
  size: string | null;
  condition: string | null;
  brand: string | null;
  category: string | null;
  traits: Record<string, unknown>;
  photos: string[];
  voice_transcript: string | null;
  ai_raw_response: Record<string, unknown> | null;
  generation_status: "generating" | "complete" | "failed";
  generation_error: string | null;
  status: ListingStatus;
  created_at: string;
  updated_at: string;
};

function serializeSize(size: { system: string; value: string } | string | null | undefined) {
  if (size == null) return null;
  return typeof size === "string" ? size : JSON.stringify(size);
}

type PlatformListingRow = {
  id: string;
  listing_id: string;
  platform: Platform;
  platform_listing_id: string | null;
  platform_data: Record<string, unknown>;
  status: PlatformListingStatus;
  last_error: string | null;
  attempt_count: number;
  idempotency_key: string;
  published_at: string | null;
  delisted_at: string | null;
  last_synced_at: string | null;
};

type MarketplaceConnectionRow = {
  id: string;
  user_id: string;
  platform: Platform;
  encrypted_tokens: Record<string, unknown>;
  platform_username: string | null;
  connected_at: string;
  expires_at: string | null;
};

type MockState = {
  users: UserRow[];
  listings: ListingRow[];
  platformListings: PlatformListingRow[];
  connections: MarketplaceConnectionRow[];
  seq: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __VIBELYSTER_MOCK_DB__: MockState | undefined;
}

function nowIso() {
  return new Date().toISOString();
}

function nextId() {
  const state = getState();
  state.seq += 1;
  const suffix = state.seq.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${suffix}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getState(): MockState {
  if (!globalThis.__VIBELYSTER_MOCK_DB__) {
    globalThis.__VIBELYSTER_MOCK_DB__ = {
      users: [],
      listings: [],
      platformListings: [],
      connections: [],
      seq: 0,
    };
  }
  return globalThis.__VIBELYSTER_MOCK_DB__;
}

function listingWithPlatforms(listing: ListingRow) {
  const state = getState();
  const pls = state.platformListings.filter((pl) => pl.listing_id === listing.id);
  return {
    ...clone(listing),
    platform_listings: pls.length > 0 ? clone(pls) : null,
  };
}

export async function rawQuery<T = Record<string, unknown>>(_query: string, _params: unknown[]): Promise<T[]> {
  return [];
}

export async function upsertUser(clerkId: string, email: string) {
  const state = getState();
  const found = state.users.find((u) => u.clerk_id === clerkId);
  if (found) {
    found.email = email;
    return clone(found);
  }
  const row: UserRow = {
    id: nextId(),
    clerk_id: clerkId,
    email,
    created_at: nowIso(),
  };
  state.users.push(row);
  return clone(row);
}

export async function getUserByClerkId(clerkId: string) {
  const found = getState().users.find((u) => u.clerk_id === clerkId);
  return found ? clone(found) : undefined;
}

export async function getListings(userId: string) {
  const state = getState();
  return state.listings
    .filter((l) => l.user_id === userId && l.status === "active")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((l) => listingWithPlatforms(l));
}

export async function getListingById(userId: string, listingId: string) {
  const found = getState().listings.find(
    (l) => l.id === listingId && l.user_id === userId && l.status === "active"
  );
  return found ? listingWithPlatforms(found) : undefined;
}

export type CreateListingInput = {
  userId: string;
  title: string | null;
  description: string | null;
  price: number | null;
  size?: { system: string; value: string } | string | null;
  condition?: string | null;
  brand?: string | null;
  category?: string | null;
  traits?: Record<string, unknown>;
  photos: string[];
  voiceTranscript?: string;
  aiRawResponse?: Record<string, unknown>;
  generation_status?: ListingRow["generation_status"];
};

export async function createListing(input: CreateListingInput) {
  const state = getState();
  const now = nowIso();
  const row: ListingRow = {
    id: nextId(),
    user_id: input.userId,
    title: input.title ?? null,
    description: input.description ?? null,
    price: input.price == null ? null : String(input.price),
    size: serializeSize(input.size),
    condition: input.condition ?? null,
    brand: input.brand ?? null,
    category: input.category ?? null,
    traits: clone(input.traits ?? {}),
    photos: clone(input.photos),
    voice_transcript: input.voiceTranscript ?? null,
    ai_raw_response: input.aiRawResponse ? clone(input.aiRawResponse) : null,
    generation_status: input.generation_status ?? "complete",
    generation_error: null,
    status: "active",
    created_at: now,
    updated_at: now,
  };
  state.listings.push(row);
  return clone(row);
}

export type UpdateListingInput = Partial<Omit<CreateListingInput, "userId">>;

export async function updateListing(userId: string, listingId: string, input: UpdateListingInput) {
  const listing = getState().listings.find(
    (l) => l.id === listingId && l.user_id === userId && l.status === "active"
  );
  if (!listing) return undefined;

  if (input.title !== undefined) listing.title = input.title;
  if (input.description !== undefined) listing.description = input.description;
  if (input.price !== undefined) listing.price = input.price == null ? null : String(input.price);
  if (input.size !== undefined) listing.size = serializeSize(input.size);
  if (input.condition !== undefined) listing.condition = input.condition ?? null;
  if (input.brand !== undefined) listing.brand = input.brand ?? null;
  if (input.category !== undefined) listing.category = input.category ?? null;
  if (input.traits !== undefined) listing.traits = clone(input.traits);
  if (input.photos !== undefined) listing.photos = clone(input.photos);
  listing.updated_at = nowIso();
  return clone(listing);
}

export async function updateListingGeneration(
  listingId: string,
  updates: {
    generation_status: string;
    generation_error?: string | null;
    title?: string | null;
    description?: string | null;
    price?: number | null;
    size?: string | null;
    condition?: string | null;
    brand?: string | null;
    category?: string | null;
    traits?: Record<string, unknown>;
    voiceTranscript?: string | null;
    aiRawResponse?: Record<string, unknown> | null;
    photos?: string[];
  }
) {
  const listing = getState().listings.find((l) => l.id === listingId && l.status === "active");
  if (!listing) return undefined;

  listing.generation_status = updates.generation_status as ListingRow["generation_status"];
  if (updates.generation_error !== undefined) listing.generation_error = updates.generation_error ?? null;
  if (updates.title !== undefined) listing.title = updates.title ?? null;
  if (updates.description !== undefined) listing.description = updates.description ?? null;
  if (updates.price !== undefined) listing.price = updates.price == null ? null : String(updates.price);
  if (updates.size !== undefined) listing.size = updates.size ?? null;
  if (updates.condition !== undefined) listing.condition = updates.condition ?? null;
  if (updates.brand !== undefined) listing.brand = updates.brand ?? null;
  if (updates.category !== undefined) listing.category = updates.category ?? null;
  if (updates.traits !== undefined) listing.traits = clone(updates.traits);
  if (updates.voiceTranscript !== undefined) listing.voice_transcript = updates.voiceTranscript ?? null;
  if (updates.aiRawResponse !== undefined) listing.ai_raw_response = updates.aiRawResponse ? clone(updates.aiRawResponse) : null;
  if (updates.photos !== undefined) listing.photos = clone(updates.photos);
  listing.updated_at = nowIso();
  return clone(listing);
}

export async function softDeleteListing(userId: string, listingId: string) {
  const listing = getState().listings.find((l) => l.id === listingId && l.user_id === userId);
  if (!listing) return undefined;
  listing.status = "deleted";
  listing.updated_at = nowIso();
  return { id: listing.id };
}

export async function upsertPlatformListing(
  listingId: string,
  platform: Platform,
  data: Partial<PlatformListingRow>
) {
  const state = getState();
  const existing = state.platformListings.find(
    (pl) => pl.listing_id === listingId && pl.platform === platform
  );
  const idempotencyKey = `${listingId}-${platform}`;
  if (existing) {
    existing.status = data.status ?? existing.status;
    existing.platform_listing_id = data.platform_listing_id ?? existing.platform_listing_id;
    existing.platform_data = data.platform_data ? clone(data.platform_data) : existing.platform_data;
    existing.last_error = data.last_error ?? existing.last_error;
    existing.attempt_count = data.attempt_count ?? existing.attempt_count;
    return clone(existing);
  }

  const row: PlatformListingRow = {
    id: nextId(),
    listing_id: listingId,
    platform,
    platform_listing_id: data.platform_listing_id ?? null,
    platform_data: clone(data.platform_data ?? {}),
    status: data.status ?? "pending",
    last_error: data.last_error ?? null,
    attempt_count: data.attempt_count ?? 0,
    idempotency_key: idempotencyKey,
    published_at: null,
    delisted_at: null,
    last_synced_at: null,
  };
  state.platformListings.push(row);
  return clone(row);
}

export async function updatePlatformListingStatus(
  listingId: string,
  platform: Platform,
  status: PlatformListingStatus,
  opts?: {
    platformListingId?: string;
    lastError?: string;
    incrementAttempt?: boolean;
    platformData?: Record<string, unknown>;
  }
) {
  const row = getState().platformListings.find(
    (pl) => pl.listing_id === listingId && pl.platform === platform
  );
  if (!row) return undefined;

  row.status = status;
  row.platform_listing_id = opts?.platformListingId ?? row.platform_listing_id;
  if (opts?.platformData) {
    row.platform_data = clone(opts.platformData);
  }
  row.last_error = opts?.lastError ?? null;
  row.attempt_count += opts?.incrementAttempt ? 1 : 0;
  if (status === "live") row.published_at = nowIso();
  if (status === "delisted") row.delisted_at = nowIso();
  row.last_synced_at = nowIso();
  return clone(row);
}

export async function getConnections(userId: string, opts?: { includeEncryptedTokens?: boolean }) {
  return getState().connections
    .filter((c) => c.user_id === userId)
    .map((c) => clone(opts?.includeEncryptedTokens
      ? c
      : {
          id: c.id,
          user_id: c.user_id,
          platform: c.platform,
          platform_username: c.platform_username,
          connected_at: c.connected_at,
          expires_at: c.expires_at,
        }));
}

export async function getConnection(userId: string, platform: string) {
  const found = getState().connections.find((c) => c.user_id === userId && c.platform === platform);
  return found ? clone(found) : undefined;
}

export async function upsertConnection(
  userId: string,
  platform: string,
  encryptedTokens: Record<string, unknown>,
  platformUsername?: string | null,
  expiresAt?: string,
  opts?: { replacePlatformUsername?: boolean }
) {
  const state = getState();
  const existing = state.connections.find((c) => c.user_id === userId && c.platform === platform);
  if (existing) {
    existing.encrypted_tokens = clone(encryptedTokens);
    if (opts?.replacePlatformUsername) {
      existing.platform_username = platformUsername ?? null;
    } else {
      existing.platform_username = platformUsername ?? existing.platform_username;
    }
    existing.connected_at = nowIso();
    existing.expires_at = expiresAt ?? null;
    return clone({
      id: existing.id,
      user_id: existing.user_id,
      platform: existing.platform,
      platform_username: existing.platform_username,
      connected_at: existing.connected_at,
      expires_at: existing.expires_at,
    });
  }

  const row: MarketplaceConnectionRow = {
    id: nextId(),
    user_id: userId,
    platform: platform as Platform,
    encrypted_tokens: clone(encryptedTokens),
    platform_username: platformUsername ?? null,
    connected_at: nowIso(),
    expires_at: expiresAt ?? null,
  };
  state.connections.push(row);
  return clone({
    id: row.id,
    user_id: row.user_id,
    platform: row.platform,
    platform_username: row.platform_username,
    connected_at: row.connected_at,
    expires_at: row.expires_at,
  });
}

export async function deleteConnection(userId: string, platform: string) {
  const state = getState();
  const idx = state.connections.findIndex((c) => c.user_id === userId && c.platform === platform);
  if (idx === -1) return undefined;
  const [removed] = state.connections.splice(idx, 1);
  return { id: removed.id };
}
