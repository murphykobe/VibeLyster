# VibeLyster MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the VibeLyster iOS app — voice + photo listing capture, AI generation, draft management, and publishing to Grailed + Depop.

**Architecture:** React Native (Expo) iOS app talks to a Next.js backend on Vercel. Backend handles AI pipeline (Whisper + vision model via AI Gateway), draft CRUD, and marketplace posting (ported from existing CLI POCs). Neon Postgres stores users, listings, tokens. Clerk handles app auth.

**Tech Stack:** Expo (React Native), Next.js 16 (App Router), Neon Postgres, Clerk, Vercel AI Gateway, Vercel Blob, TypeScript throughout.

---

## Prerequisites (Manual Setup)

Complete these before starting any tasks. These require account creation, dashboard clicks, and API key provisioning that cannot be automated by agents.

### 1. Apple Developer Account
- [ ] Enroll at [developer.apple.com](https://developer.apple.com) ($99/year)
- [ ] Create App ID: `com.vibelyster.app`
- [ ] Enable "Sign in with Apple" capability for the App ID

### 2. Expo / EAS Account
- [ ] Create account at [expo.dev](https://expo.dev)
- [ ] Install EAS CLI: `npm install -g eas-cli && eas login`
- [ ] Create project: `eas init --id vibelyster`

### 3. Vercel Project
- [ ] Install Vercel CLI: `npm i -g vercel`
- [ ] Create project: `vercel link` (from `apps/server/`)
- [ ] Enable AI Gateway in Vercel Dashboard → Project → AI Gateway tab

### 4. Neon Postgres (via Vercel Marketplace)
- [ ] Run: `vercel integration add neon`
- [ ] Accept terms in terminal, complete setup in Vercel Dashboard
- [ ] Verify: `vercel env pull` → `.env.local` should contain `DATABASE_URL`

### 5. Clerk (via Vercel Marketplace)
- [ ] Run: `vercel integration add clerk` (requires manual terms acceptance)
- [ ] Complete setup in Vercel Dashboard → connect Clerk to project
- [ ] In Clerk Dashboard:
  - Enable "Apple" social connection (requires Apple Developer credentials)
  - Enable "Google" social connection (requires Google Cloud OAuth client)
  - Note: `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` are auto-provisioned
- [ ] Set manually in Vercel env vars:
  - `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
  - `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`

### 6. Vercel AI Gateway (OIDC Auth)
- [ ] Ensure AI Gateway is enabled (step 3 above)
- [ ] Run: `vercel env pull` → `.env.local` should contain `VERCEL_OIDC_TOKEN`
- [ ] This token auto-refreshes on Vercel deployments. For local dev, re-run `vercel env pull` if expired (~24h)
- [ ] No `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` needed — AI Gateway handles provider auth via OIDC

### 7. Google Cloud OAuth (for Google Sign-In via Clerk)
- [ ] Create OAuth client at [console.cloud.google.com](https://console.cloud.google.com)
- [ ] Set authorized redirect URI to Clerk's callback URL (shown in Clerk Dashboard → Social Connections → Google)
- [ ] Add Client ID + Secret to Clerk Dashboard

### 8. Pull All Env Vars
- [ ] Run from `apps/server/`: `vercel env pull`
- [ ] Verify `.env.local` contains:
  ```
  DATABASE_URL=postgresql://...
  CLERK_SECRET_KEY=sk_...
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
  VERCEL_OIDC_TOKEN=...
  ```
- [ ] Copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` to `apps/mobile/.env`:
  ```
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
  EXPO_PUBLIC_API_URL=http://localhost:3001
  ```

### 9. Verify Setup
- [ ] `cd apps/server && npx next dev --port 3001` → starts without errors
- [ ] `cd apps/mobile && npx expo start` → starts without errors
- [ ] `psql $DATABASE_URL -c 'SELECT 1'` → connects to Neon

---

## Parallelism Map

```
Phase 1: Foundation (sequential)
  Task 1: Monorepo scaffold
  Task 2: Database schema + migrations

Phase 2: Backend Core (parallel group)
  Task 3: Listing CRUD API          ─┐
  Task 4: Marketplace posting module ─┼─ all parallel
  Task 5: AI generation pipeline     ─┘

Phase 3: Mobile App (parallel with Phase 2 after Task 1)
  Task 6: App shell + auth (Clerk)   ─┐
  Task 7: Dashboard screen            ─┤─ sequential within phase
  Task 8: Capture flow                 ─┤
  Task 9: Draft detail / edit screen   ─┘

Phase 4: Integration (depends on Phase 2 + 3)
  Task 10: Publish + delist flow
  Task 11: WebView marketplace auth
  Task 12: Status sync
  Task 13: Bulk publish API + mobile UI

Phase 5: Polish (parallel group)
  Task 14: Bulk publish API + mobile UI  ─┐
  Task 15: Upload route + connect DELETE ─┼─ all parallel
  Task 16: Missing UX polish             ─┘
```

---

## File Structure

```
perth/
├── apps/
│   ├── server/                          # Next.js backend
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── generate/route.ts    # AI pipeline
│   │   │   │   ├── listings/route.ts    # GET all, POST create
│   │   │   │   ├── listings/[id]/route.ts  # GET one, PUT update, DELETE
│   │   │   │   ├── publish/route.ts     # POST publish to marketplace
│   │   │   │   ├── delist/route.ts      # POST delist from marketplace
│   │   │   │   ├── status/[id]/route.ts # GET live marketplace status
│   │   │   │   ├── connect/route.ts     # POST store marketplace tokens
│   │   │   │   └── connections/route.ts # GET list connected platforms
│   │   │   └── layout.ts
│   │   ├── lib/
│   │   │   ├── db.ts                    # Neon client + query helpers
│   │   │   ├── schema.sql              # Database DDL
│   │   │   ├── ai.ts                   # AI pipeline (Whisper + vision)
│   │   │   ├── marketplace/
│   │   │   │   ├── grailed.ts          # Ported from tools/grailed/grailed-api.js
│   │   │   │   ├── depop.ts            # Ported from tools/depop/depop-api.js
│   │   │   │   └── types.ts            # Shared marketplace types
│   │   │   └── auth.ts                 # Clerk middleware helper
│   │   ├── next.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── mobile/                          # Expo React Native app
│       ├── app/                         # Expo Router (file-based routing)
│       │   ├── _layout.tsx              # Root layout (Clerk provider, nav)
│       │   ├── sign-in.tsx              # Clerk sign-in screen
│       │   ├── (tabs)/
│       │   │   ├── _layout.tsx          # Tab navigator
│       │   │   ├── index.tsx            # Dashboard (home tab)
│       │   │   └── settings.tsx         # Settings tab
│       │   ├── capture.tsx              # Camera + voice capture
│       │   ├── listing/[id].tsx         # Draft detail / listing detail
│       │   └── connect/[platform].tsx   # WebView marketplace auth
│       ├── components/
│       │   ├── ListingCard.tsx          # Dashboard card component
│       │   ├── PhotoCarousel.tsx        # Image carousel for detail
│       │   ├── PlatformRow.tsx          # Per-platform publish/delist row
│       │   └── VoiceRecorder.tsx        # Hold-to-record mic button
│       ├── lib/
│       │   ├── api.ts                   # Backend API client
│       │   └── types.ts                 # Shared TypeScript types
│       ├── app.json                     # Expo config
│       ├── package.json
│       └── tsconfig.json
│
├── package.json                         # Root workspace config
├── turbo.json                           # Turborepo task config
└── tools/                               # Existing CLI POCs (reference only)
    ├── grailed/
    └── depop/
```

---

## Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json` (root)
- Create: `turbo.json`
- Create: `apps/server/package.json`
- Create: `apps/server/next.config.ts`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/app/layout.ts`
- Create: `apps/mobile/package.json`
- Create: `apps/mobile/app.json`
- Create: `apps/mobile/tsconfig.json`
- Create: `apps/mobile/app/_layout.tsx`

- [ ] **Step 1: Create root package.json with workspaces**

```json
{
  "name": "vibelyster",
  "private": true,
  "workspaces": ["apps/*"],
  "scripts": {
    "dev:server": "turbo run dev --filter=@vibelyster/server",
    "dev:mobile": "turbo run dev --filter=@vibelyster/mobile",
    "build": "turbo run build",
    "lint": "turbo run lint"
  },
  "devDependencies": {
    "turbo": "^2.5.0",
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 2: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {}
  }
}
```

- [ ] **Step 3: Create Next.js server app**

`apps/server/package.json`:
```json
{
  "name": "@vibelyster/server",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@neondatabase/serverless": "^0.10.0",
    "@clerk/nextjs": "^6.0.0",
    "ai": "^6.0.0",
    "@ai-sdk/gateway": "^1.0.0",
    "@vercel/blob": "^0.27.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "typescript": "^5.8.0"
  }
}
```

`apps/server/next.config.ts`:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [],
};

export default nextConfig;
```

`apps/server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": { "@/*": ["./*"] }
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

`apps/server/app/layout.ts`:
```ts
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

- [ ] **Step 4: Create Expo mobile app**

`apps/mobile/package.json`:
```json
{
  "name": "@vibelyster/mobile",
  "version": "0.1.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "dev": "expo start",
    "build:ios": "eas build --platform ios",
    "prebuild": "expo prebuild"
  },
  "dependencies": {
    "expo": "~53.0.0",
    "expo-router": "~5.0.0",
    "expo-camera": "~16.0.0",
    "expo-av": "~15.0.0",
    "expo-image-picker": "~16.0.0",
    "react": "^19.0.0",
    "react-native": "~0.78.0",
    "react-native-webview": "^14.0.0",
    "@clerk/clerk-expo": "^3.0.0",
    "react-native-safe-area-context": "^5.0.0",
    "react-native-screens": "^4.0.0",
    "@expo/vector-icons": "^14.0.0",
    "expo-secure-store": "~14.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "typescript": "^5.8.0"
  }
}
```

`apps/mobile/app.json`:
```json
{
  "expo": {
    "name": "VibeLyster",
    "slug": "vibelyster",
    "version": "0.1.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "vibelyster",
    "userInterfaceStyle": "dark",
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.vibelyster.app",
      "infoPlist": {
        "NSCameraUsageDescription": "Take photos of items to list",
        "NSMicrophoneUsageDescription": "Record voice descriptions of items",
        "NSPhotoLibraryUsageDescription": "Select photos of items to list"
      }
    },
    "plugins": [
      "expo-router",
      "expo-camera",
      "expo-av",
      "expo-image-picker",
      "expo-secure-store"
    ]
  }
}
```

`apps/mobile/tsconfig.json`:
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": { "@/*": ["./*"] }
  }
}
```

`apps/mobile/app/_layout.tsx`:
```tsx
import { Slot } from "expo-router";

export default function RootLayout() {
  return <Slot />;
}
```

- [ ] **Step 5: Install dependencies and verify**

Run:
```bash
cd /Users/murphy/conductor/workspaces/VibeLyster/perth && npm install
cd apps/server && npx next build 2>&1 | head -5
cd ../mobile && npx expo doctor
```

Expected: no install errors, Next.js builds, Expo doctor reports no issues.

- [ ] **Step 6: Commit**

```bash
git add package.json turbo.json apps/
git commit -m "feat: scaffold Turborepo monorepo with Next.js server + Expo mobile app"
```

---

## Task 2: Database Schema + Migrations

**Files:**
- Create: `apps/server/lib/schema.sql`
- Create: `apps/server/lib/db.ts`

- [ ] **Step 1: Write database schema**

`apps/server/lib/schema.sql`:
```sql
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
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price NUMERIC NOT NULL,
  size TEXT,
  condition TEXT,
  brand TEXT,
  category TEXT,
  traits JSONB DEFAULT '{}',
  photos JSONB NOT NULL DEFAULT '[]',
  voice_transcript TEXT,
  ai_raw_response JSONB,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Platform-specific listing records
CREATE TABLE platform_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('grailed', 'depop', 'ebay')),
  platform_listing_id TEXT,
  platform_data JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'publishing', 'live', 'failed', 'sold', 'delisted')),
  last_error TEXT,
  attempt_count INTEGER DEFAULT 0,
  idempotency_key TEXT UNIQUE,
  published_at TIMESTAMPTZ,
  delisted_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  UNIQUE (listing_id, platform)
);

CREATE INDEX idx_listings_user ON listings(user_id) WHERE status = 'active';
CREATE INDEX idx_platform_listings_listing ON platform_listings(listing_id);
CREATE INDEX idx_marketplace_connections_user ON marketplace_connections(user_id);
```

- [ ] **Step 2: Create database client**

`apps/server/lib/db.ts`:
```ts
import { neon } from "@neondatabase/serverless";

export function getDb() {
  return neon(process.env.DATABASE_URL!);
}

export type DbUser = {
  id: string;
  clerk_id: string;
  email: string;
  created_at: string;
};

export type DbListing = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  price: number;
  size: string | null;
  condition: string | null;
  brand: string | null;
  category: string | null;
  traits: Record<string, string>;
  photos: string[];
  voice_transcript: string | null;
  ai_raw_response: unknown;
  status: "active" | "deleted";
  created_at: string;
  updated_at: string;
};

export type DbPlatformListing = {
  id: string;
  listing_id: string;
  platform: "grailed" | "depop" | "ebay";
  platform_listing_id: string | null;
  platform_data: Record<string, unknown>;
  status: "pending" | "publishing" | "live" | "failed" | "sold" | "delisted";
  last_error: string | null;
  attempt_count: number;
  idempotency_key: string | null;
  published_at: string | null;
  delisted_at: string | null;
  last_synced_at: string | null;
};

export type DbMarketplaceConnection = {
  id: string;
  user_id: string;
  platform: "grailed" | "depop" | "ebay";
  encrypted_tokens: Record<string, string>;
  platform_username: string | null;
  connected_at: string;
  expires_at: string | null;
};
```

- [ ] **Step 3: Run schema against Neon**

Run:
```bash
# Requires DATABASE_URL in .env.local (from `vercel env pull` after Neon provisioned)
cd apps/server && psql $DATABASE_URL -f lib/schema.sql
```

Expected: tables created without errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/lib/schema.sql apps/server/lib/db.ts
git commit -m "feat: add Neon Postgres schema and database client"
```

---

## Task 3: Listing CRUD API

**Depends on:** Task 1, Task 2

**Files:**
- Create: `apps/server/lib/auth.ts`
- Create: `apps/server/app/api/listings/route.ts`
- Create: `apps/server/app/api/listings/[id]/route.ts`

- [ ] **Step 1: Create Clerk auth helper**

`apps/server/lib/auth.ts`:
```ts
import { createClerkClient } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { getDb } from "./db";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

/**
 * Authenticate via Bearer token (mobile app sends Clerk JWT in Authorization header).
 * Does NOT use cookie-based auth() since the client is a React Native app, not a browser.
 */
export async function getAuthenticatedUser() {
  const headersList = await headers();
  const authHeader = headersList.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Unauthorized: missing Bearer token");
  }

  const token = authHeader.slice(7);
  const { sub: clerkUserId } = await clerk.verifyToken(token);
  if (!clerkUserId) {
    throw new Error("Unauthorized: invalid token");
  }

  const sql = getDb();
  const rows = await sql`
    SELECT id, clerk_id, email FROM users WHERE clerk_id = ${clerkUserId}
  `;

  if (rows.length === 0) {
    // Auto-create user on first API call
    const newRows = await sql`
      INSERT INTO users (clerk_id, email)
      VALUES (${clerkUserId}, '')
      ON CONFLICT (clerk_id) DO UPDATE SET clerk_id = EXCLUDED.clerk_id
      RETURNING id, clerk_id, email
    `;
    return newRows[0] as { id: string; clerk_id: string; email: string };
  }

  return rows[0] as { id: string; clerk_id: string; email: string };
}
```

- [ ] **Step 2: Create listings list + create endpoint**

`apps/server/app/api/listings/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

