import { createClerkClient, verifyToken } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { upsertUser } from "./db";
import { isMockMode } from "./mock";

let clerkClient: ReturnType<typeof createClerkClient> | null = null;

function isLocalDevAuthBypassEnabled() {
  return process.env.NODE_ENV !== "production"
    && ["1", "true", "yes", "on"].includes((process.env.LOCAL_DEV_AUTH_BYPASS ?? "").toLowerCase());
}

function getClerkClient() {
  if (clerkClient) return clerkClient;
  if (!process.env.CLERK_SECRET_KEY) {
    throw new AuthError("CLERK_SECRET_KEY is required");
  }
  clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  return clerkClient;
}

/**
 * Verifies a Clerk JWT from the Authorization: Bearer header.
 * Returns the DB user record, creating it if this is first login.
 * Throws on missing/invalid token.
 */
export async function requireAuth(req: NextRequest) {
  if (isMockMode()) {
    const mockClerkId = req.headers.get("x-mock-user-id")?.trim() || "mock-user";
    const mockEmail = req.headers.get("x-mock-user-email")?.trim() || `${mockClerkId}@mock.vibelyster.local`;
    return upsertUser(mockClerkId, mockEmail);
  }

  if (isLocalDevAuthBypassEnabled()) {
    const devUserId = req.headers.get("x-dev-user-id")?.trim();
    if (devUserId) {
      const devEmail = req.headers.get("x-dev-user-email")?.trim() || `${devUserId}@dev.vibelyster.local`;
      return upsertUser(devUserId, devEmail);
    }
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing Authorization header");
  }
  const token = authHeader.slice(7);
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new AuthError("CLERK_SECRET_KEY is required");

  let payload: { sub: string };
  try {
    payload = await verifyToken(token, { secretKey }) as { sub: string };
  } catch {
    throw new AuthError("Invalid or expired token");
  }

  const clerkId = payload.sub;

  // Fetch Clerk user to get email (JWT doesn't include it by default)
  let email = "unknown@vibelyster.app";
  try {
    const clerkUser = await getClerkClient().users.getUser(clerkId);
    email = clerkUser.emailAddresses[0]?.emailAddress ?? email;
  } catch {
    // Non-fatal — user record will be created with placeholder email
  }

  const user = await upsertUser(clerkId, email);
  return user;
}

export class AuthError extends Error {
  readonly status = 401;
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/** Wraps an AuthError into a JSON 401 response */
export function authErrorResponse(err: AuthError) {
  return Response.json({ error: err.message }, { status: 401 });
}
