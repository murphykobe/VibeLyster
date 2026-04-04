import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildEbayAuthorizeUrl,
  exchangeEbayAuthorizationCode,
  verifyEbayConnectionFromTokens,
  EBAY_IDENTITY_SCOPE,
} from "../ebay";

describe("eBay marketplace helper", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("builds an authorize URL with the minimum identity scope", () => {
    const url = buildEbayAuthorizeUrl({
      clientId: "client-123",
      ruName: "vibelyster-app-EBAY-US",
      state: "state-abc",
    });

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://auth.ebay.com/oauth2/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("client-123");
    expect(parsed.searchParams.get("redirect_uri")).toBe("vibelyster-app-EBAY-US");
    expect(parsed.searchParams.get("state")).toBe("state-abc");
    expect(parsed.searchParams.get("scope")).toBe(EBAY_IDENTITY_SCOPE);
    expect(parsed.searchParams.get("response_type")).toBe("code");
  });

  it("normalizes token exchange responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access-123",
          refresh_token: "refresh-456",
          token_type: "User Token",
          expires_in: 7200,
          refresh_token_expires_in: 86400,
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await exchangeEbayAuthorizationCode({
      clientId: "client-123",
      clientSecret: "secret-456",
      ruName: "vibelyster-app-EBAY-US",
      authorizationCode: "code-789",
    });

    expect(result).toEqual({
      accessToken: "access-123",
      refreshToken: "refresh-456",
      tokenType: "User Token",
      expiresIn: 7200,
      refreshTokenExpiresIn: 86400,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as [RequestInfo, RequestInit];
    expect(String(input)).toBe("https://api.ebay.com/identity/v1/oauth2/token");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual(
      expect.objectContaining({
        Authorization: `Basic ${Buffer.from("client-123:secret-456").toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      })
    );
    expect(init?.body).toBe(
      "grant_type=authorization_code&code=code-789&redirect_uri=vibelyster-app-EBAY-US"
    );
  });

  it("rejects malformed token exchange responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ access_token: "access-123", token_type: "User Token", expires_in: 7200 }), {
          status: 200,
        })
      )
    );

    await expect(
      exchangeEbayAuthorizationCode({
        clientId: "client-123",
        clientSecret: "secret-456",
        ruName: "vibelyster-app-EBAY-US",
        authorizationCode: "code-789",
      })
    ).rejects.toThrow("eBay token exchange response missing refresh_token");
  });

  it("tags invalid_grant token exchange failures as user-correctable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 403 })));

    await expect(
      exchangeEbayAuthorizationCode({
        clientId: "client-123",
        clientSecret: "secret-456",
        ruName: "vibelyster-app-EBAY-US",
        authorizationCode: "code-789",
      })
    ).rejects.toMatchObject({ statusCode: 403, oauthError: "invalid_grant" });
  });

  it("tags 401 token exchange failures as app misconfiguration", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_client" }), { status: 401 }))
    );

    await expect(
      exchangeEbayAuthorizationCode({
        clientId: "client-123",
        clientSecret: "secret-456",
        ruName: "vibelyster-app-EBAY-US",
        authorizationCode: "code-789",
      })
    ).rejects.toMatchObject({ statusCode: 401, oauthError: "invalid_client" });
  });

  it("tags network failures as retryable server errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(
      exchangeEbayAuthorizationCode({
        clientId: "client-123",
        clientSecret: "secret-456",
        ruName: "vibelyster-app-EBAY-US",
        authorizationCode: "code-789",
      })
    ).rejects.toMatchObject({
      statusCode: 0,
    });
  });

  it("preserves missing refresh_token_expires_in as undefined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "access-123",
            refresh_token: "refresh-456",
            token_type: "User Token",
            expires_in: 7200,
          }),
          { status: 200 }
        )
      )
    );

    const result = await exchangeEbayAuthorizationCode({
      clientId: "client-123",
      clientSecret: "secret-456",
      ruName: "vibelyster-app-EBAY-US",
      authorizationCode: "code-789",
    });

    expect(result.refreshTokenExpiresIn).toBeUndefined();
  });

  it("verifies an eBay connection from tokens and returns platformUsername when present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ userId: "ebay-user-123", username: "ebay-handle" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyEbayConnectionFromTokens({ accessToken: "access-123" });

    expect(result).toEqual({ ok: true, ebayUserId: "ebay-user-123", platformUsername: "ebay-handle" });
    expect(fetchMock).toHaveBeenCalledWith("https://apiz.ebay.com/commerce/identity/v1/user/", {
      headers: { Authorization: "Bearer access-123" },
    });
  });

  it("returns an error when getUser omits userId", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ username: "ebay-handle" }), { status: 200 }))
    );

    const result = await verifyEbayConnectionFromTokens({ accessToken: "access-123" });

    expect(result).toEqual({ ok: false, error: "eBay verification response missing userId" });
  });

  it("returns an error when verification response is not OK", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    const result = await verifyEbayConnectionFromTokens({ accessToken: "access-123" });

    expect(result).toEqual({ ok: false, error: "eBay verification failed with status 401" });
  });
});
