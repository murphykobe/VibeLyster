import { createClerkClient, verifyToken } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { getUserByClerkId, upsertUser } from "./db";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

/**
 * Verifies a Clerk JWT from the Authorization: Bearer header.
 * Returns the DB user record, creating it if this is first login.
 * Throws on missing/invalid token.
 */
export async function requireAuth(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing Authorization header");
  }
  const token = authHeader.slice(7);

  let payload: { sub: string };
  try {
    payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY }) as { sub: string };
  } catch {
    throw new AuthError("Invalid or expired token");
  }

  const clerkId = payload.sub;

  // Fetch Clerk user to get email (JWT doesn't include it by default)
  let email = "unknown@vibelyster.app";
  try {
    const clerkUser = await clerk.users.getUser(clerkId);
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
