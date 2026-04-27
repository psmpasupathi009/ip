"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MapLocation } from "@/components/MapTracker";

const MapTracker = dynamic(() => import("@/components/MapTracker"), { ssr: false });

type Props = { sessionId: string };
type PollPayload = {
  session: { status: string; expiresAt: string; role: string };
  pings: Array<{ id: string; source: string; lat: number; lng: number; city: string; ip: string; accuracy?: number; capturedAt: string; userAgent: string }>;
};

export default function ShareManageClient({ sessionId }: Props) {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState("PENDING");
  const [error, setError] = useState<string | null>(null);
  const [pings, setPings] = useState<PollPayload["pings"]>([]);

  const refresh = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`/api/share-sessions/${sessionId}/poll?token=${encodeURIComponent(token)}`, { cache: "no-store" });
    const data = (await res.json()) as PollPayload & { error?: string };
    if (!res.ok) throw new Error(data.error || "Failed to load session.");
    setStatus(data.session.status);
    setPings(data.pings);
  }, [sessionId, token]);

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      refresh().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
    }, 0);
    const id = setInterval(() => refresh().catch(() => {}), 5000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(id);
    };
  }, [refresh]);

  async function stopSharing() {
    await fetch(`/api/share-sessions/${sessionId}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, reason: "stop" }),
    });
    await refresh();
  }

  const mapLocations: MapLocation[] = useMemo(
    () =>
      pings.map((p) => ({
        _id: p.id,
        imei: "consent-session",
        sim: "",
        mobile: "",
        lat: p.lat,
        lng: p.lng,
        city: p.city || "",
        source: p.source || "gps",
        ip: p.ip || "",
        accuracy: p.accuracy,
        timestamp: p.capturedAt,
        userAgent: p.userAgent || "",
      })),
    [pings],
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Owner controls</CardTitle>
          <CardDescription>
            Status: {status}. Your friend shares from their phone after accepting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button variant="outline" onClick={stopSharing} disabled={status !== "ACCEPTED"}>
              Revoke / Stop session
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Open the recipient link on your friend&apos;s phone and ask them to tap
            &quot;Start sharing from this phone&quot; after accepting consent.
          </p>
          <p className="text-xs text-muted-foreground">
            Strict GPS mode is enabled, so only GPS pings are accepted.
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
      <MapTracker locations={mapLocations} />
    </div>
  );
}
