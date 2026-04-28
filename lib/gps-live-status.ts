/** After this gap since the last stored ping, treat as "GPS paused / off" while sharing is still enabled. */
export const GPS_STALE_MS = 45_000;

export function msSinceLatestPing(pings: { capturedAt: string }[]): number | null {
  if (pings.length === 0) return null;
  let latest = 0;
  for (const p of pings) {
    const t = Date.parse(p.capturedAt);
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  return Date.now() - latest;
}

export type RecipientGpsBanner = "none" | "live" | "waiting";

/** Recipient device: browser GPS listeners still on (`sharing`) vs fresh pings arriving. */
export function recipientGpsBanner(
  sharing: boolean,
  pings: { capturedAt: string }[],
): RecipientGpsBanner {
  if (!sharing) return "none";
  const age = msSinceLatestPing(pings);
  if (age == null || age > GPS_STALE_MS) return "waiting";
  return "live";
}

export type OwnerRecipientGpsBanner = "none" | "waiting_first" | "live" | "stale";

/** Owner dashboard: infer recipient GPS activity from ping stream only. */
export function ownerRecipientGpsBanner(
  status: string,
  pings: { capturedAt: string }[],
): OwnerRecipientGpsBanner {
  if (status !== "ACCEPTED") return "none";
  if (pings.length === 0) return "waiting_first";
  const age = msSinceLatestPing(pings);
  if (age == null || age > GPS_STALE_MS) return "stale";
  return "live";
}

export function formatPingAge(isoLatest: string): string {
  const t = Date.parse(isoLatest);
  if (!Number.isFinite(t)) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function latestPingCapturedAt(pings: { capturedAt: string }[]): string | null {
  if (pings.length === 0) return null;
  let latestIso = pings[0].capturedAt;
  let latestT = Date.parse(latestIso);
  for (let i = 1; i < pings.length; i++) {
    const t = Date.parse(pings[i].capturedAt);
    if (Number.isFinite(t) && t > latestT) {
      latestT = t;
      latestIso = pings[i].capturedAt;
    }
  }
  return latestIso;
}
