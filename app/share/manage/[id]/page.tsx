import { Suspense } from "react";
import type { Metadata } from "next";
import ShareManageClient from "@/components/ShareManageClient";

export const metadata: Metadata = {
  title: "Manage sharing",
  description: "Start or stop consent-based live location sharing.",
};

export default async function ShareManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <ShareManageClient sessionId={id} />
    </Suspense>
  );
}
