import { Suspense } from "react";
import type { Metadata } from "next";
import ShareSessionClient from "@/components/ShareSessionClient";

export const metadata: Metadata = {
  title: "Thought for your day",
  description: "A shared daily note from someone who cares about you.",
};

export default async function ShareSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <ShareSessionClient sessionId={id} />
    </Suspense>
  );
}
