import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Location from "@/lib/models/Location";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();
    const rows = await Location.find()
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    const locations = rows.map((r) => ({
      ...r,
      _id: String(r._id),
    }));

    return NextResponse.json({ locations });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const isConfig = message.includes("MONGODB_URI");
    return NextResponse.json(
      { error: isConfig ? message : "Failed to load locations." },
      { status: isConfig ? 503 : 500 },
    );
  }
}
