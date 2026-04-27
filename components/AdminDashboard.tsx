"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { Check, Copy, Loader2, RefreshCw, Trash2 } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MapLocation } from "@/components/MapTracker";
import type { AdminShareSessionRow } from "@/lib/admin-share-sessions-list";
import { formatUtcDateTime } from "@/lib/format-timestamp";
import { parseUserAgent } from "@/lib/user-agent";
import { cn } from "@/lib/utils";

const MapTracker = dynamic(() => import("@/components/MapTracker"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-border bg-muted/30">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
    </div>
  ),
});

type LocationsResponse = {
  locations?: MapLocation[];
  limit?: number;
  returned?: number;
  counts?: { tracker: number; consent: number; merged: number };
  error?: string;
};

type ShareSessionsResponse = {
  sessions?: AdminShareSessionRow[];
  error?: string;
};

export default function AdminDashboard({
  initialLocations,
  initialLoadError = null,
  initialCounts = null,
  initialShareSessions = [],
  initialShareSessionsError = null,
}: {
  initialLocations: MapLocation[];
  initialLoadError?: string | null;
  initialCounts?: { tracker: number; consent: number; merged: number } | null;
  initialShareSessions?: AdminShareSessionRow[];
  initialShareSessionsError?: string | null;
}) {
  const [locations, setLocations] = useState<MapLocation[]>(initialLocations);
  const [listLimit, setListLimit] = useState(500);
  const [sourceCounts, setSourceCounts] = useState(initialCounts);
  const [shareSessions, setShareSessions] = useState<AdminShareSessionRow[]>(initialShareSessions);
  const [shareSessionsError, setShareSessionsError] = useState<string | null>(
    initialShareSessionsError ?? null,
  );
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(initialLoadError ?? null);
  const [pendingDelete, setPendingDelete] = useState<MapLocation | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const mapSectionRef = useRef<HTMLDivElement | null>(null);

  const latestMapLocations = useMemo(() => {
    // Keep one latest marker per logical source (tracker device or consent session).
    const latestByKey = new Map<string, MapLocation>();
    for (const row of locations) {
      const key =
        row.recordKind === "consent"
          ? `consent:${row.sessionId ?? row._id}`
          : `tracker:${row.imei}:${row.mobile ?? ""}:${row.sim ?? ""}`;
      const prev = latestByKey.get(key);
      if (!prev) {
        latestByKey.set(key, row);
        continue;
      }
      if (new Date(row.timestamp).getTime() > new Date(prev.timestamp).getTime()) {
        latestByKey.set(key, row);
      }
    }
    return Array.from(latestByKey.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [locations]);

  const mapLocations = useMemo(() => {
    if (!activeSessionId) return latestMapLocations;
    return latestMapLocations.filter(
      (row) => row.recordKind === "consent" && row.sessionId === activeSessionId,
    );
  }, [activeSessionId, latestMapLocations]);

  const copySessionUrl = useCallback(async (url: string, key: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedLinkKey(key);
    window.setTimeout(() => {
      setCopiedLinkKey((k) => (k === key ? null : k));
    }, 2000);
  }, []);

  const focusSessionOnMap = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    window.setTimeout(() => {
      mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const locRes = await fetch("/api/locations", { cache: "no-store" });
      const data = (await locRes.json()) as LocationsResponse;
      if (!locRes.ok) {
        throw new Error(data.error || "Failed to refresh locations.");
      }
      setLocations(data.locations ?? []);
      if (typeof data.limit === "number") setListLimit(data.limit);
      if (data.counts) setSourceCounts(data.counts);

      const sessRes = await fetch("/api/admin/share-sessions", { cache: "no-store" });
      const sess = (await sessRes.json()) as ShareSessionsResponse;
      if (!sessRes.ok) {
        setShareSessionsError(sess.error || "Failed to refresh share links.");
      } else {
        setShareSessions(sess.sessions ?? []);
        setShareSessionsError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    if (pendingDelete.recordKind === "consent") {
      setError("Consent pings cannot be deleted from this screen (they belong to a share session).");
      setPendingDelete(null);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/locations/${pendingDelete._id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Delete failed.");
      }
      setLocations((prev) => prev.filter((r) => r._id !== pendingDelete._id));
      setPendingDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete]);

  return (
    <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Operations
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Admin dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Shows <strong>IMEI tracker fixes</strong> plus <strong>consent live GPS pings</strong> in one feed (newest
            first). Delete is only available for tracker rows.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/">Consent sharing</Link>
          </Button>
          <Button type="button" variant="secondary" disabled={loading} onClick={refresh}>
            {loading ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <p
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {shareSessionsError ? (
        <p
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
          role="status"
        >
          Share links could not be loaded: {shareSessionsError}
        </p>
      ) : null}

      <Card ref={mapSectionRef}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>
              Map
              {activeSessionId ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (session filter active)
                </span>
              ) : null}
            </CardTitle>
            {activeSessionId ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setActiveSessionId(null)}>
                Show all
              </Button>
            ) : null}
          </div>
          <CardDescription>
            {mapLocations.length} merged point{mapLocations.length === 1 ? "" : "s"}
            {activeSessionId ? " for selected session" : ""} (cap {listLimit}).
            {sourceCounts ? (
              <span>
                {" "}
                Loaded from DB: {sourceCounts.tracker} tracker · {sourceCounts.consent} consent pings.
              </span>
            ) : null}{" "}
            Scroll down for the full table (device, browser, coordinates, IP).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MapTracker
            locations={mapLocations}
            heading="Fleet map"
            description={`${mapLocations.length} latest device/session point${mapLocations.length === 1 ? "" : "s"} · Switch basemap in the corner`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Created consent links</CardTitle>
          <CardDescription>
            All recent <code className="rounded bg-muted px-1 text-xs">ShareSession</code> rows from the database (newest
            first, last 200). Recipient and owner URLs include their private tokens — treat this page as sensitive.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {shareSessions.length === 0 && !shareSessionsError ? (
            <p className="text-sm text-muted-foreground">No share sessions found yet.</p>
          ) : shareSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rows (see message above).</p>
          ) : (
            <div className="relative max-h-[min(60vh,640px)] overflow-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="sticky top-0 z-10 bg-card">Created (UTC)</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Expires (UTC)</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Status</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Owner</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Recipient</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card min-w-[200px]">Recipient link</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card min-w-[200px]">Owner link</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Session id</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-right">Map</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shareSessions.map((s) => {
                    const rk = (suffix: string) => `${s.id}-${suffix}`;
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {formatUtcDateTime(s.createdAt)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {formatUtcDateTime(s.expiresAt)}
                        </TableCell>
                        <TableCell className="text-xs capitalize">{s.status.toLowerCase()}</TableCell>
                        <TableCell className="max-w-[120px] truncate text-sm">{s.ownerLabel}</TableCell>
                        <TableCell className="max-w-[120px] truncate text-sm">
                          {s.recipientLabel?.trim() ? s.recipientLabel : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex max-w-[280px] gap-1">
                            <Input readOnly className="h-8 min-w-0 font-mono text-[10px]" value={s.recipientUrl} />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 shrink-0 px-2"
                              onClick={() => copySessionUrl(s.recipientUrl, rk("rec"))}
                            >
                              {copiedLinkKey === rk("rec") ? (
                                <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                              ) : (
                                <Copy className="h-3.5 w-3.5" aria-hidden />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex max-w-[280px] gap-1">
                            <Input readOnly className="h-8 min-w-0 font-mono text-[10px]" value={s.ownerUrl} />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 shrink-0 px-2"
                              onClick={() => copySessionUrl(s.ownerUrl, rk("own"))}
                            >
                              {copiedLinkKey === rk("own") ? (
                                <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                              ) : (
                                <Copy className="h-3.5 w-3.5" aria-hidden />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[100px] truncate font-mono text-[10px]" title={s.id}>
                          {s.id.slice(-10)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => focusSessionOnMap(s.id)}
                          >
                            View on map
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Location history</CardTitle>
          <CardDescription>
            Same points as the map: <code className="rounded bg-muted px-1 text-xs">Location</code> (IMEI tracker) and{" "}
            <code className="rounded bg-muted px-1 text-xs">LocationPing</code> (consent live share), merged by time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {locations.length === 0 && !error ? (
            <p className="text-sm text-muted-foreground">
              No rows returned. If you only use consent sharing, older builds hid those pings — refresh after deploy.
              Otherwise confirm Mongo <code className="rounded bg-muted px-1 text-xs">DATABASE_URL</code> points to
              the project database.
            </p>
          ) : locations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rows loaded (see error above).</p>
          ) : (
            <div className="relative max-h-[min(70vh,720px)] overflow-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="sticky top-0 z-10 bg-card">Time (UTC)</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Type</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Session</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">IMEI / ref</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">SIM / status</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Mobile</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">City</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Lat</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Lng</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">±m</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">IP</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Device / Browser</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locations.map((row) => {
                    const ua = parseUserAgent(row.userAgent || "");
                    return (
                      <TableRow key={row._id}>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {formatUtcDateTime(row.timestamp)}
                        </TableCell>
                        <TableCell className="text-xs capitalize">
                          {row.recordKind === "consent" ? "Consent" : "Tracker"}
                        </TableCell>
                        <TableCell
                          className="max-w-[100px] truncate font-mono text-xs"
                          title={row.sessionId ?? undefined}
                        >
                          {row.sessionId ? row.sessionId.slice(-10) : "—"}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate font-mono text-xs">{row.imei}</TableCell>
                        <TableCell className="max-w-[100px] truncate font-mono text-xs">
                          {row.sim?.trim() ? row.sim : "—"}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate font-mono text-xs">
                          {row.mobile?.trim() ? row.mobile : "—"}
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate text-sm">{row.city || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{row.lat.toFixed(7)}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{row.lng.toFixed(7)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {typeof row.accuracy === "number" && Number.isFinite(row.accuracy)
                            ? `${Math.round(row.accuracy)}`
                            : "—"}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate font-mono text-xs">{row.ip || "—"}</TableCell>
                        <TableCell className="max-w-[220px]">
                          <div className="space-y-0.5">
                            <p className="truncate text-xs">
                              {ua.deviceType} · {ua.os}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{ua.browser}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {row.recordKind === "consent" ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className={cn("text-destructive hover:text-destructive")}
                              onClick={() => setPendingDelete(row)}
                              aria-label={`Delete row ${row._id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={pendingDelete != null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this location fix?</DialogTitle>
            <DialogDescription>
              This permanently removes one <strong>IMEI tracker</strong> record from the{" "}
              <code className="rounded bg-muted px-1 text-xs">Location</code> collection. Consent pings cannot be
              deleted here.
            </DialogDescription>
          </DialogHeader>
          {pendingDelete ? (
            <ul className="list-inside list-disc px-6 font-mono text-xs text-foreground/90 sm:px-0">
              <li>IMEI: {pendingDelete.imei}</li>
              <li>Time: {formatUtcDateTime(pendingDelete.timestamp)}</li>
              <li>
                Position: {pendingDelete.lat.toFixed(7)}, {pendingDelete.lng.toFixed(7)}
              </li>
            </ul>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
