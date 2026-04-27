"use client";

import { useState } from "react";
import { Check, Copy, LinkIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Preset values must stay within API `MAX_EXPIRES_MINUTES` (7 days). */
const EXPIRY_OPTIONS = [
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 360, label: "6 hours" },
  { minutes: 720, label: "12 hours" },
  { minutes: 1440, label: "24 hours (1 day)" },
  { minutes: 4320, label: "3 days" },
  { minutes: 10080, label: "7 days — live until window ends or someone stops" },
] as const;

const selectClassName = cn(
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

type CreateResponse = {
  sessionId: string;
  status: string;
  expiresAt: string;
  recipientUrl: string;
  ownerUrl: string;
};

type CopiedField = "recipient" | "owner" | null;

export default function ShareCreateClient() {
  const [ownerLabel, setOwnerLabel] = useState("");
  const [recipientLabel, setRecipientLabel] = useState("");
  const [expiresMinutes, setExpiresMinutes] = useState(String(EXPIRY_OPTIONS[1].minutes));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResponse | null>(null);
  const [copied, setCopied] = useState<CopiedField>(null);

  async function createSession() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/share-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerLabel,
          recipientLabel,
          expiresMinutes: Number(expiresMinutes),
        }),
      });
      const data = (await res.json()) as CreateResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to create session.");
      }
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session.");
    } finally {
      setLoading(false);
    }
  }

  async function copyText(value: string, field: CopiedField) {
    await navigator.clipboard.writeText(value);
    setCopied(field);
    window.setTimeout(() => setCopied((c) => (c === field ? null : c)), 2000);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <Card className="overflow-hidden border-border/80 shadow-lg shadow-black/20">
        <CardHeader className="space-y-3 border-b border-border/60 bg-gradient-to-br from-card via-card to-primary/[0.07] pb-6">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-5 w-5" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wider">New session</span>
          </div>
          <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
            <LinkIcon className="h-6 w-6 shrink-0 text-primary" aria-hidden />
            Create consent link
          </CardTitle>
          <CardDescription className="text-pretty">
            Send the recipient link. After they accept and start GPS on their phone, positions appear on the live map
            for the whole session window (or until someone stops it).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-2">
            <Label htmlFor="ownerLabel">Your name</Label>
            <Input
              id="ownerLabel"
              value={ownerLabel}
              onChange={(e) => setOwnerLabel(e.target.value)}
              placeholder="e.g. Rahul"
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recipientLabel">Friend name (optional)</Label>
            <Input
              id="recipientLabel"
              value={recipientLabel}
              onChange={(e) => setRecipientLabel(e.target.value)}
              placeholder="e.g. Aman"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expiresMinutes">Session length</Label>
            <select
              id="expiresMinutes"
              className={selectClassName}
              value={expiresMinutes}
              onChange={(e) => setExpiresMinutes(e.target.value)}
              aria-label="Session length in minutes"
            >
              {EXPIRY_OPTIONS.map((opt) => (
                <option key={opt.minutes} value={String(opt.minutes)}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Longer windows keep the map session valid for extended live tracking.</p>
          </div>
          <Button disabled={loading} onClick={createSession} className="w-full gap-2 sm:h-11">
            {loading ? "Creating…" : "Create links"}
          </Button>

          {error ? (
            <p
              className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {result ? (
            <div className="space-y-4 rounded-xl border border-border/80 bg-muted/10 p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-3">
                <p className="text-sm font-medium text-foreground">Links ready</p>
                <p className="text-xs text-muted-foreground">
                  Expires {new Date(result.expiresAt).toLocaleString()}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recipient (share this)
                </Label>
                <div className="flex gap-2">
                  <Input readOnly value={result.recipientUrl} className="font-mono text-xs sm:text-sm" />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 gap-1.5 px-3"
                    onClick={() => copyText(result.recipientUrl, "recipient")}
                  >
                    {copied === "recipient" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    {copied === "recipient" ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Owner (keep private)
                </Label>
                <div className="flex gap-2">
                  <Input readOnly value={result.ownerUrl} className="font-mono text-xs sm:text-sm" />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 gap-1.5 px-3"
                    onClick={() => copyText(result.ownerUrl, "owner")}
                  >
                    {copied === "owner" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    {copied === "owner" ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
