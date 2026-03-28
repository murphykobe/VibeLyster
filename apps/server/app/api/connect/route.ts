import { NextRequest } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { upsertConnection, deleteConnection } from "@/lib/db";
import { encryptTokens } from "@/lib/crypto";
import { ConnectBody, DisconnectQuery, parseBody } from "@/lib/validation";
import { verifyGrailedConnection } from "@/lib/marketplace/grailed";
import { verifyDepopConnection } from "@/lib/marketplace/depop";
import type { ConnectionProbeResult, Platform } from "@/lib/marketplace/types";

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function verifyEbayConnection(tokens: Record<string, unknown>): Promise<ConnectionProbeResult> {
  const accessToken = pickString(tokens.access_token);
  if (!accessToken) {
    return { ok: false, error: "Invalid eBay tokens: access_token is required" };
  }

  const res = await fetch("https://api.ebay.com/commerce/identity/v1/user/", {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "eBay authentication failed. Please reconnect your account." };
    }
    const detail = await res.text().catch(() => "");
    return { ok: false, error: `eBay verification failed (${res.status}): ${detail || "upstream error"}` };
  }

  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  const platformUsername =
    pickString(data.username) ??
    pickString(data.userId) ??
    pickString(data.nickname) ??
    pickString(data.email);
  return { ok: true, platformUsername };
}

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
  return verifyEbayConnection(tokens);
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const parsed = parseBody(ConnectBody, await req.json());
    if ("error" in parsed) return parsed.error;
    const { platform, tokens, platformUsername, expiresAt } = parsed.data;

    const verification = await verifyConnection(platform, tokens as Record<string, unknown>);
    if (!verification.ok) {
      return Response.json({ error: verification.error }, { status: 400 });
    }

    const encrypted = encryptTokens(tokens as Record<string, unknown>);
    const connection = await upsertConnection(
      user.id,
      platform,
      encrypted,
      platformUsername ?? verification.platformUsername,
      expiresAt ?? verification.expiresAt
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
