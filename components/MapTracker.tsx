"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

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
};

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

function MapBounds({ points }: { points: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    fixDefaultIcons();
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
  }, [map, points]);

  return null;
}

export default function MapTracker({ locations }: { locations: MapLocation[] }) {
  useEffect(() => {
    fixDefaultIcons();
  }, []);

  if (locations.length === 0) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
        No locations to display yet.
      </div>
    );
  }

  const points = locations.map((l) => [l.lat, l.lng] as [number, number]);
  const center = points[0] ?? [20, 0];

  return (
    <div className="relative z-0 h-[min(55vh,520px)] w-full min-h-[320px] overflow-hidden rounded-xl border border-border">
      <MapContainer
        center={center}
        zoom={13}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapBounds points={points} />
        {locations.map((loc) => (
          <Marker key={loc._id} position={[loc.lat, loc.lng]}>
            <Popup>
              <div className="min-w-[180px] space-y-1 text-xs">
                <p className="font-semibold text-foreground">IMEI: {loc.imei}</p>
                {loc.mobile || loc.sim ? (
                  <p>Mobile: {loc.mobile || loc.sim}</p>
                ) : null}
                <p>{loc.city || "—"}</p>
                <p className="text-muted-foreground">
                  {new Date(loc.timestamp).toLocaleString()}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
