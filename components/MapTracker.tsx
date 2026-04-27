"use client";

import { Fragment, useEffect, useMemo } from "react";
import L from "leaflet";
import {
  Circle,
  CircleMarker,
  LayersControl,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  ScaleControl,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { formatUtcDateTime } from "@/lib/format-timestamp";
import { parseUserAgent } from "@/lib/user-agent";

let leafletIconsPatched = false;

export type MapLocation = {
  _id: string;
  imei: string;
  sim?: string;
  mobile?: string;
  lat: number;
  lng: number;
  city: string;
  ip: string;
  accuracy?: number;
  timestamp: string;
  userAgent: string;
  source?: string;
  /** Admin merged feed: IMEI tracker vs consent-session GPS ping */
  recordKind?: "tracker" | "consent";
  sessionId?: string;
  sessionStatus?: string;
  ownerLabel?: string;
  recipientLabel?: string;
};

export type MapTrackerProps = {
  locations: MapLocation[];
  /** Draw a path through fixes in chronological order (single-track live sessions). */
  showTrail?: boolean;
  /** Pulse + accuracy ring on the newest fix (best with `showTrail` or sparse points). */
  highlightLatest?: boolean;
  heading?: string;
  description?: string;
};

const CARTO_DARK =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const OSM = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ESRI_SATELLITE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

function fixDefaultIcons() {
  if (leafletIconsPatched) return;
  leafletIconsPatched = true;
  const proto = L.Icon.Default.prototype as unknown as {
    _getIconUrl?: unknown;
  };
  if ("_getIconUrl" in proto) {
    delete proto._getIconUrl;
  }
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
    iconUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  });
}

const latestPulseIcon = L.divIcon({
  className: "map-pulse-marker",
  html: '<div class="map-pulse-dot" aria-hidden="true"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -12],
});

/** WGS84 degrees — 7 decimals ≈ ~1.1 cm precision at equator (display only). */
function formatCoord(n: number) {
  return n.toFixed(7);
}

function formatPopup(loc: MapLocation) {
  const ua = parseUserAgent(loc.userAgent || "");
  const isConsent = loc.recordKind === "consent";
  return (
    <div className="min-w-[200px] space-y-1.5 text-xs leading-snug text-foreground">
      <p className="font-semibold tracking-tight">
        {isConsent ? "Consent live ping" : "IMEI tracker fix"}
      </p>
      {isConsent && loc.sessionId ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          Session: {loc.sessionId}
          {loc.sessionStatus ? ` · ${loc.sessionStatus}` : ""}
        </p>
      ) : null}
      {isConsent && (loc.ownerLabel || loc.recipientLabel) ? (
        <p>
          <span className="text-muted-foreground">Parties:</span>{" "}
          {loc.ownerLabel ?? "—"}
          {loc.recipientLabel ? ` → ${loc.recipientLabel}` : ""}
        </p>
      ) : null}
      <p className="font-mono text-[11px] text-muted-foreground">{loc.imei}</p>
      {loc.mobile || loc.sim ? (
        <p>
          <span className="text-muted-foreground">{isConsent ? "Summary:" : "Mobile:"}</span>{" "}
          {loc.mobile || loc.sim}
        </p>
      ) : null}
      <p>
        <span className="text-muted-foreground">Place:</span>{" "}
        {loc.city?.trim() ? loc.city : "—"}
      </p>
      <p className="font-mono text-[11px]">
        {formatCoord(loc.lat)}, {formatCoord(loc.lng)}
      </p>
      <p className="text-[10px] text-muted-foreground">
        Marker is placed at these stored WGS84 coordinates. Phone GPS accuracy can still be tens of meters unless
        conditions are ideal.
      </p>
      {typeof loc.accuracy === "number" && Number.isFinite(loc.accuracy) ? (
        <p>
          <span className="text-muted-foreground">Accuracy:</span> ±
          {Math.round(loc.accuracy)} m
        </p>
      ) : null}
      {loc.source ? (
        <p>
          <span className="text-muted-foreground">Source:</span>{" "}
          {loc.source.toUpperCase()}
        </p>
      ) : null}
      {loc.ip ? (
        <p className="break-all">
          <span className="text-muted-foreground">IP:</span> {loc.ip}
        </p>
      ) : null}
      <p>
        <span className="text-muted-foreground">Device:</span>{" "}
        {ua.deviceType} · {ua.os}
      </p>
      <p>
        <span className="text-muted-foreground">Browser:</span> {ua.browser}
      </p>
      {loc.userAgent ? (
        <p className="line-clamp-2 break-all font-mono text-[10px] text-muted-foreground">
          {loc.userAgent}
        </p>
      ) : null}
      <p className="text-muted-foreground">{formatUtcDateTime(loc.timestamp)}</p>
    </div>
  );
}

function MapBounds({
  points,
  padLatLng,
}: {
  points: [number, number][];
  padLatLng?: [number, number];
}) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    fixDefaultIcons();
    const sync = () => {
      // Fixes tiles/markers misaligned after layout changes (scroll, dynamic height).
      requestAnimationFrame(() => map.invalidateSize());
    };
    if (points.length === 1) {
      map.setView(points[0], 18, { animate: false });
      sync();
      return;
    }
    const bounds = L.latLngBounds(points);
    if (padLatLng) {
      bounds.extend(padLatLng);
    }
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 19, animate: false });
    sync();
  }, [map, points, padLatLng]);

  return null;
}

