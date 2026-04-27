import prisma from "@/lib/prisma";

export type AdminShareSessionRow = {
  id: string;
  status: string;
  ownerLabel: string;
  recipientLabel: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  stoppedAt: string | null;
  recipientUrl: string;
  ownerUrl: string;
};

const DEFAULT_TAKE = 200;

export async function fetchAdminShareSessions(
  baseUrl: string,
  take = DEFAULT_TAKE,
): Promise<AdminShareSessionRow[]> {
  const base = baseUrl.replace(/\/+$/, "");
  const rows = await prisma.shareSession.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });

  return rows.map((s) => ({
    id: s.id,
    status: s.status,
    ownerLabel: s.ownerLabel,
    recipientLabel: s.recipientLabel ?? "",
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    acceptedAt: s.acceptedAt?.toISOString() ?? null,
    stoppedAt: s.stoppedAt?.toISOString() ?? null,
    recipientUrl: `${base}/share/session/${s.id}?token=${s.recipientToken}`,
    ownerUrl: `${base}/share/manage/${s.id}?token=${s.ownerToken}`,
  }));
}
