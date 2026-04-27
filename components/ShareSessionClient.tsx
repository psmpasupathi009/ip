"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MapLocation } from "@/components/MapTracker";

const MapTracker = dynamic(() => import("@/components/MapTracker"), { ssr: false });

type Props = { sessionId: string };
type PollPayload = {
  session: { status: string; expiresAt: string; ownerLabel: string; recipientLabel: string; role: string };
  pings: Array<{ id: string; source: string; lat: number; lng: number; city: string; ip: string; accuracy?: number; capturedAt: string; userAgent: string }>;
};

function clearGeoWatch(watchRef: MutableRefObject<number | null>) {
  if (watchRef.current != null) {
    navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
  }
}

export default function ShareSessionClient({ sessionId }: Props) {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState("PENDING");
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pings, setPings] = useState<PollPayload["pings"]>([]);
  const watchRef = useRef<number | null>(null);
  const lastSentRef = useRef(0);

  const getPermissionHelpMessage = useCallback(() => {
    const host = window.location.hostname;
    const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "::1";
    if (!window.isSecureContext && !isLocalhost) {
      return "Location access is blocked on insecure HTTP. Open this link on HTTPS (or localhost) and allow Location in browser site settings.";
    }
    return "Location permission denied for this site. In browser settings, allow Location (Precise), then refresh and try again.";
  }, []);

  const checkLocationPermission = useCallback(async (): Promise<"granted" | "prompt" | "denied" | "unsupported"> => {
    if (typeof navigator === "undefined" || !("permissions" in navigator)) {
      return "unsupported";
    }
    try {
      const status = await navigator.permissions.query({ name: "geolocation" });
      return status.state;
    } catch {
      return "unsupported";
    }
  }, []);

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
      if (now - lastSentRef.current < 10_000) return;
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
    [sessionId, token],
  );

  async function startSharing() {
    setError(null);
    if (!token) {
      setError("Invalid link: missing session token.");
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
    clearGeoWatch(watchRef);
    setSharing(true);
    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
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
        const msg =
          geoError.code === geoError.PERMISSION_DENIED
            ? getPermissionHelpMessage()
            : "Could not read GPS location. Move to open sky and try again.";
        setError(msg);
        setSharing(false);
        clearGeoWatch(watchRef);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }

  async function stopSharing() {
    clearGeoWatch(watchRef);
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
      clearGeoWatch(watchRef);
    },
    [],
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

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Recipient consent</CardTitle>
          <CardDescription>
            Status: {status}. You can accept to allow live sharing or decline to block it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {status === "PENDING" ? (
            <div className="flex gap-2">
              <Button disabled={loading} onClick={() => respond("accept")}>
                Accept and allow tracking
              </Button>
              <Button disabled={loading} variant="outline" onClick={() => respond("decline")}>Decline</Button>
            </div>
          ) : null}
          {status === "ACCEPTED" ? (
            <div className="flex gap-2">
              <Button onClick={startSharing} disabled={sharing}>
                Start sharing from this phone
              </Button>
              <Button variant="outline" onClick={stopSharing} disabled={!sharing}>
                Stop sharing
              </Button>
            </div>
          ) : null}
          {sharing ? <p className="text-sm text-primary">Sharing active from this device.</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
      <MapTracker locations={mapLocations} />
    </div>
  );
}
