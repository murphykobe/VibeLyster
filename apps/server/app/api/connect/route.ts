import { NextRequest } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { upsertConnection, deleteConnection } from "@/lib/db";
import { encryptTokens, decryptTokens } from "@/lib/crypto";

const VALID_PLATFORMS = ["grailed", "depop", "ebay"] as const;
type Platform = (typeof VALID_PLATFORMS)[number];

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();

    const { platform, tokens, platformUsername, expiresAt } = body;
    if (!VALID_PLATFORMS.includes(platform)) {
      return Response.json({ error: "Invalid platform" }, { status: 400 });
    }
    if (!tokens || typeof tokens !== "object") {
      return Response.json({ error: "tokens is required" }, { status: 400 });
    }

    const encrypted = encryptTokens(tokens);
    const connection = await upsertConnection(
      user.id,
      platform as Platform,
      encrypted,
      platformUsername,
      expiresAt
    );

    return Response.json(connection, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("POST /api/connect", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform");

    if (!platform || !VALID_PLATFORMS.includes(platform as Platform)) {
      return Response.json({ error: "Invalid platform" }, { status: 400 });
    }

    const deleted = await deleteConnection(user.id, platform);
    if (!deleted) return Response.json({ error: "Connection not found" }, { status: 404 });

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("DELETE /api/connect", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
