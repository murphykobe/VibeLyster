/**
 * Backend API client for the VibeLyster mobile app.
 * All requests include a Clerk JWT bearer token.
 */

import type { Listing, MarketplaceConnection, Platform } from "./types";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

// ─── Auth token injection ─────────────────────────────────────────────────────

// getToken is injected at runtime from Clerk — set via setTokenProvider()
let _getToken: (() => Promise<string | null>) | null = null;

export function setTokenProvider(fn: () => Promise<string | null>) {
  _getToken = fn;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!_getToken) throw new Error("Token provider not configured");
  const token = await _getToken();
  if (!token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new ApiError(res.status, err.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Listings ─────────────────────────────────────────────────────────────────

export async function getListings(): Promise<Listing[]> {
  return apiRequest<Listing[]>("GET", "/api/listings");
}

export async function getListing(id: string): Promise<Listing> {
  return apiRequest<Listing>("GET", `/api/listings/${id}`);
}

export type UpdateListingInput = {
  title?: string;
  description?: string;
  price?: number;
  size?: string;
  condition?: string;
  brand?: string;
  category?: string;
  traits?: Record<string, string>;
  photos?: string[];
};

export async function updateListing(id: string, input: UpdateListingInput): Promise<Listing> {
  return apiRequest<Listing>("PUT", `/api/listings/${id}`, input);
}

export async function deleteListing(id: string): Promise<void> {
  return apiRequest<void>("DELETE", `/api/listings/${id}`);
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export async function uploadPhoto(uri: string): Promise<string> {
  if (!_getToken) throw new Error("Token provider not configured");
  const token = await _getToken();
  if (!token) throw new Error("Not authenticated");

  const form = new FormData();
  form.append("file", { uri, name: "photo.jpg", type: "image/jpeg" } as unknown as Blob);

  const res = await fetch(`${API_URL}/api/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Upload failed ${res.status}` }));
    throw new ApiError(res.status, err.error);
  }
  const data = await res.json() as { url: string };
  return data.url;
}

// ─── Generate ─────────────────────────────────────────────────────────────────

export async function generateListing(params: {
  photoUrls: string[];
  audioUri?: string;
}): Promise<{ listing: Listing }> {
  if (!_getToken) throw new Error("Token provider not configured");
  const token = await _getToken();
  if (!token) throw new Error("Not authenticated");

  const form = new FormData();
  if (params.photoUrls.length > 0) {
    form.append("photos", params.photoUrls.join(","));
  }
  if (params.audioUri) {
    form.append("audio", { uri: params.audioUri, name: "voice.m4a", type: "audio/m4a" } as unknown as Blob);
  }

  const res = await fetch(`${API_URL}/api/generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Generate failed ${res.status}` }));
    throw new ApiError(res.status, err.error);
  }
  return res.json() as Promise<{ listing: Listing }>;
}

// ─── Publish ──────────────────────────────────────────────────────────────────

export async function publishListing(listingId: string, platforms: Platform[]) {
  return apiRequest<{ results: Record<string, unknown> }>("POST", "/api/publish", { listingId, platforms });
}

export async function bulkPublish(listingIds: string[], platforms: Platform[]) {
  return apiRequest<{ acknowledged: boolean; count: number }>("POST", "/api/publish/bulk", { listingIds, platforms });
}

export async function delistListing(listingId: string, platform: Platform) {
  return apiRequest<{ ok: boolean }>("POST", "/api/delist", { listingId, platform });
}

export async function syncStatus(listingId: string) {
  return apiRequest<{ listingId: string; statuses: Record<string, unknown>; checkedAt: string }>(
    "GET",
    `/api/status/${listingId}`
  );
}

// ─── Connections ──────────────────────────────────────────────────────────────

export async function getConnections(): Promise<MarketplaceConnection[]> {
  return apiRequest<MarketplaceConnection[]>("GET", "/api/connections");
}

export async function saveConnection(params: {
  platform: Platform;
  tokens: Record<string, unknown>;
  platformUsername?: string;
  expiresAt?: string;
}) {
  return apiRequest<MarketplaceConnection>("POST", "/api/connect", params);
}

export async function disconnectPlatform(platform: Platform) {
  if (!_getToken) throw new Error("Token provider not configured");
  const token = await _getToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`${API_URL}/api/connect?platform=${platform}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) throw new ApiError(res.status, `Disconnect failed`);
}