// GET /api/listings — list all active listings with platform statuses
export async function GET() {
  const user = await getAuthenticatedUser();
  const sql = getDb();

  const rows = await sql`
    SELECT
      l.*,
      COALESCE(
        json_agg(
          json_build_object(
            'platform', pl.platform,
            'status', pl.status,
            'platform_listing_id', pl.platform_listing_id
          )
        ) FILTER (WHERE pl.id IS NOT NULL),
        '[]'
      ) AS platform_statuses
    FROM listings l
    LEFT JOIN platform_listings pl ON pl.listing_id = l.id
    WHERE l.user_id = ${user.id} AND l.status = 'active'
    GROUP BY l.id
    ORDER BY l.created_at DESC
  `;

  return NextResponse.json(rows);
}

// POST /api/listings — create a new draft listing
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const body = await req.json();
  const sql = getDb();

  const { title, description, price, size, condition, brand, category, traits, photos, voice_transcript, ai_raw_response } = body;

  const rows = await sql`
    INSERT INTO listings (user_id, title, description, price, size, condition, brand, category, traits, photos, voice_transcript, ai_raw_response)
    VALUES (${user.id}, ${title}, ${description}, ${price}, ${size}, ${condition}, ${brand}, ${category}, ${JSON.stringify(traits || {})}, ${JSON.stringify(photos || [])}, ${voice_transcript}, ${JSON.stringify(ai_raw_response)})
    RETURNING *
  `;

  return NextResponse.json(rows[0], { status: 201 });
}
```

- [ ] **Step 3: Create single listing GET/PUT/DELETE endpoint**

`apps/server/app/api/listings/[id]/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

// GET /api/listings/:id — get single listing with platform statuses
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthenticatedUser();
  const sql = getDb();

  const rows = await sql`
    SELECT
      l.*,
      COALESCE(
        json_agg(
          json_build_object(
            'id', pl.id,
            'platform', pl.platform,
            'status', pl.status,
            'platform_listing_id', pl.platform_listing_id,
            'last_error', pl.last_error,
            'attempt_count', pl.attempt_count,
            'published_at', pl.published_at,
            'last_synced_at', pl.last_synced_at
          )
        ) FILTER (WHERE pl.id IS NOT NULL),
        '[]'
      ) AS platform_statuses
    FROM listings l
    LEFT JOIN platform_listings pl ON pl.listing_id = l.id
    WHERE l.id = ${id} AND l.user_id = ${user.id} AND l.status = 'active'
    GROUP BY l.id
  `;

  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

// PUT /api/listings/:id — update listing fields
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthenticatedUser();
  const body = await req.json();
  const sql = getDb();

  const { title, description, price, size, condition, brand, category, traits } = body;

  const rows = await sql`
    UPDATE listings SET
      title = COALESCE(${title}, title),
      description = COALESCE(${description}, description),
      price = COALESCE(${price}, price),
      size = COALESCE(${size}, size),
      condition = COALESCE(${condition}, condition),
      brand = COALESCE(${brand}, brand),
      category = COALESCE(${category}, category),
      traits = COALESCE(${traits ? JSON.stringify(traits) : null}, traits),
      updated_at = now()
    WHERE id = ${id} AND user_id = ${user.id} AND status = 'active'
    RETURNING *
  `;

  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

// DELETE /api/listings/:id — soft delete (marks as deleted)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthenticatedUser();
  const sql = getDb();

  // Check no platform listings are live
  const liveCheck = await sql`
    SELECT COUNT(*) as count FROM platform_listings
    WHERE listing_id = ${id} AND status = 'live'
  `;
  if (Number(liveCheck[0].count) > 0) {
    return NextResponse.json({ error: "Delist from all platforms before deleting" }, { status: 400 });
  }

  const rows = await sql`
    UPDATE listings SET status = 'deleted', updated_at = now()
    WHERE id = ${id} AND user_id = ${user.id} AND status = 'active'
    RETURNING id
  `;

  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
```

- [ ] **Step 4: Test with curl**

```bash
# Start dev server
cd apps/server && npm run dev &

# Test create (will fail auth without Clerk — that's expected, verifies route loading)
curl -s -X POST http://localhost:3001/api/listings -H 'Content-Type: application/json' -d '{"title":"test"}' | head -1
```

Expected: 401 or Clerk auth error (proves route is wired up).

- [ ] **Step 5: Commit**

```bash
git add apps/server/lib/auth.ts apps/server/app/api/listings/
git commit -m "feat: add listing CRUD API routes with Clerk auth"
```

---

## Task 4: Marketplace Posting Module

**Depends on:** Task 1

**Files:**
- Create: `apps/server/lib/marketplace/types.ts`
- Create: `apps/server/lib/marketplace/grailed.ts`
- Create: `apps/server/lib/marketplace/depop.ts`

**Reference:** Port from `tools/grailed/grailed-api.js` and `tools/depop/depop-api.js`.

- [ ] **Step 1: Define shared marketplace types**

`apps/server/lib/marketplace/types.ts`:
```ts
export type Platform = "grailed" | "depop" | "ebay";

export type ListingInput = {
  title: string;
  description: string;
  price: number;
  size: string;
  condition: string;
  brand: string;
  category: string;
  traits: Record<string, string>;
  photos: string[]; // Vercel Blob URLs
};

export type GrailedTokens = {
  csrf_token: string;
  cookies: string;
};

export type DepopTokens = {
  access_token: string;
};

export type PublishResult = {
  success: boolean;
  platform_listing_id?: string;
  error?: string;
};

export type StatusResult = {
  status: "live" | "sold" | "delisted" | "not_found";
  raw?: unknown;
};
```

- [ ] **Step 2: Port Grailed API client to TypeScript**

`apps/server/lib/marketplace/grailed.ts`:
```ts
import type { GrailedTokens, ListingInput, PublishResult, StatusResult } from "./types";

const GRAILED_BASE = "https://www.grailed.com";
const GRAILED_API = `${GRAILED_BASE}/api`;

function makeHeaders(csrfToken: string) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-api-version": "application/grailed.api.v1",
    "x-csrf-token": csrfToken,
  };
}

