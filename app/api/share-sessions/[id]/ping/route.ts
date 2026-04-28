import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  RECIPIENT_DEVICE_LOCKED_ERROR,
  RECIPIENT_DEVICE_REQUIRED_ERROR,
  assertDeviceId,
  assertToken,
  clientIpFromHeaders,
  effectiveStatus,
  isExpired,
  isRecipientDeviceLocked,
} from "@/lib/share-session";

type Params = { params: Promise<{ id: string }> };

const RATE_WINDOW_MS = 3_000;
const rateBucket = new Map<string, number>();

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const token = assertToken(body.token);
    const deviceId = assertDeviceId(body.deviceId);
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const source = body.source === "gps" || body.source === "ip" ? body.source : "gps";
    const accuracy =
      body.accuracy == null ? undefined : Number(body.accuracy);
    const city = typeof body.city === "string" ? body.city : "";
    const userAgent =
      typeof body.userAgent === "string"
        ? body.userAgent
        : request.headers.get("user-agent") || "";
    const ip = clientIpFromHeaders(request.headers);

    if (!token || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { error: "token, lat and lng are required." },
        { status: 400 },
      );
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json(
        { error: "Invalid coordinates received from device." },
        { status: 400 },
      );
    }
    if (source !== "gps") {
      return NextResponse.json(
        { error: "Strict GPS mode enabled: IP fallback pings are not accepted." },
        { status: 400 },
      );
    }

    const now = Date.now();
    const bucketKey = `${id}:${token}`;
    const prevAt = rateBucket.get(bucketKey);
    if (prevAt && now - prevAt < RATE_WINDOW_MS) {
      return NextResponse.json(
        { error: "Too many updates. Send at most one ping per 3 seconds." },
        { status: 429 },
      );
    }
    rateBucket.set(bucketKey, now);

    const session = await prisma.shareSession.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    const isOwner = session.ownerToken === token;
    const isRecipient = session.recipientToken === token;
    if (!isOwner && !isRecipient) {
      return NextResponse.json({ error: "Unauthorized token." }, { status: 403 });
    }
    if (isRecipient) {
      if (!deviceId) {
        return NextResponse.json(
          { error: RECIPIENT_DEVICE_REQUIRED_ERROR },
          { status: 400 },
        );
      }
      if (isRecipientDeviceLocked(session.recipientDeviceId, deviceId)) {
        return NextResponse.json(
          { error: RECIPIENT_DEVICE_LOCKED_ERROR },
          { status: 409 },
        );
      }
      if (!session.recipientDeviceId) {
        await prisma.shareSession.update({
          where: { id },
          data: {
            recipientDeviceId: deviceId,
            recipientDeviceBoundAt: new Date(),
          },
        });
      }
    }
    if (isExpired(session.expiresAt)) {
      await prisma.shareSession.update({
        where: { id },
        data: {
          status: session.status === "STOPPED" ? "STOPPED" : "EXPIRED",
        },
      });
      return NextResponse.json({ error: "Session expired." }, { status: 410 });
    }

    const state = effectiveStatus(session);
    if (state !== "ACCEPTED") {
      return NextResponse.json(
        { error: `Session is ${state}. Pings are allowed only after acceptance.` },
        { status: 409 },
      );
    }

    const ping = await prisma.locationPing.create({
      data: {
        sessionId: session.id,
        lat,
        lng,
        city,
        ip,
        accuracy: Number.isFinite(accuracy) ? accuracy : undefined,
        userAgent,
      },
    });

    return NextResponse.json(
      {
        id: ping.id,
        capturedAt: ping.capturedAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const isConfig = message.includes("DATABASE_URL");
    return NextResponse.json(
      { error: isConfig ? message : "Failed to save location ping." },
      { status: isConfig ? 503 : 500 },
    );
  }
}
