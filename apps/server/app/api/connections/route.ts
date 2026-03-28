import { NextRequest } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { getConnections } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const connections = await getConnections(user.id);
    return Response.json(connections);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("GET /api/connections", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
