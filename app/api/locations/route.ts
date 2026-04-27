import { NextResponse } from "next/server";
import { fetchAdminMergedLocations } from "@/lib/admin-merged-locations";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 500;

export async function GET() {
  try {
    const { locations, counts } = await fetchAdminMergedLocations(PAGE_SIZE);

    return NextResponse.json({
      locations,
      limit: PAGE_SIZE,
      returned: locations.length,
      counts,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const isConfig =
      message.includes("DATABASE_URL") || message.includes("MONGODB_URI");
    return NextResponse.json(
      { error: isConfig ? message : "Failed to load locations." },
      { status: isConfig ? 503 : 500 },
    );
  }
}
