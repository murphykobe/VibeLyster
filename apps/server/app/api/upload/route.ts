import { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { isMockMode } from "@/lib/mock";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return Response.json({ error: "file is required" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return Response.json({ error: "File too large (max 10MB)" }, { status: 400 });
    if (!ALLOWED_TYPES.includes(file.type)) {
      return Response.json({ error: "Invalid file type. Allowed: jpeg, png, webp, heic" }, { status: 400 });
    }

    const filename = `listings/${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    if (isMockMode()) {
      const url = `https://mock-storage.vibelyster.local/${filename}`;
      return Response.json({ url }, { status: 201 });
    }

    const blob = await put(filename, file, { access: "public" });

    return Response.json({ url: blob.url }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("POST /api/upload", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
