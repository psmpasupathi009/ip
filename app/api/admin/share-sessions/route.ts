import { NextRequest, NextResponse } from "next/server";
import { fetchAdminShareSessions } from "@/lib/admin-share-sessions-list";
import { resolveShareBaseUrlFromRequest } from "@/lib/share-base-url";

export const dynamic = "force-dynamic";

const TAKE = 200;

export async function GET(request: NextRequest) {
  try {
    const base = resolveShareBaseUrlFromRequest(request);
    const sessions = await fetchAdminShareSessions(base, TAKE);
    return NextResponse.json({ sessions, limit: TAKE, returned: sessions.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const isConfig =
      message.includes("DATABASE_URL") || message.includes("MONGODB_URI");
    return NextResponse.json(
      { error: isConfig ? message : "Failed to load share sessions." },
      { status: isConfig ? 503 : 500 },
    );
  }
}
