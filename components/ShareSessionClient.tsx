"use client";

import dynamic from "next/dynamic";
import { Loader2, MapPin, Radio, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MapLocation } from "@/components/MapTracker";
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
    acceptedAt?: string | null;
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

function clearGeoWatch(watchRef: MutableRefObject<number | null>) {
  if (watchRef.current != null) {
    navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
  }
}

function formatTimeLeft(iso: string) {
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

export default function ShareSessionClient({ sessionId }: Props) {
  const MIN_PING_GAP_MS = 5_000;
  const FALLBACK_SAMPLE_MS = 12_000;
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState("PENDING");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [ownerLabel, setOwnerLabel] = useState("");
  const [recipientLabel, setRecipientLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pings, setPings] = useState<PollPayload["pings"]>([]);
  const watchRef = useRef<number | null>(null);
  const sampleIntervalRef = useRef<number | null>(null);
  const lastSentRef = useRef(0);

  const clearSampling = useCallback(() => {
    clearGeoWatch(watchRef);
    if (sampleIntervalRef.current != null) {
      window.clearInterval(sampleIntervalRef.current);
      sampleIntervalRef.current = null;
    }
  }, []);

  const getPermissionHelpMessage = useCallback(() => {
    const host = window.location.hostname;
    const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "::1";
    if (!window.isSecureContext && !isLocalhost) {
      return "Location access is blocked on insecure HTTP. Open this link on HTTPS (or localhost) and allow Location in browser site settings.";
    }
    return "Location permission denied for this site. In browser settings, allow Location (Precise), then refresh and try again.";
  }, []);

  const checkLocationPermission = useCallback(async (): Promise<
    "granted" | "prompt" | "denied" | "unsupported"
  > => {
    if (typeof navigator === "undefined" || !("permissions" in navigator)) {
      return "unsupported";
    }
    try {
      const permStatus = await navigator.permissions.query({ name: "geolocation" });
      return permStatus.state;
    } catch {
      return "unsupported";
    }
  }, []);

  const refresh = useCallback(async (): Promise<PollPayload | null> => {
    if (!token) return null;
    const res = await fetch(
      `/api/share-sessions/${sessionId}/poll?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    const data = (await res.json()) as PollPayload & { error?: string };
    if (!res.ok) throw new Error(data.error || "Failed to load session.");
    setStatus(data.session.status);
    setExpiresAt(data.session.expiresAt);
    setOwnerLabel(data.session.ownerLabel);
    setRecipientLabel(data.session.recipientLabel ?? "");
    setPings(data.pings);
    return data;
  }, [sessionId, token]);

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      refresh().catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
    }, 0);
    const id = setInterval(() => {
      refresh().catch(() => {});
    }, 5000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(id);
    };
  }, [refresh]);

  async function respond(action: "accept" | "decline") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/share-sessions/${sessionId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to submit response.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setLoading(false);
    }
  }

  const sendPing = useCallback(
    async (coords: { lat: number; lng: number; accuracy?: number; city?: string }) => {
      const now = Date.now();
      if (now - lastSentRef.current < MIN_PING_GAP_MS) return;
      lastSentRef.current = now;
      const res = await fetch(`/api/share-sessions/${sessionId}/ping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          lat: coords.lat,
          lng: coords.lng,
          accuracy: coords.accuracy,
          city: coords.city || "",
          source: "gps",
          userAgent: navigator.userAgent,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Ping failed");
      }
    },
    [MIN_PING_GAP_MS, sessionId, token],
  );

  async function startSharing() {
    setError(null);
    if (!token) {
      setError("Invalid link: missing session token.");
      return;
    }
    const latest = await refresh().catch((e) => {
      setError(e instanceof Error ? e.message : "Failed to load session.");
      return null;
    });
    if (!latest) return;

    let liveStatus = latest.session.status;
    if (liveStatus === "STOPPED") {
      const res = await fetch(`/api/share-sessions/${sessionId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error || "Could not re-open this session for sharing.");
        return;
      }
      const again = await refresh().catch(() => null);
      liveStatus = again?.session.status ?? "ACCEPTED";
    }
    if (liveStatus !== "ACCEPTED") {
      setError("This link is not active for sharing right now (declined, expired, or still pending).");
      return;
    }

    if (!navigator.geolocation) {
      setError("Geolocation not supported.");
      return;
    }
    if (!window.isSecureContext) {
      const host = window.location.hostname;
      const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "::1";
      if (!isLocalhost) {
        setError(
          "Location requires HTTPS on this device. Open the share link on HTTPS (not local network HTTP) and try again.",
        );
        return;
      }
    }
    const permission = await checkLocationPermission();
    if (permission === "denied") {
      setError(getPermissionHelpMessage());
      return;
    }
    clearSampling();
    setSharing(true);
    lastSentRef.current = 0;

    const pushCurrentPosition = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            setError(null);
            await sendPing({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy ?? undefined,
              city: "GPS fix",
            });
            await refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Ping failed.");
          }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
      );
    };

    // Try to send an immediate first sample instead of waiting for watch callbacks.
    pushCurrentPosition();
    sampleIntervalRef.current = window.setInterval(pushCurrentPosition, FALLBACK_SAMPLE_MS);

    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          setError(null);
          await sendPing({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? undefined,
            city: "GPS fix",
          });
          await refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Ping failed.");
        }
      },
      (geoError) => {
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setError(getPermissionHelpMessage());
          setSharing(false);
          clearSampling();
          return;
        }
        // One-off timeouts / gaps are common; keep listening and rely on interval + next watch fixes.
        const transient =
          geoError.code === geoError.TIMEOUT
            ? "GPS timed out briefly; still listening. Automatic retries continue."
            : "Brief GPS gap; still listening. Last fixes stay on the map.";
        setError(transient);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }

  async function stopSharing() {
    clearSampling();
    setSharing(false);
    try {
      await fetch(`/api/share-sessions/${sessionId}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reason: "stop" }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to stop sharing.");
    }
  }

  useEffect(
    () => () => {
      clearSampling();
    },
    [clearSampling],
  );

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

  const mapDescription = useMemo(() => {
    const n = mapLocations.length;
    const parts = [
      `${n} GPS fix${n === 1 ? "" : "es"}`,
      "Map updates every few seconds while this page is open",
    ];
    if (expiresAt) parts.push(formatTimeLeft(expiresAt));
    return parts.join(" · ");
  }, [mapLocations.length, expiresAt]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:py-10">
      <Card className="overflow-hidden border-border/80 shadow-lg shadow-black/20">
        <CardHeader className="space-y-4 border-b border-border/60 bg-gradient-to-br from-card via-card to-primary/[0.06] pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <ShieldCheck className="h-5 w-5" aria-hidden />
                <span className="text-xs font-semibold uppercase tracking-wider text-primary/90">
                  Consent
                </span>
              </div>
              <CardTitle className="text-xl sm:text-2xl">Recipient session</CardTitle>
              <CardDescription className="max-w-xl text-pretty">
                {ownerLabel ? (
                  <span>
                    <span className="font-medium text-foreground/90">{ownerLabel}</span>
                    {recipientLabel ? (
                      <span className="text-muted-foreground"> · with {recipientLabel}</span>
                    ) : null}{" "}
                    invited you to share location. Accept only if you trust them.
                  </span>
                ) : (
                  "Accept only if you trust the sender. You control when GPS sharing runs."
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
              {expiresAt ? (
                <span className="text-right text-xs text-muted-foreground">{formatTimeLeft(expiresAt)}</span>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {status === "PENDING" ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button disabled={loading} className="gap-2 sm:min-w-[200px]" onClick={() => respond("accept")}>
                <Radio className="h-4 w-4" aria-hidden />
                Accept &amp; allow live GPS
              </Button>
              <Button disabled={loading} variant="outline" onClick={() => respond("decline")}>
                Decline
              </Button>
            </div>
          ) : null}
          {status === "ACCEPTED" || status === "STOPPED" ? (
            <div className="space-y-3">
              {status === "STOPPED" ? (
                <p className="text-sm text-muted-foreground">
                  Sharing was stopped. This same link still works: your previous locations stay on the map, and you can
                  start again anytime until the session expires.
                </p>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button onClick={startSharing} disabled={sharing} className="gap-2 sm:min-w-[220px]">
                  <MapPin className="h-4 w-4" aria-hidden />
                  {sharing ? "Sharing…" : status === "STOPPED" ? "Share location again" : "Start sharing from this phone"}
                </Button>
                <Button variant="outline" onClick={stopSharing} disabled={!sharing}>
                  Stop sharing
                </Button>
              </div>
            </div>
          ) : null}
          {status === "EXPIRED" ? (
            <p className="text-sm text-muted-foreground">
              This session has expired. Ask the sender for a new share link if you need to share again.
            </p>
          ) : null}
          {status === "DECLINED" ? (
            <p className="text-sm text-muted-foreground">You declined this invite. The map below may still show any data from before you declined.</p>
          ) : null}
          {sharing ? (
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Live GPS is active on this device.
            </p>
          ) : null}
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
        showTrail={mapLocations.length > 1}
        highlightLatest
        heading="Live map"
        description={mapDescription}
      />
    </div>
  );
}
