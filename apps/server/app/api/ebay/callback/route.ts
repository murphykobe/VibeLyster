import { NextRequest } from "next/server";

/**
 * GET /api/ebay/callback
 *
 * eBay redirects here after the user grants consent. This endpoint forwards
 * all query params to the mobile app's deep link so the WebView / OS can
 * hand control back to the native connect screen.
 *
 * Auth Accepted URL in the eBay Developer Portal should be set to:
 *   https://vibelyster.vercel.app/api/ebay/callback
 */
export async function GET(req: NextRequest) {
  const deepLink = `vibelyster://connect/ebay?${req.nextUrl.searchParams.toString()}`;
  return Response.redirect(deepLink, 302);
}
