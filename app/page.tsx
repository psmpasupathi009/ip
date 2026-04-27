import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import ShareCreateClient from "@/components/ShareCreateClient";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Consent Location Sharing",
  description: "Create and manage consent-based live location sessions.",
};

export default function Home() {
  return (
    <main className="min-h-full bg-background">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pt-8 sm:pt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Privacy first
            </p>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <ShieldCheck className="h-6 w-6 text-primary" />
              Consent Location Sharing
            </h1>
            <p className="text-sm text-muted-foreground">
              Invite, accept, live-share, and stop anytime with explicit consent.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/admin">Open history map</Link>
          </Button>
        </div>
      </section>
      <ShareCreateClient />
    </main>
  );
}
