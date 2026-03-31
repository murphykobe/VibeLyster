import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * CORS middleware for API routes.
 * Allows cross-origin requests from localhost (dev/E2E) and deployed Vercel
 * frontend origins (*.vercel.app + custom domains via ALLOWED_ORIGINS env var).
 */
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin: string) {
  if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) return true;
  if (origin.endsWith(".vercel.app") || origin === "https://vibelyster.vercel.app") return true;
  if (EXTRA_ORIGINS.includes(origin)) return true;
  return false;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, x-mock-user-id, x-mock-user-email",
  "Access-Control-Max-Age": "86400",
};

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";

  if (req.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    if (isAllowedOrigin(origin)) {
      res.headers.set("Access-Control-Allow-Origin", origin);
    }
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }

  const res = NextResponse.next();
  if (isAllowedOrigin(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
  }
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
