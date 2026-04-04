export const EBAY_IDENTITY_SCOPE =
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly";

type EbayAuthorizeUrlInput = {
  clientId: string;
  redirectUri: string;
  state: string;
};

type EbayTokenExchangeInput = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationCode: string;
};

type EbayTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number | string;
  refresh_token_expires_in?: number | string;
};

type EbayConnectionVerificationResult =
  | { ok: true; ebayUserId: string; platformUsername?: string }
  | { ok: false; error: string };

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

export function buildEbayAuthorizeUrl({ clientId, redirectUri, state }: EbayAuthorizeUrlInput): string {
  const url = new URL("https://auth.ebay.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", EBAY_IDENTITY_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeEbayAuthorizationCode({
  clientId,
  clientSecret,
  redirectUri,
  authorizationCode,
}: EbayTokenExchangeInput): Promise<{
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  refreshTokenExpiresIn: number;
}> {
  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: buildBasicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: authorizationCode,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`eBay token exchange failed with status ${response.status}`);
  }

  const data = (await response.json()) as EbayTokenResponse;
  return {
    accessToken: pickString(data.access_token) ?? "",
    refreshToken: pickString(data.refresh_token) ?? "",
    tokenType: pickString(data.token_type) ?? "",
    expiresIn: toNumber(data.expires_in) ?? 0,
    refreshTokenExpiresIn: toNumber(data.refresh_token_expires_in) ?? 0,
  };
}

export async function verifyEbayConnectionFromTokens({
  accessToken,
}: {
  accessToken: string;
}): Promise<EbayConnectionVerificationResult> {
  try {
    const response = await fetch("https://apiz.ebay.com/commerce/identity/v1/user/", {
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
