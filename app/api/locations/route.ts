import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await prisma.location.findMany({
      orderBy: { timestamp: "desc" },
    });

    const locations = rows.map((r) => ({
      _id: r.id,
      imei: r.imei,
      sim: r.sim ?? "",
      mobile: r.mobile ?? "",
      lat: r.lat,
      lng: r.lng,
      city: r.city ?? "",
      ip: r.ip ?? "",
      accuracy: r.accuracy ?? undefined,
      timestamp: r.timestamp.toISOString(),
      userAgent: r.userAgent ?? "",
    }));

    return NextResponse.json({ locations });
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
