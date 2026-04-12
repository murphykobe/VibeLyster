import type { Platform } from "./types";

export type MarketplaceRequestDebug = {
  operation: string;
  method: string;
  endpoint: string;
  payload?: unknown;
};

export type MarketplaceDebugData = {
  requests: MarketplaceRequestDebug[];
};

export function createMarketplaceDebugData() {
  return { requests: [] } as MarketplaceDebugData;
}

export function recordMarketplaceRequest(input: {
  debug: MarketplaceDebugData;
  platform: Platform;
  listingId: string;
  request: MarketplaceRequestDebug;
}) {
  input.debug.requests.push(input.request);
  console.log(JSON.stringify({
    event: `${input.platform}.publish.request`,
    listing_id: input.listingId,
    operation: input.request.operation,
    method: input.request.method,
    endpoint: input.request.endpoint,
    payload: input.request.payload ?? null,
  }));
}

export function attachMarketplaceDebugData<T extends Record<string, unknown>>(
  platformData: T,
  debug: MarketplaceDebugData,
) {
  return {
    ...platformData,
    debug: {
      requests: debug.requests,
    },
  };
}

export function debugPlatformData(debug: MarketplaceDebugData) {
  return {
    debug: {
      requests: debug.requests,
    },
  };
}
