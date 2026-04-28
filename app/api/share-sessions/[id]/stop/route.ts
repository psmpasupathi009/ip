import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { assertToken } from "@/lib/share-session";

type Params = { params: Promise<{ id: string }> };

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
    const isRecipientToken = session.recipientToken === token;
    if (!isOwner && !isRecipientToken) {
      return NextResponse.json({ error: "Unauthorized token." }, { status: 403 });
    }
    if (!isOwner) {
      return NextResponse.json(
        { error: "Only the session owner can end tracking from the owner dashboard." },
        { status: 403 },
      );
    }
    if (session.status === "STOPPED") {
      return NextResponse.json({ ok: true, status: session.status });
    }

    const updated = await prisma.shareSession.update({
      where: { id },
      data: {
        status: "STOPPED",
        stoppedAt: new Date(),
      },
    });
    return NextResponse.json({
      ok: true,
      status: updated.status,
      stoppedAt: updated.stoppedAt?.toISOString() ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const isConfig = message.includes("DATABASE_URL");
    return NextResponse.json(
      { error: isConfig ? message : "Failed to stop session." },
      { status: isConfig ? 503 : 500 },
    );
  }
}
