import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  RECIPIENT_DEVICE_LOCKED_ERROR,
  assertDeviceId,
  assertToken,
  effectiveStatus,
  isExpired,
  isRecipientDeviceLocked,
} from "@/lib/share-session";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const token = assertToken(body.token);
    const deviceId = assertDeviceId(body.deviceId);
    const action = body.action === "accept" ? "accept" : body.action === "decline" ? "decline" : null;

    if (!token || !action || !deviceId) {
      return NextResponse.json(
        { error: "token, deviceId and action (accept|decline) are required." },
        { status: 400 },
      );
    }

    const session = await prisma.shareSession.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    if (session.recipientToken !== token) {
      return NextResponse.json({ error: "Unauthorized token." }, { status: 403 });
    }
    if (isRecipientDeviceLocked(session.recipientDeviceId, deviceId)) {
      return NextResponse.json(
        { error: RECIPIENT_DEVICE_LOCKED_ERROR },
        { status: 409 },
      );
    }
    if (isExpired(session.expiresAt)) {
      await prisma.shareSession.update({
        where: { id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json({ error: "Session expired." }, { status: 410 });
    }

    const current = effectiveStatus(session);
    if (current !== "PENDING") {
      return NextResponse.json(
        { error: `Session cannot be responded to in ${current} state.` },
        { status: 409 },
      );
    }

    const nextStatus = action === "accept" ? "ACCEPTED" : "DECLINED";
    const updated = await prisma.shareSession.update({
      where: { id },
      data: {
        status: nextStatus,
        acceptedAt: action === "accept" ? new Date() : null,
        recipientDeviceId: session.recipientDeviceId ?? deviceId,
        recipientDeviceBoundAt:
          !session.recipientDeviceBoundAt && action === "accept"
            ? new Date()
            : session.recipientDeviceBoundAt,
      },
    });

    return NextResponse.json({
      sessionId: updated.id,
      status: updated.status,
      acceptedAt: updated.acceptedAt?.toISOString() ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const isConfig = message.includes("DATABASE_URL");
    return NextResponse.json(
      { error: isConfig ? message : "Failed to update consent response." },
      { status: isConfig ? 503 : 500 },
    );
  }
}
