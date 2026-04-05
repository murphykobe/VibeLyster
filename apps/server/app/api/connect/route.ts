import { NextRequest } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { upsertConnection, deleteConnection } from "@/lib/db";
import { encryptTokens } from "@/lib/crypto";
import { ConnectBody, DisconnectQuery, parseBody } from "@/lib/validation";
import { verifyGrailedConnection } from "@/lib/marketplace/grailed";
import { verifyDepopConnection } from "@/lib/marketplace/depop";
import {
  EbayTokenExchangeError,
  type EbayConnectionVerificationResult,
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
    seller_readiness: {
      ready: true,
      missing: [],
      policies: {
        payment: { id: "mock-payment-policy", name: "Mock Payment" },
        fulfillment: { id: "mock-fulfillment-policy", name: "Mock Fulfillment" },
        return: { id: "mock-return-policy", name: "Mock Return" },
      },
      marketplaceId: "EBAY_US",
      checkedAt: new Date().toISOString(),
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const parsed = parseBody(ConnectBody, await req.json());
    if ("error" in parsed) return parsed.error;
    const { platform } = parsed.data;

    let encryptedTokens: Record<string, unknown>;
    let connectionPlatformUsername: string | null | undefined;
    let connectionExpiresAt: string | undefined;
    let verification: ConnectionProbeResult;
    let ebayVerification: EbayConnectionVerificationResult | undefined;

    if (platform === "ebay") {
      if (isMockMode()) {
        const mockTokens = buildMockEbayTokens();
        encryptedTokens = encryptTokens(mockTokens);
        ebayVerification = { ok: true, ebayUserId: "mock-ebay-user-id", platformUsername: "mock-ebay-user" };
        connectionPlatformUsername = "mock-ebay-user";
        connectionExpiresAt = mockTokens.expires_at;
      } else {
        const clientId = process.env.EBAY_CLIENT_ID;
        const clientSecret = process.env.EBAY_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          throw new Error("EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are required");
        }

        let exchange: Awaited<ReturnType<typeof exchangeEbayAuthorizationCode>>;
        try {
          exchange = await exchangeEbayAuthorizationCode({
            clientId,
            clientSecret,
            ruName: parsed.data.ruName,
            authorizationCode: parsed.data.authorizationCode,
          });
        } catch (err) {
          if (err instanceof EbayTokenExchangeError && err.oauthError === "invalid_grant") {
            return Response.json(
              { error: "Invalid eBay authorization code. Please reconnect your account." },
              { status: 400 },
            );
          }
          throw err;
        }
        ebayVerification = await verifyEbayConnectionFromTokens({ accessToken: exchange.accessToken });
        if (!ebayVerification.ok) {
          return Response.json({ error: ebayVerification.error }, { status: 400 });
        }

        const expiresAtIso = new Date(Date.now() + exchange.expiresIn * 1000).toISOString();
        encryptedTokens = encryptTokens({
          access_token: exchange.accessToken,
          refresh_token: exchange.refreshToken,
          token_type: exchange.tokenType,
          ebay_user_id: ebayVerification.ebayUserId,
          expires_at: expiresAtIso,
          seller_readiness: {
            ready: false,
            missing: [],
            policies: {},
            checkedAt: new Date(0).toISOString(),
          },
          ...(exchange.refreshTokenExpiresIn === undefined
            ? {}
            : { refresh_token_expires_in: exchange.refreshTokenExpiresIn }),
        });
        connectionPlatformUsername = ebayVerification.platformUsername ?? null;
        connectionExpiresAt = expiresAtIso;
      }
    } else {
      const { tokens, platformUsername, expiresAt } = parsed.data;
      verification = isMockMode()
        ? { ok: true, platformUsername: platformUsername ?? `mock-${platform}-user` }
        : await verifyConnection(platform, tokens as Record<string, unknown>);
      if (!verification.ok) {
        return Response.json({ error: verification.error }, { status: 400 });
      }

      encryptedTokens = encryptTokens(tokens as Record<string, unknown>);
      connectionPlatformUsername = platformUsername ?? verification.platformUsername;
      connectionExpiresAt = expiresAt ?? verification.expiresAt;
    }

    const connection = await upsertConnection(
      user.id,
      platform,
      encryptedTokens,
      connectionPlatformUsername,
      connectionExpiresAt,
      platform === "ebay" ? { replacePlatformUsername: true } : undefined
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
