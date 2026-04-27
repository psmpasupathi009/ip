import AdminDashboard from "@/components/AdminDashboard";
import type { MapLocation } from "@/components/MapTracker";
import { fetchAdminShareSessions, type AdminShareSessionRow } from "@/lib/admin-share-sessions-list";
import { fetchAdminMergedLocations } from "@/lib/admin-merged-locations";
import { resolveShareBaseUrlFromAppHeaders } from "@/lib/share-base-url";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let initialLocations: MapLocation[] = [];
  let initialLoadError: string | null = null;
  let initialCounts: { tracker: number; consent: number; merged: number } | null = null;

  try {
    const { locations, counts } = await fetchAdminMergedLocations(500);
    initialLocations = locations;
    initialCounts = counts;
  } catch (e) {
    initialLoadError = e instanceof Error ? e.message : "Failed to load database records.";
  }

  let initialShareSessions: AdminShareSessionRow[] = [];
  let initialShareSessionsError: string | null = null;
  try {
    const base = await resolveShareBaseUrlFromAppHeaders();
    initialShareSessions = await fetchAdminShareSessions(base, 200);
  } catch (e) {
    initialShareSessionsError =
      e instanceof Error ? e.message : "Failed to load consent share sessions.";
  }

  return (
    <AdminDashboard
      initialLocations={initialLocations}
      initialLoadError={initialLoadError}
      initialCounts={initialCounts}
      initialShareSessions={initialShareSessions}
      initialShareSessionsError={initialShareSessionsError}
    />
  );
}
