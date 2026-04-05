import { NextRequest } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { getConnection, upsertConnection } from "@/lib/db";
import { decryptTokens, encryptTokens } from "@/lib/crypto";
import { isMockMode } from "@/lib/mock";

export async function POST(req: NextRequest) {
  try {
    if (!isMockMode()) {
      return Response.json({ error: "Only available in mock mode" }, { status: 403 });
    }

    const user = await requireAuth(req);
    const body = await req.json() as { ready: boolean; missing?: string[] };
    const connection = await getConnection(user.id, "ebay");
    if (!connection) {
      return Response.json({ error: "eBay connection not found" }, { status: 404 });
    }

    const decrypted = decryptTokens(connection.encrypted_tokens);
    const nextTokens = {
      ...decrypted,
      seller_readiness: {
        ...(typeof decrypted.seller_readiness === "object" && decrypted.seller_readiness ? decrypted.seller_readiness : {}),
        ready: Boolean(body.ready),
        missing: body.missing ?? [],
        checkedAt: new Date().toISOString(),
      },
    };

    await upsertConnection(
      user.id,
      "ebay",
      encryptTokens(nextTokens),
      connection.platform_username,
      connection.expires_at ?? undefined,
      { replacePlatformUsername: true }
    );

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("POST /api/test/ebay-readiness", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
