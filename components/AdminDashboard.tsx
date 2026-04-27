"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MapLocation } from "@/components/MapTracker";

const MapTracker = dynamic(() => import("@/components/MapTracker"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-border bg-muted/30">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
    </div>
  ),
});

export default function AdminDashboard({
  initialLocations,
}: {
  initialLocations: MapLocation[];
}) {
  const [locations, setLocations] = useState<MapLocation[]>(initialLocations);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/locations", { cache: "no-store" });
      const data = (await res.json()) as {
        locations?: MapLocation[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Failed to refresh.");
      }
      setLocations(data.locations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Operations
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Admin dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Live map of recorded fixes and full history table.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/">Tracker</Link>
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

      <Card>
        <CardHeader>
          <CardTitle>Map</CardTitle>
          <CardDescription>
            {locations.length} record{locations.length === 1 ? "" : "s"} loaded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MapTracker locations={locations} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent fixes</CardTitle>
          <CardDescription>Newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {locations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rows yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>IMEI</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Lat</TableHead>
                  <TableHead>Lng</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.map((row) => (
                  <TableRow key={row._id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {new Date(row.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.imei}</TableCell>
                    <TableCell className="max-w-[140px] truncate font-mono text-xs">
                      {row.mobile || row.sim || "—"}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate">
                      {row.city || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.lat.toFixed(4)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.lng.toFixed(4)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.ip || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
