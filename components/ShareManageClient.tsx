"use client";

import dynamic from "next/dynamic";
import { Loader2, MapPin, Shield } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MapLocation } from "@/components/MapTracker";
import {
  formatPingAge,
  latestPingCapturedAt,
  ownerRecipientGpsBanner,
} from "@/lib/gps-live-status";
import { isLifetimeExpiryIso } from "@/lib/share-session";
import { cn } from "@/lib/utils";

const MapTracker = dynamic(() => import("@/components/MapTracker"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-border/80 bg-muted/20">
      <Loader2 className="h-9 w-9 animate-spin text-primary" aria-hidden />
    </div>
  ),
});

type Props = { sessionId: string };
type PollPayload = {
  session: {
    status: string;
    expiresAt: string;
    ownerLabel: string;
    recipientLabel: string;
    role: string;
  };
  pings: Array<{
    id: string;
    source: string;
    lat: number;
    lng: number;
    city: string;
    ip: string;
    accuracy?: number;
    capturedAt: string;
    userAgent: string;
  }>;
};

function formatTimeLeft(iso: string) {
  if (isLifetimeExpiryIso(iso)) return "No expiry — until stopped";
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return "";
  if (ms <= 0) return "Session ended";
  const totalMin = Math.floor(ms / 60_000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h remaining`;
  if (h > 0) return `${h}h ${m}m remaining`;
  return `${m}m remaining`;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "ACCEPTED":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
    case "PENDING":
      return "border-amber-500/40 bg-amber-500/10 text-amber-200";
    case "DECLINED":
      return "border-rose-500/40 bg-rose-500/10 text-rose-200";
    case "STOPPED":
      return "border-zinc-500/50 bg-zinc-500/10 text-zinc-200";
    case "EXPIRED":
      return "border-zinc-600/50 bg-zinc-600/10 text-zinc-300";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

export default function ShareManageClient({ sessionId }: Props) {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState("PENDING");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [recipientLabel, setRecipientLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pings, setPings] = useState<PollPayload["pings"]>([]);
  const [gpsUiTick, setGpsUiTick] = useState(0);

  const refresh = useCallback(async () => {
    if (!token) return;
    const res = await fetch(
      `/api/share-sessions/${sessionId}/poll?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    const data = (await res.json()) as PollPayload & { error?: string };
    if (!res.ok) throw new Error(data.error || "Failed to load session.");
    setStatus(data.session.status);
    setExpiresAt(data.session.expiresAt);
    setRecipientLabel(data.session.recipientLabel ?? "");
    setPings(data.pings);
  }, [sessionId, token]);

  useEffect(() => {
    const pollMs = status === "ACCEPTED" ? 2_500 : 5_000;
    const initialLoad = setTimeout(() => {
      refresh().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
    }, 0);
    const id = setInterval(() => refresh().catch(() => {}), pollMs);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(id);
    };
  }, [refresh, status]);

  useEffect(() => {
    if (status !== "ACCEPTED") return;
    const id = window.setInterval(() => setGpsUiTick((n) => n + 1), 2000);
    return () => window.clearInterval(id);
  }, [status]);

  const ownerGpsUi = useMemo(
    () => ownerRecipientGpsBanner(status, pings),
    [status, pings, gpsUiTick],
  );
  const latestCapturedAt = useMemo(() => latestPingCapturedAt(pings), [pings]);
  const movementLiveLabel = ownerGpsUi === "live" ? "Live" : "Paused";
  const lastUpdateLabel = latestCapturedAt
    ? formatPingAge(latestCapturedAt)
    : "No updates yet";

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
        recordKind: "consent",
        sessionId,
        sessionStatus: status,
      })),
    [pings, sessionId, status],
  );

  const ownerFollowLive = status === "ACCEPTED" && mapLocations.length > 0;

  const mapDescription = useMemo(() => {
    const n = mapLocations.length;
    const parts = [
      `${n} GPS fix${n === 1 ? "" : "es"} on this session`,
      ownerFollowLive
        ? "Live trail · map follows their latest position while session is active"
        : "Recipient must start sharing from their phone after accepting",
    ];
    if (expiresAt) parts.push(formatTimeLeft(expiresAt));
    return parts.join(" · ");
  }, [mapLocations.length, expiresAt, ownerFollowLive]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:py-10">
      <Card className="overflow-hidden border-border/80 shadow-lg shadow-black/20">
        <CardHeader className="space-y-4 border-b border-border/60 bg-linear-to-br from-card via-card to-primary/6 pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <Shield className="h-5 w-5" aria-hidden />
                <span className="text-xs font-semibold uppercase tracking-wider text-primary/90">
                  Owner
                </span>
              </div>
              <CardTitle className="text-xl sm:text-2xl">Session dashboard</CardTitle>
              <CardDescription className="max-w-xl text-pretty">
                {recipientLabel ? (
                  <>
                    Tracking invite for <span className="font-medium text-foreground/90">{recipientLabel}</span>.
                    Open the recipient link on their phone so they can accept and share live GPS.
                  </>
                ) : (
                  "Open the recipient link on their phone so they can accept and share live GPS."
                )}
              </CardDescription>
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <span
                className={cn(
                  "inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                  statusBadgeClass(status),
                )}
              >
                {status.split("_").join(" ")}
              </span>
              <span
                className={cn(
                  "inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-medium",
                  ownerGpsUi === "live"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-100",
                )}
              >
                {movementLiveLabel} · Last update {lastUpdateLabel}
              </span>
              {expiresAt ? (
                <span className="text-right text-xs text-muted-foreground">{formatTimeLeft(expiresAt)}</span>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {status === "STOPPED" ? (
            <p className="text-sm text-muted-foreground">
              Session is stopped. Your dashboard and recipient links still work until someone ends them; the recipient can
              resume from their phone. Previous fixes stay on the map.
            </p>
          ) : null}
          {status === "EXPIRED" ? (
            <p className="text-sm text-muted-foreground">
              This invite used an older time-limited session. Create a new link — new sessions stay active until you stop
              them (no countdown).
            </p>
          ) : null}
          {status === "PENDING" ? (
            <p className="text-sm text-muted-foreground">
              Waiting for the recipient to accept on their device. Keep this page open to see the map once they share.
            </p>
          ) : null}
          {status === "DECLINED" ? (
            <p className="text-sm text-muted-foreground">The recipient declined this invite.</p>
          ) : null}
          {status === "ACCEPTED" ? (
            <p className="text-xs text-muted-foreground">
              Recipients only allow &amp; share once — they don&apos;t see a stop button. Use{" "}
              <strong className="font-medium text-foreground/90">Stop session</strong> here to pause tracking for everyone.
            </p>
          ) : null}
          {ownerGpsUi === "live" ? (
            <div
              className="flex items-start gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100"
              role="status"
            >
              <span className="relative mt-0.5 flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span>
                <span className="font-medium text-emerald-50">Live</span> — receiving GPS updates from the
                recipient&apos;s device.
              </span>
            </div>
          ) : null}
          {ownerGpsUi === "waiting_first" ? (
            <div
              className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
              role="status"
            >
              Waiting for the recipient to accept and start sharing on their phone — no GPS fixes yet.
            </div>
          ) : null}
          {ownerGpsUi === "stale" ? (
            <div
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
              role="status"
            >
              <span className="font-medium text-amber-50">No recent GPS fix</span> (last update{" "}
              {formatPingAge(latestPingCapturedAt(pings)!)}). Location may be off or the tab in the background — when
              GPS returns, tracking continues without a new invite.
            </div>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button variant="destructive" className="gap-2 sm:w-fit" onClick={stopSharing} disabled={status !== "ACCEPTED"}>
              <MapPin className="h-4 w-4" aria-hidden />
              Stop session
            </Button>
          </div>
          {error ? (
            <p
              className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <MapTracker
        locations={mapLocations}
        showTrail={mapLocations.length > 1 || ownerFollowLive}
        highlightLatest
        followLatest={ownerFollowLive}
        followZoom={17}
        heading="Live map"
        description={mapDescription}
      />
    </div>
  );
}
