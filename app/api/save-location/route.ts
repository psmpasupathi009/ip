import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Location from "@/lib/models/Location";

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const fromForwarded = forwarded?.split(",")[0]?.trim();
  return fromForwarded || request.headers.get("x-real-ip") || "";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const imei = typeof body.imei === "string" ? body.imei.trim() : "";
    const sim = typeof body.sim === "string" ? body.sim.trim() : "";
    const mobileRaw =
      typeof body.mobile === "string"
        ? body.mobile.trim()
        : typeof body.sim === "string"
          ? body.sim.trim()
          : "";
    const mobileDigits = mobileRaw.replace(/\D/g, "");
    const mobile =
      mobileRaw.length > 0 && mobileDigits.length >= 8 && mobileDigits.length <= 15
        ? mobileRaw
        : "";
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const city = typeof body.city === "string" ? body.city : "";
    const bodyIp = typeof body.ip === "string" ? body.ip : "";
    const accuracy =
      body.accuracy === null || body.accuracy === undefined
        ? undefined
        : Number(body.accuracy);
    const userAgent =
      typeof body.userAgent === "string" ? body.userAgent : "";
    const serverIp = clientIp(request);

    if (!imei || !mobile) {
      return NextResponse.json(
        {
          error:
            "IMEI and a valid mobile number are required (8–15 digits, optional + or spaces).",
        },
        { status: 400 },
      );
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { error: "lat and lng are required and must be numbers." },
        { status: 400 },
      );
    }

    await connectDB();

    const timestamp =
      body.timestamp != null ? new Date(String(body.timestamp)) : new Date();
    if (Number.isNaN(timestamp.getTime())) {
      return NextResponse.json({ error: "Invalid timestamp." }, { status: 400 });
    }

    const doc = await Location.create({
      imei,
      sim,
      mobile,
      lat,
      lng,
      city,
      ip: bodyIp || serverIp,
      accuracy: Number.isFinite(accuracy) ? accuracy : undefined,
      timestamp,
      userAgent,
    });

    return NextResponse.json(
      { ...doc.toObject(), _id: String(doc._id) },
      { status: 201 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const isConfig = message.includes("MONGODB_URI");
    return NextResponse.json(
      { error: isConfig ? message : "Failed to save location." },
      { status: isConfig ? 503 : 500 },
    );
  }
}
