import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { assertToken, isExpired } from "@/lib/share-session";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/** Re-open a stopped session so the same links can receive new GPS pings until expiry. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const token = assertToken(body.token);

    if (!token) {
      return NextResponse.json({ error: "token is required." }, { status: 400 });
    }

    const session = await prisma.shareSession.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    const isOwner = session.ownerToken === token;
    const isRecipient = session.recipientToken === token;
    if (!isOwner && !isRecipient) {
      return NextResponse.json({ error: "Unauthorized token." }, { status: 403 });
    }

    if (isExpired(session.expiresAt)) {
      if (session.status !== "EXPIRED") {
        await prisma.shareSession.update({
          where: { id },
          data: { status: "EXPIRED" },
        });
      }
      return NextResponse.json({ error: "Session expired." }, { status: 410 });
    }

    if (session.status === "ACCEPTED") {
      return NextResponse.json({ ok: true, status: session.status });
    }
    if (session.status !== "STOPPED") {
      return NextResponse.json(
        { error: `Session cannot be resumed from ${session.status}.` },
        { status: 409 },
      );
    }

    const updated = await prisma.shareSession.update({
      where: { id },
      data: {
        status: "ACCEPTED",
        stoppedAt: null,
      },
    });

    return NextResponse.json({
      ok: true,
      status: updated.status,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const isConfig = message.includes("DATABASE_URL");
    return NextResponse.json(
      { error: isConfig ? message : "Failed to resume session." },
      { status: isConfig ? 503 : 500 },
    );
  }
}
