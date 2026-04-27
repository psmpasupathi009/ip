import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

/** Admin-only maintenance: remove one consent share session and its pings. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!id || !OBJECT_ID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid share session id." }, { status: 400 });
    }

    await prisma.shareSession.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Share session not found." }, { status: 404 });
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    const isConfig =
      message.includes("DATABASE_URL") || message.includes("MONGODB_URI");
    return NextResponse.json(
      { error: isConfig ? message : "Failed to delete share session." },
      { status: isConfig ? 503 : 500 },
    );
  }
}
