/**
 * Backend API client for the VibeLyster mobile app.
 * Uses Clerk JWT bearer tokens by default, or mock headers when EXPO_PUBLIC_MOCK_MODE is enabled.
 */

import type { Listing, MarketplaceConnection, Platform } from "./types";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";
const MOCK_MODE = ["1", "true", "yes", "on"].includes((process.env.EXPO_PUBLIC_MOCK_MODE ?? "").toLowerCase());
const MOCK_USER_ID = process.env.EXPO_PUBLIC_MOCK_USER_ID ?? "mock-user";
const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

const MIME_TYPE_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
};

const EXTENSION_TO_MIME_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

// ─── Auth token injection ─────────────────────────────────────────────────────

// getToken is injected at runtime from Clerk — set via setTokenProvider()
let _getToken: (() => Promise<string | null>) | null = null;

export function setTokenProvider(fn: () => Promise<string | null>) {
  _getToken = fn;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (MOCK_MODE) {
    return {
      "x-mock-user-id": MOCK_USER_ID,
      "Content-Type": "application/json",
    };
  }

  if (!_getToken) throw new Error("Token provider not configured");
  const token = await _getToken();
  if (!token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function formHeaders(): Promise<Record<string, string>> {
  if (MOCK_MODE) {
    return { "x-mock-user-id": MOCK_USER_ID };
  }
  if (!_getToken) throw new Error("Token provider not configured");
  const token = await _getToken();
  if (!token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${token}` };
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

function getFilenameFromPath(path: string): string | null {
  const normalized = path.split("?")[0]?.split("#")[0] ?? "";
  const parts = normalized.split("/");
  return parts.at(-1) || null;
}

function getExtension(value?: string | null): string | null {
  if (!value) return null;
  const match = /\.([a-z0-9]+)$/i.exec(value);
  return match?.[1]?.toLowerCase() ?? null;
}

function extensionForMimeType(mimeType: string): string {
  return Object.entries(EXTENSION_TO_MIME_TYPE).find(([, value]) => value === mimeType)?.[0] ?? "jpg";
}

function normalizeImageUpload(params: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}): { fileName: string; mimeType: string } | null {
  const normalizedMimeType = params.mimeType?.trim().toLowerCase()
    ? MIME_TYPE_ALIASES[params.mimeType.trim().toLowerCase()] ?? params.mimeType.trim().toLowerCase()
    : null;

  if (normalizedMimeType && SUPPORTED_IMAGE_MIME_TYPES.has(normalizedMimeType)) {
    return {
      fileName: params.fileName ?? getFilenameFromPath(params.uri) ?? `photo.${extensionForMimeType(normalizedMimeType)}`,
      mimeType: normalizedMimeType,
    };
  }

  const inferredExtension = getExtension(params.fileName) ?? getExtension(getFilenameFromPath(params.uri));
  if (inferredExtension) {
    const inferredMimeType = EXTENSION_TO_MIME_TYPE[inferredExtension];
    if (inferredMimeType) {
      return {
        fileName: params.fileName ?? getFilenameFromPath(params.uri) ?? `photo.${inferredExtension}`,
        mimeType: inferredMimeType,
      };
    }
  }

  return null;
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

export type UploadPhotoInput = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  file?: File | null;
};

export async function uploadPhoto(input: string | UploadPhotoInput): Promise<string> {
  const payload = typeof input === "string" ? { uri: input } : input;
  const normalizedFile = normalizeImageUpload(payload);
  if (!normalizedFile) {
    throw new ApiError(400, "Unsupported image format. Please choose JPG, PNG, WEBP, HEIC, or HEIF.");
  }

  const form = new FormData();
  if (payload.file && typeof File !== "undefined" && payload.file instanceof File) {
    const file = payload.file;
    const normalizedBrowserFile = file.type === normalizedFile.mimeType && file.name === normalizedFile.fileName
      ? file
      : new File([file], normalizedFile.fileName, { type: normalizedFile.mimeType });
    form.append("file", normalizedBrowserFile);
  } else {
    form.append("file", {
      uri: payload.uri,
      name: normalizedFile.fileName,
      type: normalizedFile.mimeType,
    } as unknown as Blob);
  }

  const res = await fetch(`${API_URL}/api/upload`, {
    method: "POST",
    headers: await formHeaders(),
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
  transcript?: string;
}): Promise<{ listing: Listing }> {
  const form = new FormData();
  if (params.photoUrls.length > 0) {
    form.append("photos", params.photoUrls.join(","));
  }
  if (params.transcript?.trim()) {
    form.append("transcript", params.transcript.trim());
  }
  if (params.audioUri) {
    form.append("audio", { uri: params.audioUri, name: "voice.m4a", type: "audio/m4a" } as unknown as Blob);
  }

  const res = await fetch(`${API_URL}/api/generate`, {
    method: "POST",
    headers: await formHeaders(),
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
  let headers: Record<string, string>;
  if (MOCK_MODE) {
    headers = { "x-mock-user-id": MOCK_USER_ID };
  } else {
    if (!_getToken) throw new Error("Token provider not configured");
    const token = await _getToken();
    if (!token) throw new Error("Not authenticated");
    headers = { Authorization: `Bearer ${token}` };
  }

  const res = await fetch(`${API_URL}/api/connect?platform=${platform}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok && res.status !== 404) throw new ApiError(res.status, `Disconnect failed`);
}
