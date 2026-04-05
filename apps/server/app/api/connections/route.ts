import { NextRequest } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { decryptTokens } from "@/lib/crypto";
import { getConnections } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const connections = await getConnections(user.id, { includeEncryptedTokens: true });
    return Response.json(connections.map((connection) => {
      if (connection.platform !== "ebay") {
        const { encrypted_tokens: _encryptedTokens, ...rest } = connection;
        return rest;
      }

      const decrypted = decryptTokens(connection.encrypted_tokens);
      const { encrypted_tokens: _encryptedTokens, ...rest } = connection;
      return {
        ...rest,
        readiness: decrypted.seller_readiness ?? {
          ready: false,
          missing: [],
          policies: {},
          checkedAt: null,
        },
      };
    }));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("GET /api/connections", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
