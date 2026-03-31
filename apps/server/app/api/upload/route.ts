import { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { isMockMode } from "@/lib/mock";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
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

function getFileExtension(fileName?: string | null): string | null {
  if (!fileName) return null;
  const match = /\.([a-z0-9]+)$/i.exec(fileName);
  return match?.[1]?.toLowerCase() ?? null;
}

function normalizeImageMimeType(file: File): string | null {
  const rawMimeType = file.type?.trim().toLowerCase();
  if (rawMimeType) {
    const normalizedMimeType = MIME_TYPE_ALIASES[rawMimeType] ?? rawMimeType;
    if (ALLOWED_TYPES.has(normalizedMimeType)) {
      return normalizedMimeType;
    }
  }

  const extension = getFileExtension(file.name);
  if (!extension) return null;
  return EXTENSION_TO_MIME_TYPE[extension] ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return Response.json({ error: "file is required" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return Response.json({ error: "File too large (max 10MB)" }, { status: 400 });
    const contentType = normalizeImageMimeType(file);
    if (!contentType) {
      return Response.json({ error: "Invalid file type. Allowed: jpeg, png, webp, heic, heif" }, { status: 400 });
    }

    const filename = `listings/${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    if (isMockMode()) {
      const url = `https://mock-storage.vibelyster.local/${filename}`;
      return Response.json({ url }, { status: 201 });
    }

    const blob = await put(filename, file, { access: "public", contentType });

    return Response.json({ url: blob.url }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("POST /api/upload", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
