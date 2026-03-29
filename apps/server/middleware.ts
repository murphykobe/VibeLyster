import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * CORS middleware for API routes.
 * Allows cross-origin requests from any localhost origin so that the Expo web
 * dev server (port 8081) can call the backend (port 3001) during development
 * and E2E testing.
 */
function isLocalOrigin(origin: string) {
  return origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");
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
    if (isLocalOrigin(origin)) {
      res.headers.set("Access-Control-Allow-Origin", origin);
    }
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }

  const res = NextResponse.next();
  if (isLocalOrigin(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
  }
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