function useSortedLocations(locations: MapLocation[]) {
  return useMemo(() => {
    const chrono = [...locations].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    const latest = chrono.length ? chrono[chrono.length - 1] : null;
    const trail: [number, number][] = chrono.map((l) => [l.lat, l.lng]);
    return { chrono, latest, trail };
  }, [locations]);
}

export default function MapTracker({
  locations,
  showTrail = false,
  highlightLatest = false,
  heading = "Map",
  description,
}: MapTrackerProps) {
  useEffect(() => {
    fixDefaultIcons();
  }, []);

  const { chrono, latest, trail } = useSortedLocations(locations);

  const boundsPoints = useMemo(() => {
    if (showTrail && trail.length > 0) return trail;
    return locations.map((l) => [l.lat, l.lng] as [number, number]);
  }, [locations, showTrail, trail]);

  const accuracyRadius =
    highlightLatest &&
    latest &&
    typeof latest.accuracy === "number" &&
    Number.isFinite(latest.accuracy)
      ? Math.min(Math.max(latest.accuracy, 12), 900)
      : null;

  const padForCircle =
    accuracyRadius && latest
      ? ([
          latest.lat + accuracyRadius / 111_320,
          latest.lng,
        ] as [number, number])
      : undefined;

  if (locations.length === 0) {
    return (
      <section className="space-y-3">
        {(heading || description) && (
          <div>
            {heading ? (
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                {heading}
              </h2>
            ) : null}
            {description ? (
              <p className="text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
        )}
        <div className="flex min-h-[min(45vh,420px)] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/80 bg-gradient-to-b from-muted/20 to-muted/5 px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card shadow-inner">
            <span className="text-lg text-muted-foreground" aria-hidden>
              ◎
            </span>
          </div>
          <div className="max-w-sm space-y-1">
            <p className="text-sm font-medium text-foreground">No fixes yet</p>
            <p className="text-xs text-muted-foreground">
              When GPS data arrives, the map and trail will appear here
              automatically.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const center = boundsPoints[0] ?? [20, 0];
  const showOnlyLatestMarker =
    Boolean(showTrail && highlightLatest && latest && trail.length > 1);

  /** Run before first Marker paint so default Leaflet icons resolve (SSR/hydration safe). */
  fixDefaultIcons();

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            {heading}
          </h2>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {locations.length} point{locations.length === 1 ? "" : "s"} ·
              Basemap can be switched in the map corner
            </p>
          )}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card shadow-lg ring-1 ring-primary/10">
        <div className="pointer-events-none absolute inset-0 z-[400] bg-gradient-to-t from-background/20 via-transparent to-transparent" />
        <div className="relative z-0 h-[min(58vh,560px)] w-full min-h-[320px]">
          <MapContainer
            center={center}
            zoom={13}
            className="h-full w-full [&_.leaflet-control-attribution]:bg-card/90 [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-control-attribution]:text-muted-foreground"
            scrollWheelZoom
          >
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="Carto Dark">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                  url={CARTO_DARK}
                  subdomains="abcd"
                  maxZoom={20}
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="OpenStreetMap">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url={OSM}
                  maxZoom={19}
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Satellite (Esri)">
                <TileLayer
                  attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
                  url={ESRI_SATELLITE}
                  maxZoom={19}
                />
              </LayersControl.BaseLayer>
            </LayersControl>

            <ScaleControl position="bottomleft" imperial={false} />

            <MapBounds points={boundsPoints} padLatLng={padForCircle} />

            {showTrail && trail.length > 1 ? (
              <Polyline
                positions={trail}
                pathOptions={{
                  color: "#6366f1",
                  weight: 4,
                  opacity: 0.82,
                  lineJoin: "round",
                  lineCap: "round",
                }}
              />
            ) : null}

            {accuracyRadius && latest ? (
              <Circle
                center={[latest.lat, latest.lng]}
                radius={accuracyRadius}
                pathOptions={{
                  color: "#6366f1",
                  weight: 1,
                  opacity: 0.35,
                  fillColor: "#6366f1",
                  fillOpacity: 0.08,
                }}
              />
            ) : null}

            {showOnlyLatestMarker && latest ? (
              <>
                <CircleMarker
                  center={[latest.lat, latest.lng]}
                  radius={6}
                  pathOptions={{
                    color: "#6366f1",
                    weight: 2,
                    fillColor: "#eef2ff",
                    fillOpacity: 1,
                  }}
                />
                <Marker position={[latest.lat, latest.lng]} icon={latestPulseIcon}>
                  <Popup>{formatPopup(latest)}</Popup>
                </Marker>
              </>
            ) : (
              chrono.map((loc) => {
                const usePulse =
                  Boolean(highlightLatest && latest && loc._id === latest._id);
                return (
                  <Fragment key={loc._id}>
                    <CircleMarker
                      center={[loc.lat, loc.lng]}
                      radius={5}
                      pathOptions={{
                        color: "#6366f1",
                        weight: 2,
                        fillColor: "#eef2ff",
                        fillOpacity: 1,
                      }}
                    />
                    {usePulse ? (
                      <Marker position={[loc.lat, loc.lng]} icon={latestPulseIcon}>
                        <Popup>{formatPopup(loc)}</Popup>
                      </Marker>
                    ) : (
                      <Marker position={[loc.lat, loc.lng]}>
                        <Popup>{formatPopup(loc)}</Popup>
                      </Marker>
                    )}
                  </Fragment>
                );
              })
            )}
          </MapContainer>
        </div>
      </div>
    </section>
  );
}
