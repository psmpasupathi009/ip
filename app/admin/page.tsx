import AdminDashboard from "@/components/AdminDashboard";
import type { MapLocation } from "@/components/MapTracker";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let initialLocations: MapLocation[] = [];
  try {
    const rows = await prisma.location.findMany({
      orderBy: { timestamp: "desc" },
    });
    initialLocations = rows.map((r): MapLocation => ({
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
  } catch {
    initialLocations = [];
  }

  return <AdminDashboard initialLocations={initialLocations} />;
}
