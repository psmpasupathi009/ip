import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveShareBaseUrlFromRequest } from "@/lib/share-base-url";
import { makeShareToken, normalizeLabel } from "@/lib/share-session";

const DEFAULT_EXPIRES_MINUTES = 60;
/** Longest allowed session window; owner/recipient can still stop earlier. */
const MAX_EXPIRES_MINUTES = 7 * 24 * 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const ownerLabel = normalizeLabel(body.ownerLabel);
    const recipientLabel = normalizeLabel(body.recipientLabel) || null;
    const expiresMinutesRaw = Number(body.expiresMinutes);
    const expiresMinutes = Number.isFinite(expiresMinutesRaw)
      ? Math.min(Math.max(Math.floor(expiresMinutesRaw), 5), MAX_EXPIRES_MINUTES)
      : DEFAULT_EXPIRES_MINUTES;

    if (!ownerLabel) {
      return NextResponse.json(
        { error: "ownerLabel is required." },
        { status: 400 },
      );
    }

    const now = Date.now();
    const session = await prisma.shareSession.create({
      data: {
        ownerLabel,
        recipientLabel,
        ownerToken: makeShareToken(),
        recipientToken: makeShareToken(),
        expiresAt: new Date(now + expiresMinutes * 60 * 1000),
      },
    });

    const baseUrl = resolveShareBaseUrlFromRequest(request);
    const recipientUrl = `${baseUrl}/share/session/${session.id}?token=${session.recipientToken}`;
    const ownerUrl = `${baseUrl}/share/manage/${session.id}?token=${session.ownerToken}`;

    return NextResponse.json(
      {
        sessionId: session.id,
        status: session.status,
        expiresAt: session.expiresAt.toISOString(),
        recipientUrl,
        ownerUrl,
      },
      { status: 201 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const isConfig = message.includes("DATABASE_URL");
    return NextResponse.json(
      { error: isConfig ? message : `Failed to create share session: ${message}` },
      { status: isConfig ? 503 : 500 },
    );
  }
}
