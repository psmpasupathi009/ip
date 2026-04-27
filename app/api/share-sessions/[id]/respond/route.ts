import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { assertToken, effectiveStatus, isExpired } from "@/lib/share-session";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const token = assertToken(body.token);
    const action = body.action === "accept" ? "accept" : body.action === "decline" ? "decline" : null;
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : null;

    if (!token || !action) {
      return NextResponse.json(
        { error: "token and action (accept|decline) are required." },
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
    if (isExpired(session.expiresAt)) {
      await prisma.shareSession.update({
        where: { id },
        data: { status: "EXPIRED" },
      });
      await prisma.consentEvent.create({
        data: { sessionId: id, action: "EXPIRED", actor: "system" },
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
      },
    });
    await prisma.consentEvent.create({
      data: {
        sessionId: id,
        action: action === "accept" ? "ACCEPTED" : "DECLINED",
        actor: "recipient",
        note,
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
