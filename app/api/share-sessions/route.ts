import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveShareBaseUrlFromRequest } from "@/lib/share-base-url";
import { makeShareToken, normalizeLabel } from "@/lib/share-session";

/** Stored as session end time; `isLifetimeExpiry` treats this as “no timer” (until stopped). */
const LIFETIME_EXPIRES_AT = new Date(Date.UTC(2099, 11, 31, 23, 59, 59, 999));

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const ownerLabel = normalizeLabel(body.ownerLabel);
    const recipientLabel = normalizeLabel(body.recipientLabel) || null;

    if (!ownerLabel) {
      return NextResponse.json(
        { error: "ownerLabel is required." },
        { status: 400 },
      );
    }

    const session = await prisma.shareSession.create({
      data: {
        ownerLabel,
        recipientLabel,
        ownerToken: makeShareToken(),
        recipientToken: makeShareToken(),
        expiresAt: LIFETIME_EXPIRES_AT,
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
