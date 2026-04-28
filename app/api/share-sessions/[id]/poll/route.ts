import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  RECIPIENT_DEVICE_LOCKED_ERROR,
  RECIPIENT_DEVICE_REQUIRED_ERROR,
  assertDeviceId,
  assertToken,
  effectiveStatus,
  isExpired,
  isRecipientDeviceLocked,
} from "@/lib/share-session";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const token = assertToken(request.nextUrl.searchParams.get("token"));
    const deviceId = assertDeviceId(request.nextUrl.searchParams.get("deviceId"));
    if (!token) {
      return NextResponse.json({ error: "token is required." }, { status: 400 });
    }

    const session = await prisma.shareSession.findUnique({
      where: { id },
      include: {
        pings: {
          orderBy: { capturedAt: "desc" },
          take: 100,
        },
      },
    });
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
      if (!session.recipientDeviceId) {
        await prisma.shareSession.update({
          where: { id },
          data: {
            recipientDeviceId: deviceId,
            recipientDeviceBoundAt: new Date(),
          },
        });
        session.recipientDeviceId = deviceId;
      } else if (isRecipientDeviceLocked(session.recipientDeviceId, deviceId)) {
        return NextResponse.json(
          { error: RECIPIENT_DEVICE_LOCKED_ERROR },
          { status: 409 },
        );
      }
    }

    let status = effectiveStatus(session);
    if (status === "EXPIRED" && session.status !== "EXPIRED") {
      await prisma.shareSession.update({
        where: { id },
        data: {
          status: "EXPIRED",
        },
      });
      status = "EXPIRED";
    } else if (isExpired(session.expiresAt)) {
      status = "EXPIRED";
    }

    return NextResponse.json({
      session: {
        id: session.id,
        status,
        ownerLabel: session.ownerLabel,
        recipientLabel: session.recipientLabel ?? "",
        role: isOwner ? "owner" : "recipient",
        createdAt: session.createdAt.toISOString(),
        acceptedAt: session.acceptedAt?.toISOString() ?? null,
        stoppedAt: session.stoppedAt?.toISOString() ?? null,
        expiresAt: session.expiresAt.toISOString(),
      },
      pings: session.pings.map((p) => ({
        id: p.id,
        source: "gps",
        lat: p.lat,
        lng: p.lng,
        city: p.city ?? "",
        ip: p.ip ?? "",
        accuracy: p.accuracy ?? undefined,
        capturedAt: p.capturedAt.toISOString(),
        userAgent: p.userAgent ?? "",
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const isConfig = message.includes("DATABASE_URL");
    return NextResponse.json(
      { error: isConfig ? message : "Failed to load session." },
      { status: isConfig ? 503 : 500 },
    );
  }
}
