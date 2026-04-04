export const EBAY_IDENTITY_SCOPE =
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly";

const EBAY_SANDBOX = process.env.EBAY_SANDBOX === "true";
const EBAY_AUTH_HOST = EBAY_SANDBOX ? "https://auth.sandbox.ebay.com" : "https://auth.ebay.com";
const EBAY_API_HOST = EBAY_SANDBOX ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
const EBAY_APIZ_HOST = EBAY_SANDBOX ? "https://apiz.sandbox.ebay.com" : "https://apiz.ebay.com";

type EbayAuthorizeUrlInput = {
  clientId: string;
  ruName: string;
  state: string;
};

type EbayTokenExchangeInput = {
  clientId: string;
  clientSecret: string;
  ruName: string;
  authorizationCode: string;
};

type EbayTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number | string;
  refresh_token_expires_in?: number | string;
};

export type EbayConnectionVerificationResult =
  | { ok: true; ebayUserId: string; platformUsername?: string }
  | { ok: false; error: string };

export class EbayTokenExchangeError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly oauthError?: string,
  ) {
    super(`eBay token exchange failed with status ${statusCode}: ${message}`);
    this.name = "EbayTokenExchangeError";
  }
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function buildBasicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function toNumber(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : undefined;
}

function requireString(value: unknown, fieldName: string): string {
  const parsed = pickString(value);
  if (!parsed) {
    throw new Error(`eBay token exchange response missing ${fieldName}`);
  }
  return parsed;
}

function requireNumber(value: unknown, fieldName: string): number {
  const parsed = toNumber(value);
  if (parsed === undefined) {
    throw new Error(`eBay token exchange response missing ${fieldName}`);
  }
  return parsed;
}

export function buildEbayAuthorizeUrl({ clientId, ruName, state }: EbayAuthorizeUrlInput): string {
  const url = new URL(`${EBAY_AUTH_HOST}/oauth2/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", ruName);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", EBAY_IDENTITY_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeEbayAuthorizationCode({
  clientId,
  clientSecret,
  ruName,
  authorizationCode,
}: EbayTokenExchangeInput): Promise<{
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  refreshTokenExpiresIn?: number;
}> {
  let response: Response;
  try {
    response = await fetch(`${EBAY_API_HOST}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: buildBasicAuthHeader(clientId, clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: authorizationCode,
        redirect_uri: ruName,
      }).toString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new EbayTokenExchangeError(0, message || "network error");
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    let oauthError: string | undefined;
    let message = detail || "upstream error";

    if (detail) {
      try {
        const parsed = JSON.parse(detail) as {
          error?: unknown;
          error_description?: unknown;
        };
        oauthError = pickString(parsed.error);
        message =
          pickString(parsed.error_description) ??
          oauthError ??
          detail;
      } catch {
        message = detail;
      }
    }

    throw new EbayTokenExchangeError(
      response.status,
      message,
      oauthError,
    );
  }

  const data = (await response.json()) as EbayTokenResponse;
  return {
    accessToken: requireString(data.access_token, "access_token"),
    refreshToken: requireString(data.refresh_token, "refresh_token"),
    tokenType: requireString(data.token_type, "token_type"),
    expiresIn: requireNumber(data.expires_in, "expires_in"),
    refreshTokenExpiresIn: toNumber(data.refresh_token_expires_in),
  };
}

export async function verifyEbayConnectionFromTokens({
  accessToken,
}: {
  accessToken: string;
}): Promise<EbayConnectionVerificationResult> {
  try {
    const response = await fetch(`${EBAY_APIZ_HOST}/commerce/identity/v1/user/`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return { ok: false, error: `eBay verification failed with status ${response.status}` };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const ebayUserId = pickString(data.userId);
    if (!ebayUserId) {
      return { ok: false, error: "eBay verification response missing userId" };
    }

    const platformUsername = pickString(data.username);
    return { ok: true, ebayUserId, platformUsername };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `eBay verification failed: ${message}` };
  }
}
