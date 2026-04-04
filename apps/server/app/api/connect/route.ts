import { NextRequest } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { upsertConnection, deleteConnection } from "@/lib/db";
import { encryptTokens } from "@/lib/crypto";
import { ConnectBody, DisconnectQuery, parseBody } from "@/lib/validation";
import { verifyGrailedConnection } from "@/lib/marketplace/grailed";
import { verifyDepopConnection } from "@/lib/marketplace/depop";
import {
  exchangeEbayAuthorizationCode,
  verifyEbayConnectionFromTokens,
} from "@/lib/marketplace/ebay";
import type { ConnectionProbeResult, Platform } from "@/lib/marketplace/types";
import { isMockMode } from "@/lib/mock";

async function verifyConnection(
  platform: Platform,
  tokens: Record<string, unknown>
): Promise<ConnectionProbeResult> {
  if (platform === "grailed") {
    return verifyGrailedConnection(tokens as { csrf_token: string; cookies: string });
  }
  if (platform === "depop") {
    return verifyDepopConnection(tokens as { access_token: string });
  }
  return { ok: false, error: "Unsupported platform" };
}

function buildMockEbayTokens() {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  return {
    access_token: "mock-ebay-access-token",
    refresh_token: "mock-ebay-refresh-token",
    token_type: "Bearer",
    ebay_user_id: "mock-ebay-user-id",
    expires_at: expiresAt,
    refresh_token_expires_in: 7776000,
  };
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const parsed = parseBody(ConnectBody, await req.json());
    if ("error" in parsed) return parsed.error;
    const { platform, platformUsername, expiresAt } = parsed.data;

    let encryptedTokens: Record<string, unknown>;
    let connectionPlatformUsername = platformUsername;
    let connectionExpiresAt = expiresAt;
    let verification: ConnectionProbeResult;

    if (platform === "ebay") {
      if (isMockMode()) {
        const mockTokens = buildMockEbayTokens();
        encryptedTokens = encryptTokens(mockTokens);
        verification = {
          ok: true,
          platformUsername: platformUsername ?? "mock-ebay-user",
        };
        connectionPlatformUsername = verification.platformUsername;
        connectionExpiresAt = mockTokens.expires_at;
      } else {
        const clientId = process.env.EBAY_CLIENT_ID;
        const clientSecret = process.env.EBAY_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          throw new Error("EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are required");
        }

        const exchange = await exchangeEbayAuthorizationCode({
          clientId,
          clientSecret,
          ruName: parsed.data.ruName,
          authorizationCode: parsed.data.authorizationCode,
        });
        verification = await verifyEbayConnectionFromTokens({ accessToken: exchange.accessToken });
        if (!verification.ok) {
          return Response.json({ error: verification.error }, { status: 400 });
        }

        const expiresAtIso = new Date(Date.now() + exchange.expiresIn * 1000).toISOString();
        encryptedTokens = encryptTokens({
          access_token: exchange.accessToken,
          refresh_token: exchange.refreshToken,
          token_type: exchange.tokenType,
          ebay_user_id: verification.ebayUserId,
          expires_at: expiresAtIso,
          refresh_token_expires_in: exchange.refreshTokenExpiresIn,
        });
        connectionPlatformUsername = verification.platformUsername;
        connectionExpiresAt = expiresAtIso;
      }
    } else {
      verification = isMockMode()
        ? { ok: true, platformUsername: platformUsername ?? `mock-${platform}-user` }
        : await verifyConnection(platform, parsed.data.tokens as Record<string, unknown>);
      if (!verification.ok) {
        return Response.json({ error: verification.error }, { status: 400 });
      }

      encryptedTokens = encryptTokens(parsed.data.tokens as Record<string, unknown>);
      connectionPlatformUsername = platformUsername ?? verification.platformUsername;
      connectionExpiresAt = expiresAt ?? verification.expiresAt;
    }

    const connection = await upsertConnection(
      user.id,
      platform,
      encryptedTokens,
      connectionPlatformUsername,
      connectionExpiresAt
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
    const parsed = parseBody(DisconnectQuery, { platform: searchParams.get("platform") });
    if ("error" in parsed) return parsed.error;
    const { platform } = parsed.data;

    const deleted = await deleteConnection(user.id, platform);
    if (!deleted) return Response.json({ error: "Connection not found" }, { status: 404 });

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("DELETE /api/connect", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
