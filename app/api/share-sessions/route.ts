import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  makeShareToken,
  normalizeLabel,
  normalizeNote,
} from "@/lib/share-session";

const DEFAULT_EXPIRES_MINUTES = 60;
const MAX_EXPIRES_MINUTES = 24 * 60;

function resolveBaseUrl(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host) {
    return request.nextUrl.origin;
  }
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || request.nextUrl.protocol.replace(":", "") || "https";
  return `${proto}://${host}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const ownerLabel = normalizeLabel(body.ownerLabel);
    const recipientLabel = normalizeLabel(body.recipientLabel) || null;
    const note = normalizeNote(body.note);
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

    await prisma.consentEvent.create({
      data: {
        sessionId: session.id,
        action: "CREATED",
        actor: "owner",
        note,
      },
    });

    const baseUrl = resolveBaseUrl(request);
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
