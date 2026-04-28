import { randomUUID } from "node:crypto";
import type { ShareSession, ShareSessionStatus } from "@prisma/client";

export const RECIPIENT_DEVICE_REQUIRED_ERROR =
  "deviceId is required for recipient links.";
export const RECIPIENT_DEVICE_LOCKED_ERROR =
  "This recipient link is locked to another device.";

export function makeShareToken(): string {
  return randomUUID().replace(/-/g, "");
}

export function normalizeLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 80);
}

/** Far-future cutoff stored as `expiresAt` for “active until stopped” sessions (no timer). */
const LIFETIME_THRESHOLD_MS = Date.UTC(2090, 0, 1);

export function isLifetimeExpiry(expiresAt: Date): boolean {
  return expiresAt.getTime() >= LIFETIME_THRESHOLD_MS;
}

/** Works with ISO strings from the API / poll payload (client-safe). */
export function isLifetimeExpiryIso(iso: string): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= LIFETIME_THRESHOLD_MS;
}

export function isExpired(expiresAt: Date): boolean {
  if (isLifetimeExpiry(expiresAt)) return false;
  return expiresAt.getTime() <= Date.now();
}

export function effectiveStatus(session: ShareSession): ShareSessionStatus {
  if (isExpired(session.expiresAt) && session.status !== "STOPPED") {
    return "EXPIRED";
  }
  return session.status;
}

export function assertToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  return token.length >= 16 ? token : null;
}

/**
 * Client-generated device id (uuid-ish). Used to lock recipient links to one device.
 * Keep validation permissive for forward-compat.
 */
export function assertDeviceId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!id) return null;
  if (id.length < 16 || id.length > 128) return null;
  return id;
}

export function isRecipientDeviceLocked(
  sessionDeviceId: string | null,
  deviceId: string | null,
): boolean {
  return Boolean(sessionDeviceId && deviceId && sessionDeviceId !== deviceId);
}

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const fromForwarded = forwarded?.split(",")[0]?.trim();
  return fromForwarded || headers.get("x-real-ip") || "";
}
