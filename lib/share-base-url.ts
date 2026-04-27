import type { NextRequest } from "next/server";
import { headers } from "next/headers";

/** Public site base URL for share links (matches create-session API logic). */
export function resolveShareBaseUrlFromRequest(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host) {
    return request.nextUrl.origin.replace(/\/+$/, "");
  }
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || request.nextUrl.protocol.replace(":", "") || "https";
  return `${proto}://${host}`;
}

/** Server Components / RSC: derive the same base URL from incoming request headers. */
export async function resolveShareBaseUrlFromAppHeaders(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  if (!host) {
    return "http://localhost:3000";
  }
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return `${proto}://${host}`;
}
