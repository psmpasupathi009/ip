import AdminDashboard from "@/components/AdminDashboard";
import type { MapLocation } from "@/components/MapTracker";
import connectDB from "@/lib/mongodb";
import Location from "@/lib/models/Location";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let initialLocations: MapLocation[] = [];
  try {
    await connectDB();
    const rows = await Location.find()
      .sort({ timestamp: -1 })
      .lean()
      .exec();
    initialLocations = JSON.parse(JSON.stringify(rows)) as MapLocation[];
    initialLocations = initialLocations.map((r) => ({
      ...r,
      _id: String(r._id),
    }));
  } catch {
    initialLocations = [];
  }

  return <AdminDashboard initialLocations={initialLocations} />;
}
