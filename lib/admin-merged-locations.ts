import type { MapLocation } from "@/components/MapTracker";
import prisma from "@/lib/prisma";

const DEFAULT_PAGE = 500;

export type AdminMergedCounts = {
  tracker: number;
  consent: number;
  merged: number;
};

/**
 * Admin map/table: merge IMEI `Location` rows with consent `LocationPing` rows (newest first).
 * Consent-only installs were previously invisible in admin.
 */
export async function fetchAdminMergedLocations(
  take = DEFAULT_PAGE,
): Promise<{ locations: MapLocation[]; counts: AdminMergedCounts }> {
  const [trackerRows, pingRows] = await Promise.all([
    prisma.location.findMany({
      orderBy: { timestamp: "desc" },
      take,
    }),
    prisma.locationPing.findMany({
      orderBy: { capturedAt: "desc" },
      take,
      include: {
        session: {
          select: {
            id: true,
            status: true,
            ownerLabel: true,
            recipientLabel: true,
          },
        },
      },
    }),
  ]);

  const tracker: MapLocation[] = trackerRows.map((r) => ({
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
    recordKind: "tracker",
    source: "tracker",
  }));

  const consent: MapLocation[] = pingRows.map((p) => ({
    _id: p.id,
    imei: `share:${p.session.id}`,
    sim: String(p.session.status),
    mobile: [p.session.ownerLabel, p.session.recipientLabel].filter(Boolean).join(" → ") || "—",
    lat: p.lat,
    lng: p.lng,
    city: p.city ?? "",
    ip: p.ip ?? "",
    accuracy: p.accuracy ?? undefined,
    timestamp: p.capturedAt.toISOString(),
    userAgent: p.userAgent ?? "",
    recordKind: "consent",
    sessionId: p.sessionId,
    sessionStatus: p.session.status,
    ownerLabel: p.session.ownerLabel,
    recipientLabel: p.session.recipientLabel ?? "",
    source: "consent",
  }));

  const merged = [...tracker, ...consent]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, take);

  return {
    locations: merged,
    counts: {
      tracker: trackerRows.length,
      consent: pingRows.length,
      merged: merged.length,
    },
  };
}
