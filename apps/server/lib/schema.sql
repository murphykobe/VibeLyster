-- Users (synced from Clerk)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Marketplace connections (encrypted tokens)
CREATE TABLE marketplace_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('grailed', 'depop', 'ebay')),
  encrypted_tokens JSONB NOT NULL,
  platform_username TEXT,
  connected_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE (user_id, platform)
);

-- Listings (drafts + published)
CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  price NUMERIC,
  size TEXT,
  condition TEXT,
  brand TEXT,
  category TEXT,
  traits JSONB DEFAULT '{}',
  photos JSONB NOT NULL DEFAULT '[]',
  voice_transcript TEXT,
  ai_raw_response JSONB,
  -- 'active' = not deleted; display status (draft/live/sold) derived from platform_listings
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Per-platform publish state
CREATE TABLE platform_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('grailed', 'depop', 'ebay')),
  platform_listing_id TEXT,
  platform_data JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'publishing', 'live', 'failed', 'sold', 'delisted')
  ),
  last_error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  delisted_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  UNIQUE (listing_id, platform),
  UNIQUE (idempotency_key)
);

-- Auto-update updated_at on listings
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