async function apiFetch(url: string, options: RequestInit & { cookies?: string } = {}) {
  const { cookies, ...fetchOptions } = options;
  if (cookies) {
    fetchOptions.headers = { ...fetchOptions.headers as Record<string, string>, Cookie: cookies };
  }
  const res = await fetch(url, fetchOptions);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Grailed API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function uploadImage(imageUrl: string, tokens: GrailedTokens): Promise<string> {
  // 1. Get presigned URL
  const { data } = await apiFetch(`${GRAILED_API}/listings/photo_upload_urls`, {
    method: "POST",
    headers: makeHeaders(tokens.csrf_token),
    cookies: tokens.cookies,
    body: JSON.stringify({ filename: "photo.jpg" }),
  });

  // 2. Fetch image from Vercel Blob and upload to S3
  const imageRes = await fetch(imageUrl);
  const imageBlob = await imageRes.blob();

  const formData = new FormData();
  for (const [key, val] of Object.entries(data.fields)) {
    formData.append(key, val as string);
  }
  formData.append("file", imageBlob, "photo.jpg");

  await fetch(data.url, { method: "POST", body: formData });

  return `${data.url}${data.fields.key}`;
}

export async function createDraftAndPublish(
  input: ListingInput,
  tokens: GrailedTokens
): Promise<PublishResult> {
  try {
    // Upload images
    const photoUrls = await Promise.all(
      input.photos.map((url) => uploadImage(url, tokens))
    );

    // Create draft
    const draftPayload = {
      listing: {
        title: input.title,
        description: input.description,
        price: Number(input.price),
        category: input.category,
        size: input.size,
        condition: input.condition,
        designer_names: input.brand,
        photos: photoUrls.map((url) => ({ url, rotate: 0 })),
        make_offer: true,
        buy_now: true,
        traits: input.traits,
      },
    };

    const draft = await apiFetch(`${GRAILED_API}/listings/drafts`, {
      method: "POST",
      headers: makeHeaders(tokens.csrf_token),
      cookies: tokens.cookies,
      body: JSON.stringify(draftPayload),
    });

    // Publish draft
    const draftId = draft.data?.id || draft.id;
    const publishPayload = {
      id: draftId,
      listing: {
        ...draftPayload.listing,
        price: String(input.price),
        makeoffer: true,
        buynow: true,
      },
    };

    // Get return address
    const addresses = await apiFetch(`${GRAILED_API}/addresses`, {
      headers: makeHeaders(tokens.csrf_token),
      cookies: tokens.cookies,
    });
    const addressId = addresses.data?.[0]?.id;
    if (addressId) {
      (publishPayload.listing as Record<string, unknown>).return_address_id = addressId;
    }

    const result = await apiFetch(`${GRAILED_API}/listings/drafts/${draftId}/publish`, {
      method: "PUT",
      headers: { ...makeHeaders(tokens.csrf_token), "accept-version": "v1" },
      cookies: tokens.cookies,
      body: JSON.stringify(publishPayload),
    });

    return {
      success: true,
      platform_listing_id: String(result.data?.id || result.id),
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function deleteListing(listingId: string, tokens: GrailedTokens): Promise<boolean> {
  try {
    await apiFetch(`${GRAILED_API}/listings/${listingId}`, {
      method: "DELETE",
      headers: makeHeaders(tokens.csrf_token),
      cookies: tokens.cookies,
    });
    return true;
  } catch {
    return false;
  }
}

export async function getListingStatus(listingId: string): Promise<StatusResult> {
  try {
    // Public endpoint, no auth needed
    const res = await fetch(`${GRAILED_API}/listings/${listingId}`);
    if (!res.ok) return { status: "not_found" };
    const data = await res.json();
    const listing = data.data || data;
    if (listing.sold) return { status: "sold", raw: listing };
    if (listing.deleted) return { status: "delisted", raw: listing };
    return { status: "live", raw: listing };
  } catch {
    return { status: "not_found" };
  }
}
```

- [ ] **Step 3: Port Depop API client to TypeScript**

`apps/server/lib/marketplace/depop.ts`:
```ts
import type { DepopTokens, ListingInput, PublishResult, StatusResult } from "./types";

const DEPOP_API = "https://webapi.depop.com";

// Use dynamic import for impit — may not be available in all environments
async function getImpit() {
  const { Impit } = await import("impit");
  return new Impit({ browser: "chrome" });
}

function makeHeaders(accessToken: string) {
  return {
    Accept: "*/*",
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    Origin: "https://www.depop.com",
    Referer: "https://www.depop.com/",
  };
}

async function apiFetch(url: string, options: RequestInit = {}) {
  const impit = await getImpit();
  const res = await impit.fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Depop API ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function resolveUserId(accessToken: string): Promise<string> {
  const data = await apiFetch(`${DEPOP_API}/api/v1/addresses/`, {
    headers: makeHeaders(accessToken),
  });
  return String(data[0]?.userId || data.userId);
}

export async function uploadImage(imageUrl: string, tokens: DepopTokens): Promise<string> {
  // 1. Get presigned URL
  const presigned = await apiFetch(`${DEPOP_API}/api/v1/photos/presigned-url/`, {
    method: "POST",
    headers: makeHeaders(tokens.access_token),
    body: JSON.stringify({ content_type: "image/jpeg" }),
  });

  // 2. Fetch image and upload to S3
  const imageRes = await fetch(imageUrl);
  const imageBuffer = await imageRes.arrayBuffer();

  const impit = await getImpit();
  await impit.fetch(presigned.url, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: new Uint8Array(imageBuffer),
  });

  return presigned.key || presigned.url.split("?")[0];
}

export async function createDraftAndPublish(
  input: ListingInput,
  tokens: DepopTokens
): Promise<PublishResult> {
  try {
    const userId = await resolveUserId(tokens.access_token);

    // Upload images
    const photoKeys = await Promise.all(
      input.photos.map((url) => uploadImage(url, tokens))
    );

    // Create draft
    const draftPayload = {
      description: `${input.title}\n\n${input.description}`,
      priceAmount: String(input.price),
      priceCurrency: "USD",
      brand: input.brand,
      condition: input.condition,
      productType: input.category,
      pictures: photoKeys.map((key) => ({ key })),
      shippingMethods: [{ method: "USPS", price: "0" }],
      size: input.size,
    };

    const draft = await apiFetch(
      `${DEPOP_API}/api/v3/users/${userId}/selling/drafts/`,
      {
        method: "POST",
        headers: makeHeaders(tokens.access_token),
        body: JSON.stringify(draftPayload),
      }
    );

    const draftId = draft.id || draft.slug;

    // Publish draft (update + mark as published)
    const published = await apiFetch(
      `${DEPOP_API}/api/v3/users/${userId}/selling/drafts/${draftId}/`,
      {
        method: "PUT",
        headers: makeHeaders(tokens.access_token),
        body: JSON.stringify({ ...draftPayload, published: true }),
      }
    );

    return {
      success: true,
      platform_listing_id: String(published.slug || published.id || draftId),
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function deleteListing(slug: string, tokens: DepopTokens): Promise<boolean> {
  try {
    await apiFetch(`${DEPOP_API}/api/v2/products/${slug}/`, {
      method: "DELETE",
      headers: makeHeaders(tokens.access_token),
    });
    return true;
  } catch {
    return false;
  }
}

export async function getListingStatus(slug: string): Promise<StatusResult> {
  try {
    const res = await fetch(`${DEPOP_API}/api/v2/products/${slug}/`);
    if (!res.ok) return { status: "not_found" };
    const data = await res.json();
    if (data.status === "sold") return { status: "sold", raw: data };
    if (data.status === "deleted") return { status: "delisted", raw: data };
    return { status: "live", raw: data };
  } catch {
    return { status: "not_found" };
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/lib/marketplace/
git commit -m "feat: add Grailed and Depop marketplace posting modules (ported from CLIs)"
```

---

## Task 5: AI Generation Pipeline

**Depends on:** Task 1, Task 2

**Files:**
- Create: `apps/server/lib/ai.ts`
- Create: `apps/server/app/api/generate/route.ts`

- [ ] **Step 1: Create AI pipeline module**

`apps/server/lib/ai.ts`:
```ts
import { generateText, Output } from "ai";
import { z } from "zod";

const ListingSchema = z.object({
  title: z.string().describe("Concise listing title (brand + item + key details)"),
  description: z.string().describe("Detailed listing description optimized for search"),
  price: z.number().describe("Price in USD"),
  size: z.string().describe("Size (e.g. S, M, L, XL, 32, 10, One Size)"),
  condition: z.string().describe("Condition: is_new, is_gently_used, is_used, is_worn"),
  brand: z.string().describe("Brand name"),
  category: z.string().describe("Clothing category"),
  traits: z.record(z.string()).describe("Additional traits like color, material, style"),
});

export type GeneratedListing = z.infer<typeof ListingSchema>;

function isTranscriptComplete(transcript: string): boolean {
  const lower = transcript.toLowerCase();
  const hasBrand = /\b(nike|adidas|supreme|cdg|comme|gucci|prada|vintage|rl|ralph|rrl|carhartt|stussy|palace|jordan|yeezy|new balance)\b/i.test(lower);
  const hasPrice = /\$?\d+/.test(lower);
  const hasCondition = /(new|used|worn|gently|deadstock|ds|nwt|mint|vnds|9\/10|8\/10|10\/10)/i.test(lower);
  return hasBrand && hasPrice && hasCondition;
}

export async function transcribeAudio(audioBuffer: ArrayBuffer): Promise<string> {
  const file = new File([audioBuffer], "voice.webm", { type: "audio/webm" });
  // Use OpenAI Whisper via AI Gateway (OIDC auth, no direct API keys)
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", "whisper-1");

  // AI Gateway proxies the request — OIDC token from `vercel env pull`
  const res = await fetch("https://gateway.vercel.ai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.VERCEL_OIDC_TOKEN}` },
    body: formData,
  });

  const data = await res.json();
  return data.text;
}

export async function generateListing(
  transcript: string,
  photoUrls: string[]
): Promise<GeneratedListing> {
  const useVision = !isTranscriptComplete(transcript) && photoUrls.length > 0;

  const systemPrompt = `You are an expert reseller listing generator. Generate a marketplace listing from the seller's voice description${useVision ? " and item photos" : ""}. Be accurate, specific, and SEO-optimized. Use the exact brand names, not abbreviations. Match condition to: is_new, is_gently_used, is_used, is_worn.`;

  const userContent: Array<{ type: string; text?: string; image?: string }> = [
    { type: "text", text: `Seller's description: "${transcript}"` },
  ];

  if (useVision) {
    for (const url of photoUrls.slice(0, 4)) {
      userContent.push({ type: "image", image: url });
    }
  }

  const result = await generateText({
    model: "anthropic/claude-sonnet-4.6",
    system: systemPrompt,
    messages: [{ role: "user", content: userContent as never }],
    output: Output.object({ schema: ListingSchema }),
  });

  return result.object;
}
```

- [ ] **Step 2: Create generate API route**

`apps/server/app/api/generate/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { transcribeAudio, generateListing } from "@/lib/ai";
import { put } from "@vercel/blob";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const formData = await req.formData();

  // Extract audio file
  const audioFile = formData.get("audio") as File | null;
  if (!audioFile) {
    return NextResponse.json({ error: "Audio file required" }, { status: 400 });
  }

  // Extract photos (already uploaded to Vercel Blob, URLs passed)
  const photoUrls = formData.getAll("photos") as string[];

  // 1. Transcribe voice
  const audioBuffer = await audioFile.arrayBuffer();
  const transcript = await transcribeAudio(audioBuffer);

  // 2. Generate listing with AI
  const generated = await generateListing(transcript, photoUrls);

  // 3. Save as draft
  const sql = getDb();
  const rows = await sql`
    INSERT INTO listings (user_id, title, description, price, size, condition, brand, category, traits, photos, voice_transcript, ai_raw_response)
    VALUES (
      ${user.id},
      ${generated.title},
      ${generated.description},
      ${generated.price},
      ${generated.size},
      ${generated.condition},
      ${generated.brand},
      ${generated.category},
      ${JSON.stringify(generated.traits)},
      ${JSON.stringify(photoUrls)},
      ${transcript},
      ${JSON.stringify(generated)}
    )
    RETURNING *
  `;

  return NextResponse.json(rows[0], { status: 201 });
}
```

- [ ] **Step 3: Add `zod` and `impit` to server dependencies**

Update `apps/server/package.json` to add:
```json
"dependencies": {
  "zod": "^3.24.0",
  "impit": "^0.13.0"
}
```

Run: `cd apps/server && npm install`

- [ ] **Step 4: Commit**

```bash
git add apps/server/lib/ai.ts apps/server/app/api/generate/ apps/server/package.json
git commit -m "feat: add AI generation pipeline (Whisper + vision model + structured output)"
```

---

## Task 6: Mobile App Shell + Clerk Auth

**Depends on:** Task 1

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`
- Create: `apps/mobile/app/sign-in.tsx`
- Create: `apps/mobile/lib/api.ts`
- Create: `apps/mobile/lib/types.ts`

- [ ] **Step 1: Create shared types**

`apps/mobile/lib/types.ts`:
```ts
export type Platform = "grailed" | "depop" | "ebay";

export type PlatformStatus = {
  platform: Platform;
  status: "pending" | "publishing" | "live" | "failed" | "sold" | "delisted";
  platform_listing_id: string | null;
  last_error?: string | null;
};

export type Listing = {
  id: string;
  title: string;
  description: string;
  price: number;
  size: string | null;
  condition: string | null;
  brand: string | null;
  category: string | null;
  traits: Record<string, string>;
  photos: string[];
  voice_transcript: string | null;
  status: string;
  platform_statuses: PlatformStatus[];
  created_at: string;
  updated_at: string;
};

export type MarketplaceConnection = {
  id: string;
  platform: Platform;
  platform_username: string | null;
  connected_at: string;
};
```

- [ ] **Step 2: Create API client**

`apps/mobile/lib/api.ts`:
```ts
import { useAuth } from "@clerk/clerk-expo";
import type { Listing, MarketplaceConnection } from "./types";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001";

async function apiFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

export function useApi() {
  const { getToken } = useAuth();

  async function getAuthToken() {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");
    return token;
  }

  return {
    async getListings(): Promise<Listing[]> {
      return apiFetch("/api/listings", await getAuthToken());
    },

    async getListing(id: string): Promise<Listing> {
      return apiFetch(`/api/listings/${id}`, await getAuthToken());
    },

    async updateListing(id: string, data: Partial<Listing>): Promise<Listing> {
      return apiFetch(`/api/listings/${id}`, await getAuthToken(), {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },

    async deleteListing(id: string): Promise<void> {
      await apiFetch(`/api/listings/${id}`, await getAuthToken(), { method: "DELETE" });
    },

    async generateListing(formData: FormData): Promise<Listing> {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/api/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error(`Generate failed: ${res.status}`);
      return res.json();
    },

    async publish(listingId: string, platforms: string[]): Promise<void> {
      await apiFetch("/api/publish", await getAuthToken(), {
        method: "POST",
        body: JSON.stringify({ listing_id: listingId, platforms }),
      });
    },

    async delist(listingId: string, platform: string): Promise<void> {
      await apiFetch("/api/delist", await getAuthToken(), {
        method: "POST",
        body: JSON.stringify({ listing_id: listingId, platform }),
      });
    },

    async getConnections(): Promise<MarketplaceConnection[]> {
      return apiFetch("/api/connections", await getAuthToken());
    },

    async connect(platform: string, tokens: Record<string, string>): Promise<void> {
      await apiFetch("/api/connect", await getAuthToken(), {
        method: "POST",
        body: JSON.stringify({ platform, tokens }),
      });
    },

    async disconnect(platform: string): Promise<void> {
      await apiFetch("/api/connect", await getAuthToken(), {
        method: "DELETE",
        body: JSON.stringify({ platform }),
      });
    },

    async syncStatus(listingId: string): Promise<Listing> {
      return apiFetch(`/api/status/${listingId}`, await getAuthToken());
    },

    async bulkPublish(listingIds: string[], platforms: string[]): Promise<void> {
      await apiFetch("/api/publish/bulk", await getAuthToken(), {
        method: "POST",
        body: JSON.stringify({ listing_ids: listingIds, platforms }),
      });
    },
  };
}
```

- [ ] **Step 3: Set up Clerk provider and root layout**

`apps/mobile/app/_layout.tsx`:
```tsx
import { ClerkProvider, ClerkLoaded, useAuth } from "@clerk/clerk-expo";
import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import * as SecureStore from "expo-secure-store";

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

function AuthGate() {
  const { isSignedIn, isLoaded } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    const inAuthGroup = segments[0] === "sign-in";

    if (!isSignedIn && !inAuthGroup) {
      router.replace("/sign-in");
    } else if (isSignedIn && inAuthGroup) {
      router.replace("/");
    }
  }, [isSignedIn, isLoaded, segments]);

  return <Slot />;
}

export default function RootLayout() {
  return (
    <ClerkProvider
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      tokenCache={tokenCache}
    >
      <ClerkLoaded>
        <AuthGate />
      </ClerkLoaded>
    </ClerkProvider>
  );
}
```

- [ ] **Step 4: Create sign-in screen**

`apps/mobile/app/sign-in.tsx`:
```tsx
import { useSignIn, useSignUp } from "@clerk/clerk-expo";
import { View, Text, Pressable, StyleSheet } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";

export default function SignInScreen() {
  const { signIn, setActive } = useSignIn();
  const { signUp, setActive: setSignUpActive } = useSignUp();

  async function handleAppleSignIn() {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) return;

      // Try sign-in first
      const signInAttempt = await signIn!.create({
        strategy: "oauth_apple",
        redirectUrl: "vibelyster://oauth-callback",
      });

      if (signInAttempt.status === "complete") {
        await setActive!({ session: signInAttempt.createdSessionId });
      }
    } catch (err) {
      console.error("Apple sign-in error:", err);
    }
  }

  async function handleGoogleSignIn() {
    try {
      const signInAttempt = await signIn!.create({
        strategy: "oauth_google",
        redirectUrl: "vibelyster://oauth-callback",
      });

      const { externalVerificationRedirectURL } = signInAttempt.firstFactorVerification;
      // Clerk handles the OAuth redirect flow
      if (signInAttempt.status === "complete") {
        await setActive!({ session: signInAttempt.createdSessionId });
      }
    } catch (err) {
      console.error("Google sign-in error:", err);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>VibeLyster</Text>
      <Text style={styles.subtitle}>List faster. Sell smarter.</Text>

      <Pressable style={styles.appleButton} onPress={handleAppleSignIn}>
        <Text style={styles.appleButtonText}>Sign in with Apple</Text>
      </Pressable>

      <Pressable style={styles.googleButton} onPress={handleGoogleSignIn}>
        <Text style={styles.googleButtonText}>Sign in with Google</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000", padding: 24, gap: 12 },
  title: { fontSize: 36, fontWeight: "bold", color: "#fff", marginBottom: 8 },
  subtitle: { fontSize: 16, color: "#888", marginBottom: 48 },
  appleButton: { backgroundColor: "#fff", paddingVertical: 16, paddingHorizontal: 32, borderRadius: 12, width: "100%" },
  appleButtonText: { color: "#000", fontSize: 18, fontWeight: "600", textAlign: "center" },
  googleButton: { backgroundColor: "#111", paddingVertical: 16, paddingHorizontal: 32, borderRadius: 12, width: "100%", borderWidth: 1, borderColor: "#333" },
  googleButtonText: { color: "#fff", fontSize: 18, fontWeight: "600", textAlign: "center" },
});
```

- [ ] **Step 5: Add expo-apple-authentication dependency**

Update `apps/mobile/package.json` to add `expo-apple-authentication` to dependencies and plugins:
```json
"dependencies": {
  "expo-apple-authentication": "~7.0.0"
}
```

Add to `app.json` plugins: `"expo-apple-authentication"`

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/
git commit -m "feat: add mobile app shell with Clerk auth and API client"
```

---

## Task 7: Dashboard Screen

**Depends on:** Task 6

**Files:**
- Create: `apps/mobile/app/(tabs)/_layout.tsx`
- Create: `apps/mobile/app/(tabs)/index.tsx`
- Create: `apps/mobile/components/ListingCard.tsx`

- [ ] **Step 1: Create tab navigator layout**

`apps/mobile/app/(tabs)/_layout.tsx`:
```tsx
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: { backgroundColor: "#000", borderTopColor: "#222" },
        tabBarActiveTintColor: "#fff",
        tabBarInactiveTintColor: "#666",
        headerStyle: { backgroundColor: "#000" },
        headerTintColor: "#fff",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Listings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
```

- [ ] **Step 2: Create ListingCard component**

`apps/mobile/components/ListingCard.tsx`:
```tsx
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import type { Listing, Platform } from "@/lib/types";

const PLATFORM_COLORS: Record<string, string> = {
  live: "#22c55e",
  publishing: "#f59e0b",
  failed: "#ef4444",
  sold: "#3b82f6",
  delisted: "#6b7280",
  pending: "#6b7280",
};

type Props = {
  listing: Listing;
  onPress: () => void;
  selected?: boolean;
  selectionMode?: boolean;
  onToggleSelect?: () => void;
};

export default function ListingCard({ listing, onPress, selected, selectionMode, onToggleSelect }: Props) {
  const derivedStatus = getDerivedStatus(listing);

  return (
    <Pressable
      style={[styles.card, selected && styles.cardSelected]}
      onPress={selectionMode ? onToggleSelect : onPress}
      onLongPress={onToggleSelect}
    >
      {listing.photos[0] && (
        <Image source={{ uri: listing.photos[0] }} style={styles.thumbnail} />
      )}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{listing.title}</Text>
        <Text style={styles.price}>${listing.price}</Text>
        <View style={styles.statusRow}>
          {listing.platform_statuses.map((ps) => (
            <View
              key={ps.platform}
              style={[styles.dot, { backgroundColor: PLATFORM_COLORS[ps.status] }]}
            />
          ))}
          {listing.platform_statuses.length === 0 && (
            <Text style={styles.draft}>Draft</Text>
          )}
        </View>
      </View>
      {selectionMode && (
        <View style={[styles.checkbox, selected && styles.checkboxSelected]} />
      )}
    </Pressable>
  );
}

function getDerivedStatus(listing: Listing): string {
  const statuses = listing.platform_statuses.map((ps) => ps.status);
  if (statuses.includes("sold")) return "sold";
  if (statuses.includes("live")) return "live";
  if (statuses.includes("publishing")) return "publishing";
  if (statuses.includes("failed")) return "failed";
  return "draft";
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", backgroundColor: "#111", borderRadius: 12, marginBottom: 8, padding: 12, gap: 12 },
  cardSelected: { borderWidth: 2, borderColor: "#fff" },
  thumbnail: { width: 64, height: 64, borderRadius: 8 },
  info: { flex: 1, justifyContent: "center" },
  title: { color: "#fff", fontSize: 16, fontWeight: "600" },
  price: { color: "#aaa", fontSize: 14, marginTop: 2 },
  statusRow: { flexDirection: "row", gap: 4, marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  draft: { color: "#666", fontSize: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#444", alignSelf: "center" },
  checkboxSelected: { backgroundColor: "#fff", borderColor: "#fff" },
});
```

- [ ] **Step 3: Create dashboard screen**

`apps/mobile/app/(tabs)/index.tsx`:
```tsx
import { useState, useCallback } from "react";
import { View, FlatList, Pressable, Text, StyleSheet } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/lib/api";
import ListingCard from "@/components/ListingCard";
import type { Listing } from "@/lib/types";

type Filter = "all" | "draft" | "live" | "sold";

export default function Dashboard() {
  const router = useRouter();
  const api = useApi();
  const [listings, setListings] = useState<Listing[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadListings();
    }, [])
  );

  async function loadListings() {
    setLoading(true);
    try {
      const data = await api.getListings();
      setListings(data);
    } catch (err) {
      console.error("Failed to load listings:", err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = listings.filter((l) => {
    if (filter === "all") return true;
    const statuses = l.platform_statuses.map((ps) => ps.status);
    if (filter === "draft") return statuses.length === 0;
    if (filter === "live") return statuses.includes("live");
    if (filter === "sold") return statuses.includes("sold");
    return true;
  });

  function toggleSelect(id: string) {
    setSelectionMode(true);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  return (
    <View style={styles.container}>
      {/* Filter tabs */}
      <View style={styles.filters}>
        {(["all", "draft", "live", "sold"] as Filter[]).map((f) => (
          <Pressable
            key={f}
            style={[styles.filterTab, filter === f && styles.filterActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Selection toolbar */}
      {selectionMode && (
        <View style={styles.selectionBar}>
          <Pressable onPress={exitSelection}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.selectedCount}>{selectedIds.size} selected</Text>
          <Pressable
            onPress={() => {
              // Navigate to bulk publish — handled in Task 12
            }}
            style={styles.bulkButton}
          >
            <Text style={styles.bulkButtonText}>Publish {selectedIds.size}</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            onPress={() => router.push(`/listing/${item.id}`)}
            selected={selectedIds.has(item.id)}
            selectionMode={selectionMode}
            onToggleSelect={() => toggleSelect(item.id)}
          />
        )}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={loadListings}
      />

      {/* FAB */}
      {!selectionMode && (
        <Pressable style={styles.fab} onPress={() => router.push("/capture")}>
          <Ionicons name="add" size={32} color="#000" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  filters: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  filterTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: "#111" },
  filterActive: { backgroundColor: "#fff" },
  filterText: { color: "#888", fontSize: 14 },
  filterTextActive: { color: "#000" },
  selectionBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "#111" },
  cancelText: { color: "#888", fontSize: 14 },
  selectedCount: { color: "#fff", fontSize: 14 },
  bulkButton: { backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  bulkButtonText: { color: "#000", fontWeight: "600" },
  list: { padding: 16 },
  fab: { position: "absolute", bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: "#fff", justifyContent: "center", alignItems: "center" },
});
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/\(tabs\)/ apps/mobile/components/ListingCard.tsx
git commit -m "feat: add dashboard screen with filter tabs, selection mode, and FAB"
```

---

## Task 8: Capture Flow

**Depends on:** Task 7

**Files:**
- Create: `apps/mobile/app/capture.tsx`
- Create: `apps/mobile/components/VoiceRecorder.tsx`

- [ ] **Step 1: Create VoiceRecorder component**

`apps/mobile/components/VoiceRecorder.tsx`:
```tsx
import { useState, useRef } from "react";
import { Pressable, Text, StyleSheet, Animated } from "react-native";
import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  onRecordingComplete: (uri: string) => void;
};

export default function VoiceRecorder({ onRecordingComplete }: Props) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [duration, setDuration] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  async function startRecording() {
    await Audio.requestPermissionsAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    setRecording(recording);
    setDuration(0);

    intervalRef.current = setInterval(() => setDuration((d) => d + 1), 1000);

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();
  }

  async function stopRecording() {
    if (!recording) return;
    clearInterval(intervalRef.current);
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    setDuration(0);

    if (uri) onRecordingComplete(uri);
  }

  const mins = Math.floor(duration / 60);
  const secs = duration % 60;

  return (
    <Pressable
      onPressIn={startRecording}
      onPressOut={stopRecording}
      style={styles.container}
    >
      <Animated.View style={[styles.button, recording && styles.recording, { transform: [{ scale: pulseAnim }] }]}>
        <Ionicons name={recording ? "mic" : "mic-outline"} size={32} color={recording ? "#ef4444" : "#fff"} />
      </Animated.View>
      {recording ? (
        <Text style={styles.timer}>{mins}:{secs.toString().padStart(2, "0")}</Text>
      ) : (
        <Text style={styles.hint}>Hold to record</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", gap: 8 },
  button: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#222", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#333" },
  recording: { backgroundColor: "#1a0000", borderColor: "#ef4444" },
  timer: { color: "#ef4444", fontSize: 16, fontWeight: "600" },
  hint: { color: "#666", fontSize: 14 },
});
```

- [ ] **Step 2: Create capture screen**

`apps/mobile/app/capture.tsx`:
```tsx
import { useState } from "react";
import { View, Text, Pressable, Image, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import VoiceRecorder from "@/components/VoiceRecorder";
import { useApi } from "@/lib/api";

export default function CaptureScreen() {
  const router = useRouter();
  const api = useApi();
  const [photos, setPhotos] = useState<string[]>([]);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [newListingId, setNewListingId] = useState<string | null>(null);

  async function pickPhotos() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setPhotos((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
    }
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleGenerate() {
    if (!audioUri) return;
    setGenerating(true);

    try {
      // 1. Upload photos to Vercel Blob first (client upload)
      const blobUrls: string[] = [];
      for (const uri of photos) {
        const response = await fetch(uri);
        const blob = await response.blob();
        const uploadRes = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/upload`, {
          method: "POST",
          headers: { "Content-Type": blob.type || "image/jpeg" },
          body: blob,
        });
        const { url } = await uploadRes.json();
        blobUrls.push(url);
      }

      // 2. Send audio + blob URLs to generate endpoint
      const formData = new FormData();
      formData.append("audio", {
        uri: audioUri,
        type: "audio/m4a",
        name: "voice.m4a",
      } as never);

      // Pass Vercel Blob URLs (not local URIs)
      for (const url of blobUrls) {
        formData.append("photos", url);
      }

      const listing = await api.generateListing(formData);
      setNewListingId(listing.id);
    } catch (err) {
      console.error("Generate failed:", err);
    } finally {
      setGenerating(false);
    }
  }

  // Post-generation: show options
  if (newListingId) {
    return (
      <View style={styles.doneContainer}>
        <Ionicons name="checkmark-circle" size={64} color="#22c55e" />
        <Text style={styles.doneTitle}>Draft Saved</Text>
        <Text style={styles.doneSubtitle}>You can publish later from dashboard</Text>

        <View style={styles.doneActions}>
          <Pressable
            style={styles.newButton}
            onPress={() => {
              setPhotos([]);
              setAudioUri(null);
              setNewListingId(null);
            }}
          >
            <Ionicons name="add" size={20} color="#000" />
            <Text style={styles.newButtonText}>New Listing</Text>
          </Pressable>

          <Pressable
            style={styles.reviewButton}
            onPress={() => router.push(`/listing/${newListingId}`)}
          >
            <Text style={styles.reviewButtonText}>Review & Edit</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Photos section */}
        <Text style={styles.sectionTitle}>Photos</Text>
        <ScrollView horizontal style={styles.photoRow}>
          {photos.map((uri, i) => (
            <View key={i} style={styles.photoWrap}>
              <Image source={{ uri }} style={styles.photo} />
              <Pressable style={styles.removePhoto} onPress={() => removePhoto(i)}>
                <Ionicons name="close-circle" size={24} color="#ef4444" />
              </Pressable>
            </View>
          ))}
          <View style={styles.addPhotoButtons}>
            <Pressable style={styles.photoButton} onPress={takePhoto}>
              <Ionicons name="camera" size={28} color="#fff" />
              <Text style={styles.photoButtonText}>Camera</Text>
            </Pressable>
            <Pressable style={styles.photoButton} onPress={pickPhotos}>
              <Ionicons name="images" size={28} color="#fff" />
              <Text style={styles.photoButtonText}>Library</Text>
            </Pressable>
          </View>
        </ScrollView>

        {/* Voice section */}
        <Text style={styles.sectionTitle}>Voice Description</Text>
        <VoiceRecorder onRecordingComplete={setAudioUri} />
        {audioUri && (
          <View style={styles.audioStatus}>
            <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
            <Text style={styles.audioText}>Voice recorded</Text>
          </View>
        )}
      </ScrollView>

      {/* Generate button */}
      <Pressable
        style={[styles.generateButton, (!audioUri || generating) && styles.generateDisabled]}
        onPress={handleGenerate}
        disabled={!audioUri || generating}
      >
        {generating ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.generateText}>Generate Draft</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  content: { padding: 16, gap: 24 },
  sectionTitle: { color: "#fff", fontSize: 18, fontWeight: "600" },
  photoRow: { flexDirection: "row" },
  photoWrap: { position: "relative", marginRight: 8 },
  photo: { width: 100, height: 100, borderRadius: 8 },
  removePhoto: { position: "absolute", top: -8, right: -8 },
  addPhotoButtons: { flexDirection: "row", gap: 8 },
  photoButton: { width: 100, height: 100, borderRadius: 8, backgroundColor: "#222", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#333", borderStyle: "dashed" },
  photoButtonText: { color: "#888", fontSize: 12, marginTop: 4 },
  audioStatus: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  audioText: { color: "#22c55e", fontSize: 14 },
  generateButton: { backgroundColor: "#fff", margin: 16, paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  generateDisabled: { opacity: 0.4 },
  generateText: { color: "#000", fontSize: 18, fontWeight: "600" },
  doneContainer: { flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center", padding: 24, gap: 12 },
  doneTitle: { color: "#fff", fontSize: 24, fontWeight: "bold" },
  doneSubtitle: { color: "#888", fontSize: 16 },
  doneActions: { flexDirection: "row", gap: 12, marginTop: 32 },
  newButton: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff", paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12 },
  newButtonText: { color: "#000", fontSize: 16, fontWeight: "600" },
  reviewButton: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1, borderColor: "#444" },
  reviewButtonText: { color: "#fff", fontSize: 16 },
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/capture.tsx apps/mobile/components/VoiceRecorder.tsx
git commit -m "feat: add capture flow with camera, image picker, and voice recorder"
```

---

## Task 9: Draft Detail / Edit Screen

**Depends on:** Task 7

**Files:**
- Create: `apps/mobile/app/listing/[id].tsx`
- Create: `apps/mobile/components/PlatformRow.tsx`
- Create: `apps/mobile/components/PhotoCarousel.tsx`

- [ ] **Step 1: Create PhotoCarousel component**

`apps/mobile/components/PhotoCarousel.tsx`:
```tsx
import { FlatList, Image, Dimensions, StyleSheet } from "react-native";

const { width } = Dimensions.get("window");

type Props = { photos: string[] };

export default function PhotoCarousel({ photos }: Props) {
  return (
    <FlatList
      data={photos}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      keyExtractor={(_, i) => String(i)}
      renderItem={({ item }) => (
        <Image source={{ uri: item }} style={styles.image} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  image: { width, height: width, resizeMode: "cover" },
});
```

- [ ] **Step 2: Create PlatformRow component**

`apps/mobile/components/PlatformRow.tsx`:
```tsx
import { View, Text, Pressable, StyleSheet } from "react-native";
import type { PlatformStatus, MarketplaceConnection, Platform } from "@/lib/types";

type Props = {
  platform: Platform;
  platformStatus?: PlatformStatus;
  connection?: MarketplaceConnection;
  onPublish: () => void;
  onDelist: () => void;
  onConnect: () => void;
};

const PLATFORM_LABELS: Record<Platform, string> = {
  grailed: "Grailed",
  depop: "Depop",
  ebay: "eBay",
};

export default function PlatformRow({ platform, platformStatus, connection, onPublish, onDelist, onConnect }: Props) {
  const label = PLATFORM_LABELS[platform];
  const status = platformStatus?.status;

  if (!connection) {
    return (
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Pressable style={styles.connectButton} onPress={onConnect}>
          <Text style={styles.connectText}>Connect</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <View>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.username}>@{connection.platform_username}</Text>
      </View>

      {status === "live" && (
        <Pressable style={styles.delistButton} onPress={onDelist}>
          <Text style={styles.delistText}>Delist</Text>
        </Pressable>
      )}

      {status === "publishing" && (
        <Text style={styles.statusText}>Publishing...</Text>
      )}

      {status === "failed" && (
        <View style={styles.failedRow}>
          <Text style={styles.failedText}>Failed</Text>
          <Pressable style={styles.retryButton} onPress={onPublish}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {(!status || status === "pending" || status === "delisted") && (
        <Pressable style={styles.publishButton} onPress={onPublish}>
          <Text style={styles.publishText}>Publish</Text>
        </Pressable>
      )}

      {status === "sold" && <Text style={styles.soldText}>Sold</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#222" },
  label: { color: "#fff", fontSize: 16, fontWeight: "600" },
  username: { color: "#888", fontSize: 13, marginTop: 2 },
  connectButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#444" },
  connectText: { color: "#fff", fontSize: 14 },
  publishButton: { backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  publishText: { color: "#000", fontWeight: "600", fontSize: 14 },
  delistButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#ef4444" },
  delistText: { color: "#ef4444", fontWeight: "600", fontSize: 14 },
  statusText: { color: "#f59e0b", fontSize: 14 },
  failedRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  failedText: { color: "#ef4444", fontSize: 14 },
  retryButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: "#222" },
  retryText: { color: "#fff", fontSize: 13 },
  soldText: { color: "#3b82f6", fontSize: 14, fontWeight: "600" },
});
```

- [ ] **Step 3: Create listing detail screen**

`apps/mobile/app/listing/[id].tsx`:
```tsx
import { useState, useEffect } from "react";
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useApi } from "@/lib/api";
import PhotoCarousel from "@/components/PhotoCarousel";
import PlatformRow from "@/components/PlatformRow";
import type { Listing, MarketplaceConnection, Platform } from "@/lib/types";

const MVP_PLATFORMS: Platform[] = ["grailed", "depop"];

export default function ListingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const api = useApi();
  const [listing, setListing] = useState<Listing | null>(null);
  const [connections, setConnections] = useState<MarketplaceConnection[]>([]);
  const [editing, setEditing] = useState<Partial<Listing>>({});
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    const [listingData, connectionsData] = await Promise.all([
      api.getListing(id!),
      api.getConnections(),
    ]);
    setListing(listingData);
    setConnections(connectionsData);

    // Live sync on load
    setSyncing(true);
    try {
      const synced = await api.syncStatus(id!);
      setListing(synced);
    } catch {
      // Sync failed, keep stale data
    } finally {
      setSyncing(false);
    }
  }

  async function handleSave() {
    if (!listing || Object.keys(editing).length === 0) return;
    setSaving(true);
    try {
      const updated = await api.updateListing(listing.id, editing);
      setListing(updated);
      setEditing({});
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish(platform: Platform) {
    if (!listing) return;
    try {
      await api.publish(listing.id, [platform]);
      await loadData();
    } catch (err) {
      Alert.alert("Publish failed", (err as Error).message);
    }
  }

  async function handleDelist(platform: Platform) {
    Alert.alert("Delist", `Remove from ${platform}?`, [
      { text: "Cancel" },
      {
        text: "Delist", style: "destructive",
        onPress: async () => {
          await api.delist(listing!.id, platform);
          await loadData();
        },
      },
    ]);
  }

  async function handlePublishAll() {
    if (!listing) return;
    const connected = MVP_PLATFORMS.filter((p) =>
      connections.some((c) => c.platform === p)
    );
    await api.publish(listing.id, connected);
    await loadData();
  }

  async function handleDelete() {
    const hasLive = listing?.platform_statuses.some((ps) => ps.status === "live");
    if (hasLive) {
      Alert.alert("Cannot delete", "Delist from all platforms before deleting");
      return;
    }
    Alert.alert("Delete listing?", "This cannot be undone.", [
      { text: "Cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await api.deleteListing(listing!.id);
          router.back();
        },
      },
    ]);
  }

  if (!listing) return <ActivityIndicator style={{ flex: 1 }} />;

  function field(key: keyof Listing, label: string) {
    const value = (editing[key] ?? listing![key]) as string;
    return (
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TextInput
          style={styles.fieldInput}
          value={String(value || "")}
          onChangeText={(text) => setEditing((e) => ({ ...e, [key]: text }))}
          placeholderTextColor="#444"
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <PhotoCarousel photos={listing.photos} />

      {syncing && <Text style={styles.syncText}>Syncing status...</Text>}

      <View style={styles.content}>
        {field("title", "Title")}
        {field("price", "Price")}
        {field("brand", "Brand")}
        {field("size", "Size")}
        {field("condition", "Condition")}
        {field("category", "Category")}
        {field("description", "Description")}

        {Object.keys(editing).length > 0 && (
          <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveText}>{saving ? "Saving..." : "Save Changes"}</Text>
          </Pressable>
        )}

        {/* Platform rows */}
        <Text style={styles.sectionTitle}>Platforms</Text>
        {MVP_PLATFORMS.map((platform) => (
          <PlatformRow
            key={platform}
            platform={platform}
            platformStatus={listing.platform_statuses.find((ps) => ps.platform === platform)}
            connection={connections.find((c) => c.platform === platform)}
            onPublish={() => handlePublish(platform)}
            onDelist={() => handleDelist(platform)}
            onConnect={() => router.push(`/connect/${platform}`)}
          />
        ))}

        <Pressable style={styles.publishAllButton} onPress={handlePublishAll}>
          <Text style={styles.publishAllText}>Publish to All Connected</Text>
        </Pressable>

        <Pressable style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete Listing</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  syncText: { color: "#f59e0b", fontSize: 12, textAlign: "center", paddingVertical: 4 },
  content: { padding: 16, gap: 12 },
  field: { gap: 4 },
  fieldLabel: { color: "#888", fontSize: 13 },
  fieldInput: { color: "#fff", fontSize: 16, backgroundColor: "#111", padding: 12, borderRadius: 8, borderWidth: 1, borderColor: "#222" },
  saveButton: { backgroundColor: "#fff", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  saveText: { color: "#000", fontWeight: "600", fontSize: 16 },
  sectionTitle: { color: "#fff", fontSize: 18, fontWeight: "600", marginTop: 16 },
  publishAllButton: { backgroundColor: "#fff", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 16 },
  publishAllText: { color: "#000", fontWeight: "600", fontSize: 16 },
  deleteButton: { paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 8, borderWidth: 1, borderColor: "#ef4444" },
  deleteText: { color: "#ef4444", fontWeight: "600", fontSize: 16 },
});
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/listing/ apps/mobile/components/PhotoCarousel.tsx apps/mobile/components/PlatformRow.tsx
git commit -m "feat: add listing detail screen with edit, publish, delist, and delete"
```

---

## Task 10: Publish + Delist API Routes

**Depends on:** Task 3, Task 4

**Files:**
- Create: `apps/server/app/api/publish/route.ts`
- Create: `apps/server/app/api/delist/route.ts`
- Create: `apps/server/app/api/connections/route.ts`
- Create: `apps/server/app/api/connect/route.ts`

- [ ] **Step 1: Create publish endpoint**

`apps/server/app/api/publish/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { createDraftAndPublish as grailedPublish } from "@/lib/marketplace/grailed";
import { createDraftAndPublish as depopPublish } from "@/lib/marketplace/depop";
import type { ListingInput, GrailedTokens, DepopTokens } from "@/lib/marketplace/types";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const { listing_id, platforms } = await req.json() as { listing_id: string; platforms: string[] };
  const sql = getDb();

  // Get listing
  const listings = await sql`
    SELECT * FROM listings WHERE id = ${listing_id} AND user_id = ${user.id} AND status = 'active'
  `;
  if (listings.length === 0) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  const listing = listings[0];

  const results: Record<string, { success: boolean; error?: string }> = {};

  for (const platform of platforms) {
    // Get marketplace connection
    const conns = await sql`
      SELECT * FROM marketplace_connections
      WHERE user_id = ${user.id} AND platform = ${platform}
    `;
    if (conns.length === 0) {
      results[platform] = { success: false, error: "Not connected" };
      continue;
    }

    // Deterministic key: same listing+platform always produces same key (prevents duplicate listings on retry)
    const idempotencyKey = `${listing_id}-${platform}`;

    // Create or update platform_listing record with 'publishing' status
    await sql`
      INSERT INTO platform_listings (listing_id, platform, status, idempotency_key)
      VALUES (${listing_id}, ${platform}, 'publishing', ${idempotencyKey})
      ON CONFLICT (listing_id, platform) DO UPDATE SET
        status = 'publishing',
        last_error = NULL,
        attempt_count = platform_listings.attempt_count + 1
    `;

    const input: ListingInput = {
      title: listing.title,
      description: listing.description,
      price: Number(listing.price),
      size: listing.size || "",
      condition: listing.condition || "is_gently_used",
      brand: listing.brand || "",
      category: listing.category || "",
      traits: listing.traits || {},
      photos: listing.photos || [],
    };

    const tokens = conns[0].encrypted_tokens;
    let result;

    try {
      if (platform === "grailed") {
        result = await grailedPublish(input, tokens as unknown as GrailedTokens);
      } else if (platform === "depop") {
        result = await depopPublish(input, tokens as unknown as DepopTokens);
      } else {
        result = { success: false, error: "Platform not supported" };
      }

      if (result.success) {
        await sql`
          UPDATE platform_listings SET
            status = 'live',
            platform_listing_id = ${result.platform_listing_id || null},
            published_at = now(),
            last_synced_at = now()
          WHERE listing_id = ${listing_id} AND platform = ${platform}
        `;
      } else {
        await sql`
          UPDATE platform_listings SET
            status = 'failed',
            last_error = ${result.error || "Unknown error"}
          WHERE listing_id = ${listing_id} AND platform = ${platform}
        `;
      }

      results[platform] = result;
    } catch (err) {
      const error = (err as Error).message;
      await sql`
        UPDATE platform_listings SET status = 'failed', last_error = ${error}
        WHERE listing_id = ${listing_id} AND platform = ${platform}
      `;
      results[platform] = { success: false, error };
    }
  }

  return NextResponse.json(results);
}
```

- [ ] **Step 2: Create delist endpoint**

`apps/server/app/api/delist/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { deleteListing as grailedDelete } from "@/lib/marketplace/grailed";
import { deleteListing as depopDelete } from "@/lib/marketplace/depop";
import type { GrailedTokens, DepopTokens } from "@/lib/marketplace/types";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const { listing_id, platform } = await req.json();
  const sql = getDb();

  // Get platform listing
  const pls = await sql`
    SELECT pl.*, l.user_id FROM platform_listings pl
    JOIN listings l ON l.id = pl.listing_id
    WHERE pl.listing_id = ${listing_id} AND pl.platform = ${platform} AND l.user_id = ${user.id}
  `;
  if (pls.length === 0) {
    return NextResponse.json({ error: "Platform listing not found" }, { status: 404 });
  }

  const pl = pls[0];
  if (!pl.platform_listing_id) {
    return NextResponse.json({ error: "No marketplace listing ID" }, { status: 400 });
  }

  // Get tokens
  const conns = await sql`
    SELECT encrypted_tokens FROM marketplace_connections
    WHERE user_id = ${user.id} AND platform = ${platform}
  `;
  if (conns.length === 0) {
    return NextResponse.json({ error: "Not connected" }, { status: 400 });
  }

  const tokens = conns[0].encrypted_tokens;
  let success = false;

  if (platform === "grailed") {
    success = await grailedDelete(pl.platform_listing_id, tokens as unknown as GrailedTokens);
  } else if (platform === "depop") {
    success = await depopDelete(pl.platform_listing_id, tokens as unknown as DepopTokens);
  }

  if (success) {
    await sql`
      UPDATE platform_listings SET status = 'delisted', delisted_at = now()
      WHERE listing_id = ${listing_id} AND platform = ${platform}
    `;
  }

  return NextResponse.json({ success });
}
```

- [ ] **Step 3: Create connections endpoints**

`apps/server/app/api/connections/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  const sql = getDb();

  const rows = await sql`
    SELECT id, platform, platform_username, connected_at
    FROM marketplace_connections
    WHERE user_id = ${user.id}
  `;

  return NextResponse.json(rows);
}
```

`apps/server/app/api/connect/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const { platform, tokens, username } = await req.json();
  const sql = getDb();

  const rows = await sql`
    INSERT INTO marketplace_connections (user_id, platform, encrypted_tokens, platform_username)
    VALUES (${user.id}, ${platform}, ${JSON.stringify(tokens)}, ${username})
    ON CONFLICT (user_id, platform) DO UPDATE SET
      encrypted_tokens = ${JSON.stringify(tokens)},
      platform_username = ${username},
      connected_at = now()
    RETURNING id, platform, platform_username, connected_at
  `;

  return NextResponse.json(rows[0], { status: 201 });
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/app/api/publish/ apps/server/app/api/delist/ apps/server/app/api/connections/ apps/server/app/api/connect/
git commit -m "feat: add publish, delist, and marketplace connection API routes"
```

---

## Task 11: WebView Marketplace Auth

**Depends on:** Task 6, Task 10

**Files:**
- Create: `apps/mobile/app/connect/[platform].tsx`

- [ ] **Step 1: Create WebView auth screen**

`apps/mobile/app/connect/[platform].tsx`:
```tsx
import { useState, useRef } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useApi } from "@/lib/api";
import type { Platform } from "@/lib/types";

const AUTH_URLS: Record<string, string> = {
  grailed: "https://www.grailed.com/users/sign_in",
  depop: "https://www.depop.com/login/",
};

export default function ConnectPlatform() {
  const { platform } = useLocalSearchParams<{ platform: Platform }>();
  const router = useRouter();
  const api = useApi();
  const [loading, setLoading] = useState(true);
  const webViewRef = useRef<WebView>(null);

  const authUrl = AUTH_URLS[platform!];
  if (!authUrl) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Unsupported platform: {platform}</Text>
      </View>
    );
  }

  // Grailed: extract CSRF token + cookies after login
  const grailedInjectedJs = `
    (function() {
      // Check if we're logged in by looking for user menu
      const isLoggedIn = document.querySelector('[data-testid="header-user-menu"]') ||
                         document.querySelector('.Header-module__userMenu');
      if (isLoggedIn) {
        const cookies = document.cookie;
        const csrfMeta = document.querySelector('meta[name="csrf-token"]');
        const csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'grailed_auth',
          csrf_token: csrfToken,
          cookies: cookies,
        }));
      }
    })();
    true;
  `;

  // Depop: intercept magic link redirect to capture access token
  const depopInjectedJs = `
    (function() {
      // Look for access token in URL or local storage
      const url = window.location.href;
      if (url.includes('access_token=')) {
        const params = new URLSearchParams(url.split('#')[1] || url.split('?')[1]);
        const token = params.get('access_token');
        if (token) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'depop_auth',
            access_token: token,
          }));
        }
      }
      // Also check if logged in via cookie
      const depopToken = document.cookie.split(';').find(c => c.trim().startsWith('depop_access_token='));
      if (depopToken) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'depop_auth',
          access_token: depopToken.split('=')[1],
        }));
      }
    })();
    true;
  `;

  async function handleMessage(event: { nativeEvent: { data: string } }) {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === "grailed_auth" && data.csrf_token) {
        // Use authenticated API client (sends Clerk Bearer token)
        await api.connect("grailed", {
          csrf_token: data.csrf_token,
          cookies: data.cookies,
        });
        Alert.alert("Connected", "Grailed account connected!");
        router.back();
      }

      if (data.type === "depop_auth" && data.access_token) {
        // Use authenticated API client (sends Clerk Bearer token)
        await api.connect("depop", {
          access_token: data.access_token,
        });
        Alert.alert("Connected", "Depop account connected!");
        router.back();
      }
    } catch (err) {
      console.error("Auth message parse error:", err);
    }
  }

  function handleNavigationChange(nav: WebViewNavigation) {
    // Re-inject JS on each navigation to catch post-login state
    if (platform === "grailed") {
      webViewRef.current?.injectJavaScript(grailedInjectedJs);
    } else if (platform === "depop") {
      webViewRef.current?.injectJavaScript(depopInjectedJs);
    }
  }

  return (
    <View style={styles.container}>
      {loading && <ActivityIndicator style={styles.loader} />}
      <WebView
        ref={webViewRef}
        source={{ uri: authUrl }}
        style={styles.webview}
        onLoadEnd={() => setLoading(false)}
        onMessage={handleMessage}
        onNavigationStateChange={handleNavigationChange}
        injectedJavaScript={platform === "grailed" ? grailedInjectedJs : depopInjectedJs}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  webview: { flex: 1 },
  loader: { position: "absolute", top: "50%", left: "50%", zIndex: 1 },
  error: { color: "#ef4444", fontSize: 16, textAlign: "center", marginTop: 100 },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/connect/
git commit -m "feat: add WebView marketplace auth for Grailed and Depop"
```

---

## Task 12: Status Sync API

**Depends on:** Task 4, Task 10

**Files:**
- Create: `apps/server/app/api/status/[id]/route.ts`

- [ ] **Step 1: Create status sync endpoint**

`apps/server/app/api/status/[id]/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getListingStatus as grailedStatus } from "@/lib/marketplace/grailed";
import { getListingStatus as depopStatus } from "@/lib/marketplace/depop";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthenticatedUser();
  const sql = getDb();

  // Get all platform listings for this listing
  const pls = await sql`
    SELECT pl.* FROM platform_listings pl
    JOIN listings l ON l.id = pl.listing_id
    WHERE pl.listing_id = ${id} AND l.user_id = ${user.id}
      AND pl.platform_listing_id IS NOT NULL
      AND pl.status IN ('live', 'sold')
  `;

  // Check each platform in parallel
  const updates = await Promise.all(
    pls.map(async (pl) => {
      let statusResult;
      if (pl.platform === "grailed") {
        statusResult = await grailedStatus(pl.platform_listing_id!);
      } else if (pl.platform === "depop") {
        statusResult = await depopStatus(pl.platform_listing_id!);
      } else {
        return null;
      }

      // Update DB if status changed
      if (statusResult.status !== pl.status) {
        await sql`
          UPDATE platform_listings SET
            status = ${statusResult.status},
            last_synced_at = now()
          WHERE id = ${pl.id}
        `;
      } else {
        await sql`
          UPDATE platform_listings SET last_synced_at = now()
          WHERE id = ${pl.id}
        `;
      }

      return { platform: pl.platform, status: statusResult.status };
    })
  );

  // Return updated listing
  const rows = await sql`
    SELECT
      l.*,
      COALESCE(
        json_agg(
          json_build_object(
            'id', pl.id,
            'platform', pl.platform,
            'status', pl.status,
            'platform_listing_id', pl.platform_listing_id,
            'last_error', pl.last_error,
            'published_at', pl.published_at,
            'last_synced_at', pl.last_synced_at
          )
        ) FILTER (WHERE pl.id IS NOT NULL),
        '[]'
      ) AS platform_statuses
    FROM listings l
    LEFT JOIN platform_listings pl ON pl.listing_id = l.id
    WHERE l.id = ${id} AND l.user_id = ${user.id}
    GROUP BY l.id
  `;

  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/app/api/status/
git commit -m "feat: add live marketplace status sync endpoint"
```

---

## Task 13: Settings Screen

**Depends on:** Task 6, Task 11

**Files:**
- Create: `apps/mobile/app/(tabs)/settings.tsx`

- [ ] **Step 1: Create settings screen**

`apps/mobile/app/(tabs)/settings.tsx`:
```tsx
import { useState, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/lib/api";
import type { MarketplaceConnection, Platform } from "@/lib/types";

const MVP_PLATFORMS: { key: Platform; label: string }[] = [
  { key: "grailed", label: "Grailed" },
  { key: "depop", label: "Depop" },
];

export default function Settings() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const api = useApi();
  const [connections, setConnections] = useState<MarketplaceConnection[]>([]);

  useFocusEffect(
    useCallback(() => {
      api.getConnections().then(setConnections).catch(console.error);
    }, [])
  );

  function getConnection(platform: Platform) {
    return connections.find((c) => c.platform === platform);
  }

  return (
    <View style={styles.container}>
      {/* Account */}
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <Text style={styles.email}>{user?.emailAddresses[0]?.emailAddress}</Text>
        <Pressable
          style={styles.signOutButton}
          onPress={() => {
            Alert.alert("Sign out?", "", [
              { text: "Cancel" },
              { text: "Sign Out", style: "destructive", onPress: () => signOut() },
            ]);
          }}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </View>

      {/* Marketplaces */}
      <Text style={styles.sectionTitle}>Marketplaces</Text>
      <View style={styles.card}>
        {MVP_PLATFORMS.map(({ key, label }) => {
          const conn = getConnection(key);
          return (
            <View key={key} style={styles.platformRow}>
              <View>
                <Text style={styles.platformLabel}>{label}</Text>
                {conn && (
                  <Text style={styles.platformUsername}>@{conn.platform_username}</Text>
                )}
              </View>
              {conn ? (
                <Pressable
                  style={styles.disconnectButton}
                  onPress={() => Alert.alert("Disconnect?", `Remove ${label} connection?`, [
                    { text: "Cancel" },
                    { text: "Disconnect", style: "destructive", onPress: async () => {
                      await api.disconnect(key);
                      const updated = await api.getConnections();
                      setConnections(updated);
                    }},
                  ])}
                >
                  <Text style={styles.disconnectText}>Disconnect</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.connectButton}
                  onPress={() => router.push(`/connect/${key}`)}
                >
                  <Text style={styles.connectText}>Connect</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", padding: 16 },
  sectionTitle: { color: "#fff", fontSize: 18, fontWeight: "600", marginTop: 24, marginBottom: 12 },
  card: { backgroundColor: "#111", borderRadius: 12, padding: 16, gap: 12 },
  email: { color: "#fff", fontSize: 16 },
  signOutButton: { marginTop: 8 },
  signOutText: { color: "#ef4444", fontSize: 14 },
  platformRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#222" },
  platformLabel: { color: "#fff", fontSize: 16, fontWeight: "600" },
  platformUsername: { color: "#888", fontSize: 13, marginTop: 2 },
  connectButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#444" },
  connectText: { color: "#fff", fontSize: 14 },
  disconnectButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#ef4444" },
  disconnectText: { color: "#ef4444", fontSize: 14 },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/\(tabs\)/settings.tsx
git commit -m "feat: add settings screen with account and marketplace connections"
```

---

## Task 14: Bulk Publish API + Mobile UI

**Depends on:** Task 10, Task 7

**Files:**
- Create: `apps/server/app/api/publish/bulk/route.ts`
- Modify: `apps/mobile/app/(tabs)/index.tsx` (wire up bulk publish button)

- [ ] **Step 1: Create bulk publish endpoint**

`apps/server/app/api/publish/bulk/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { createDraftAndPublish as grailedPublish } from "@/lib/marketplace/grailed";
import { createDraftAndPublish as depopPublish } from "@/lib/marketplace/depop";
import type { ListingInput, GrailedTokens, DepopTokens } from "@/lib/marketplace/types";

// POST /api/publish/bulk — publish multiple listings to multiple platforms
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const { listing_ids, platforms } = await req.json() as { listing_ids: string[]; platforms: string[] };
  const sql = getDb();

  // Get all listings
  const listings = await sql`
    SELECT * FROM listings
    WHERE id = ANY(${listing_ids}) AND user_id = ${user.id} AND status = 'active'
  `;

  // Get marketplace connections
  const conns = await sql`
    SELECT * FROM marketplace_connections
    WHERE user_id = ${user.id} AND platform = ANY(${platforms})
  `;

  const connMap = new Map(conns.map((c) => [c.platform, c]));
  const results: Record<string, Record<string, { success: boolean; error?: string }>> = {};

  for (const listing of listings) {
    results[listing.id] = {};

    for (const platform of platforms) {
      const conn = connMap.get(platform);
      if (!conn) {
        results[listing.id][platform] = { success: false, error: "Not connected" };
        continue;
      }

      const idempotencyKey = `${listing.id}-${platform}`;

      // Set publishing status
      await sql`
        INSERT INTO platform_listings (listing_id, platform, status, idempotency_key)
        VALUES (${listing.id}, ${platform}, 'publishing', ${idempotencyKey})
        ON CONFLICT (listing_id, platform) DO UPDATE SET
          status = 'publishing',
          last_error = NULL,
          attempt_count = platform_listings.attempt_count + 1
      `;

      const input: ListingInput = {
        title: listing.title,
        description: listing.description,
        price: Number(listing.price),
        size: listing.size || "",
        condition: listing.condition || "is_gently_used",
        brand: listing.brand || "",
        category: listing.category || "",
        traits: listing.traits || {},
        photos: listing.photos || [],
      };

      try {
        let result;
        if (platform === "grailed") {
          result = await grailedPublish(input, conn.encrypted_tokens as unknown as GrailedTokens);
        } else if (platform === "depop") {
          result = await depopPublish(input, conn.encrypted_tokens as unknown as DepopTokens);
        } else {
          result = { success: false, error: "Platform not supported" };
        }

        if (result.success) {
          await sql`
            UPDATE platform_listings SET
              status = 'live',
              platform_listing_id = ${result.platform_listing_id || null},
              published_at = now(),
              last_synced_at = now()
            WHERE listing_id = ${listing.id} AND platform = ${platform}
          `;
        } else {
          await sql`
            UPDATE platform_listings SET
              status = 'failed',
              last_error = ${result.error || "Unknown error"}
            WHERE listing_id = ${listing.id} AND platform = ${platform}
          `;
        }

        results[listing.id][platform] = result;
      } catch (err) {
        const error = (err as Error).message;
        await sql`
          UPDATE platform_listings SET status = 'failed', last_error = ${error}
          WHERE listing_id = ${listing.id} AND platform = ${platform}
        `;
        results[listing.id][platform] = { success: false, error };
      }
    }
  }

  return NextResponse.json(results);
}
```

- [ ] **Step 2: Wire up bulk publish in dashboard**

In `apps/mobile/app/(tabs)/index.tsx`, replace the bulk publish button `onPress` handler:
```tsx
<Pressable
  onPress={async () => {
    const connected = connections
      .filter((c) => selectedPlatforms.has(c.platform))
      .map((c) => c.platform);
    await api.bulkPublish(Array.from(selectedIds), connected);
    exitSelection();
    loadListings();
  }}
  style={styles.bulkButton}
>
  <Text style={styles.bulkButtonText}>Publish {selectedIds.size}</Text>
</Pressable>
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/app/api/publish/bulk/ apps/mobile/app/\(tabs\)/index.tsx
git commit -m "feat: add bulk publish API and wire up dashboard selection"
```

---

## Task 15: Upload Route + Connect DELETE

**Depends on:** Task 1

**Files:**
- Create: `apps/server/app/api/upload/route.ts`
- Modify: `apps/server/app/api/connect/route.ts` (add DELETE handler)

- [ ] **Step 1: Create Vercel Blob upload route**

`apps/server/app/api/upload/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

// POST /api/upload — upload a photo to Vercel Blob (client sends raw image body)
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "image/jpeg";
  const filename = `photos/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

  const blob = await put(filename, req.body!, {
    access: "public",
    contentType,
  });

  return NextResponse.json({ url: blob.url });
}
```

- [ ] **Step 2: Add DELETE handler to connect route**

Add to `apps/server/app/api/connect/route.ts`:
```ts
// DELETE /api/connect — disconnect a marketplace
export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const { platform } = await req.json();
  const sql = getDb();

  await sql`
    DELETE FROM marketplace_connections
    WHERE user_id = ${user.id} AND platform = ${platform}
  `;

  return NextResponse.json({ disconnected: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/app/api/upload/ apps/server/app/api/connect/route.ts
git commit -m "feat: add Vercel Blob upload route and marketplace disconnect endpoint"
```

---

## Task 16: Missing UX Polish

**Depends on:** Task 9

**Files:**
- Modify: `apps/mobile/app/listing/[id].tsx` (add advanced fields, delist all, last synced)

- [ ] **Step 1: Add advanced fields section to listing detail**

In `apps/mobile/app/listing/[id].tsx`, add after the category field and before the platform rows:

```tsx
{/* Advanced fields (expandable) */}
<Pressable onPress={() => setShowAdvanced(!showAdvanced)} style={styles.advancedToggle}>
  <Text style={styles.advancedToggleText}>
    {showAdvanced ? "Hide" : "Show"} Advanced Fields
  </Text>
  <Ionicons name={showAdvanced ? "chevron-up" : "chevron-down"} size={16} color="#888" />
</Pressable>

{showAdvanced && (
  <View style={styles.advancedFields}>
    {/* Traits (color, material, etc.) */}
    {Object.entries(listing.traits || {}).map(([key, value]) => (
      <View key={key} style={styles.field}>
        <Text style={styles.fieldLabel}>{key}</Text>
        <TextInput
          style={styles.fieldInput}
          value={String(editing.traits?.[key] ?? value)}
          onChangeText={(text) =>
            setEditing((e) => ({
              ...e,
              traits: { ...(e.traits || listing!.traits || {}), [key]: text },
            }))
          }
          placeholderTextColor="#444"
        />
      </View>
    ))}
  </View>
)}
```

Add state: `const [showAdvanced, setShowAdvanced] = useState(false);`

- [ ] **Step 2: Add "Delist from All" button**

Add after the per-platform rows and before "Publish to All":

```tsx
{/* Delist from All — only show if any platform is live */}
{listing.platform_statuses.some((ps) => ps.status === "live") && (
  <Pressable
    style={styles.delistAllButton}
    onPress={() => {
      const livePlatforms = listing.platform_statuses
        .filter((ps) => ps.status === "live")
        .map((ps) => ps.platform);
      Alert.alert(
        "Delist from All",
        `Remove from ${livePlatforms.join(", ")}?`,
        [
          { text: "Cancel" },
          {
            text: "Delist All",
            style: "destructive",
            onPress: async () => {
              for (const p of livePlatforms) {
                await api.delist(listing!.id, p);
              }
              await loadData();
            },
          },
        ]
      );
    }}
  >
    <Text style={styles.delistAllText}>Delist from All Platforms</Text>
  </Pressable>
)}
```

- [ ] **Step 3: Add "Last synced" indicator + manual refresh**

Add after the photo carousel:

```tsx
{/* Sync status bar */}
<View style={styles.syncBar}>
  {syncing ? (
    <Text style={styles.syncText}>Syncing...</Text>
  ) : (
    <Text style={styles.syncText}>
      Last synced: {listing.platform_statuses[0]?.last_synced_at
        ? new Date(listing.platform_statuses[0].last_synced_at).toLocaleTimeString()
        : "Never"}
    </Text>
  )}
  <Pressable onPress={loadData}>
    <Ionicons name="refresh" size={18} color="#888" />
  </Pressable>
</View>
```

Add styles:
```tsx
syncBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "#0a0a0a" },
syncText: { color: "#666", fontSize: 12 },
advancedToggle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
advancedToggleText: { color: "#888", fontSize: 14 },
advancedFields: { gap: 12 },
delistAllButton: { paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: "#ef4444" },
delistAllText: { color: "#ef4444", fontWeight: "600", fontSize: 16 },
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/listing/
git commit -m "feat: add advanced fields, delist all, last synced indicator to listing detail"
```

---

## Spec Coverage Checklist

| Spec Requirement | Task |
|---|---|
| React Native / Expo iOS app | Task 1, 6 |
| Next.js backend on Vercel | Task 1 |
| Neon Postgres | Task 2 |
| Clerk auth (Apple + Google) | Task 6 |
| Dashboard with filter tabs | Task 7 |
| "+" FAB → capture flow | Task 7, 8 |
| Camera + voice capture | Task 8 |
| AI pipeline (Whisper + vision) | Task 5 |
| Completeness check (skip vision) | Task 5 |
| Structured output | Task 5 |
| Draft review/edit | Task 9 |
| Editable fields inc. category/traits | Task 9, 16 |
| Advanced fields (expandable) | Task 16 |
| Per-platform publish buttons | Task 9 |
| "Publish to All" | Task 9 |
| Batch drafting ("+ New Listing" from draft) | Task 8 |
| Bulk publish from dashboard | Task 14 |
| Delist per-platform | Task 9, 10 |
| Delist from All | Task 16 |
| Delete (blocked if live) | Task 9, 3 |
| WebView marketplace auth (Grailed) | Task 11 |
| WebView marketplace auth (Depop) | Task 11 |
| eBay deferred post-MVP | Not included (correct) |
| Status sync (live check on detail open) | Task 12, 9 |
| Last synced indicator + manual refresh | Task 16 |
| Settings (account, marketplace connections) | Task 13 |
| Disconnect marketplace | Task 13, 15 |
| Marketplace posting module (Grailed) | Task 4 |
| Marketplace posting module (Depop) | Task 4 |
| Publish job tracking (publishing/failed states) | Task 10 |
| Aggregate status derived (not stored) | Task 2, 7 |
| Server-side posting (client fallback noted) | Task 4, 10 |
| Vercel Blob for photos | Task 8, 15 |
| Idempotency key (deterministic) | Task 10 |
| Bearer token auth (mobile → server) | Task 3 |
| Sign in with Apple + Google | Task 6 |
