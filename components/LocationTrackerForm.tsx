"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Loader2, MapPin, Radio, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LiveFix = {
  source: "gps" | "ip";
  lat: number;
  lng: number;
  city: string;
  accuracy?: number;
  ip?: string;
};

async function fetchIpLocation(): Promise<{
  lat: number;
  lng: number;
  city: string;
  ip: string;
}> {
  const res = await fetch("https://ipapi.co/json/");
  if (!res.ok) throw new Error("IP location lookup failed.");
  const data = (await res.json()) as Record<string, unknown>;
  const lat = Number(data.latitude);
  const lng = Number(data.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("IP location did not include coordinates.");
  }
  const city =
    [data.city, data.region, data.country_name].filter(Boolean).join(", ") ||
    String(data.country_name ?? "");
  const ip = String(data.ip ?? "");
  return { lat, lng, city, ip };
}

function mobileLooksValid(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

export default function LocationTrackerForm() {
  const [imei, setImei] = useState("");
  const [mobile, setMobile] = useState("");
  const [consentOpen, setConsentOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [live, setLive] = useState<LiveFix | null>(null);

  const persist = useCallback(
    async (payload: {
      lat: number;
      lng: number;
      city: string;
      ip: string;
      accuracy?: number;
    }) => {
      const userAgent =
        typeof navigator !== "undefined" ? navigator.userAgent : "";
      const res = await fetch("/api/save-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imei: imei.trim(),
          mobile: mobile.trim(),
          sim: "",
          lat: payload.lat,
          lng: payload.lng,
          city: payload.city,
          ip: payload.ip,
          accuracy: payload.accuracy,
          userAgent,
          timestamp: new Date().toISOString(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Could not save location.");
      }
      setSavedOk(true);
    },
    [imei, mobile],
  );

  const runTrack = useCallback(async () => {
    setError(null);
    setSavedOk(false);
    setLoading(true);
    setLive(null);

    if (!imei.trim()) {
      setError("IMEI is required.");
      setLoading(false);
      return;
    }
    if (!mobile.trim() || !mobileLooksValid(mobile)) {
      setError(
        "Enter a valid mobile number (8–15 digits; you can include +, spaces, or dashes).",
      );
      setLoading(false);
      return;
    }

    const tryGps = (): Promise<GeolocationPosition> =>
      new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Geolocation is not supported in this browser."));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });

    try {
      try {
        const pos = await tryGps();
        const { latitude, longitude, accuracy } = pos.coords;
        const fix: LiveFix = {
          source: "gps",
          lat: latitude,
          lng: longitude,
          city: "GPS fix",
          accuracy: accuracy ?? undefined,
        };
        setLive(fix);
        await persist({
          lat: latitude,
          lng: longitude,
          city: fix.city,
          ip: "",
          accuracy: accuracy ?? undefined,
        });
      } catch {
        const ipLoc = await fetchIpLocation();
        const fix: LiveFix = {
          source: "ip",
          lat: ipLoc.lat,
          lng: ipLoc.lng,
          city: ipLoc.city || "Approximate (IP)",
          ip: ipLoc.ip,
        };
        setLive(fix);
        await persist({
          lat: ipLoc.lat,
          lng: ipLoc.lng,
          city: fix.city,
          ip: ipLoc.ip,
          accuracy: undefined,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tracking failed.");
    } finally {
      setLoading(false);
    }
  }, [imei, mobile, persist]);

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col gap-6 px-4 py-10 sm:py-16">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Radio className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Field ops
              </p>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Location tracker
              </h1>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin">Admin</Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Enter the device IMEI and subscriber mobile number, then record GPS or
          fall back to city-level IP location when GPS is unavailable.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-primary" aria-hidden />
            Track session
          </CardTitle>
          <CardDescription>
            IMEI and mobile number are required for each saved location.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="imei">IMEI</Label>
            <Input
              id="imei"
              name="imei"
              placeholder="e.g. 352094089652024"
              value={imei}
              onChange={(e) => setImei(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mobile">Mobile number</Label>
            <Input
              id="mobile"
              name="mobile"
              type="tel"
              inputMode="tel"
              placeholder="e.g. +1 555 010 2034"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              autoComplete="tel"
            />
          </div>

          <Button
            type="button"
            className="w-full"
            disabled={loading}
            onClick={() => setConsentOpen(true)}
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Working…
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Track location
              </>
            )}
          </Button>

          {error ? (
            <p
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {savedOk ? (
            <p className="text-sm text-primary">Location saved to the server.</p>
          ) : null}

          {live ? (
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
              <p className="font-medium text-foreground">
                {live.source === "gps" ? "GPS fix" : "IP fallback"}
              </p>
              <dl className="mt-2 grid grid-cols-1 gap-1 text-muted-foreground sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase">Latitude</dt>
                  <dd className="font-mono text-foreground">{live.lat.toFixed(6)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase">Longitude</dt>
                  <dd className="font-mono text-foreground">{live.lng.toFixed(6)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase">City / label</dt>
                  <dd className="text-foreground">{live.city}</dd>
                </div>
                {live.accuracy != null ? (
                  <div>
                    <dt className="text-xs uppercase">Accuracy (m)</dt>
                    <dd className="font-mono text-foreground">
                      {Math.round(live.accuracy)}
                    </dd>
                  </div>
                ) : null}
                {live.ip ? (
                  <div>
                    <dt className="text-xs uppercase">IP (client)</dt>
                    <dd className="font-mono text-foreground">{live.ip}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={consentOpen} onOpenChange={setConsentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Location consent</DialogTitle>
            <DialogDescription className="text-left leading-relaxed">
              This page requests your browser&apos;s precise location via the
              HTML5 Geolocation API. If you deny access or GPS is unavailable, we
              use{" "}
              <a
                className="text-primary underline-offset-2 hover:underline"
                href="https://ipapi.co"
                target="_blank"
                rel="noreferrer"
              >
                ipapi.co
              </a>{" "}
              for approximate city-level coordinates from your IP. Data is sent to
              our servers and stored for the admin dashboard.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConsentOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={async () => {
                setConsentOpen(false);
                await runTrack();
              }}
            >
              Allow &amp; track
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
