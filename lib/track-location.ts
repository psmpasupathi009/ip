export type LiveFix = {
  source: "gps" | "ip";
  lat: number;
  lng: number;
  city: string;
  accuracy?: number;
  ip?: string;
};

export async function fetchIpLocation(): Promise<{
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
