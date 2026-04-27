"use client";

import { useState } from "react";
import { Copy, LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CreateResponse = {
  sessionId: string;
  status: string;
  expiresAt: string;
  recipientUrl: string;
  ownerUrl: string;
};

export default function ShareCreateClient() {
  const [ownerLabel, setOwnerLabel] = useState("");
  const [recipientLabel, setRecipientLabel] = useState("");
  const [expiresMinutes, setExpiresMinutes] = useState("60");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResponse | null>(null);

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

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-primary" />
            Create consent session
          </CardTitle>
          <CardDescription>
            Share the recipient link with your friend. Live location can start only after acceptance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ownerLabel">Your name</Label>
            <Input
              id="ownerLabel"
              value={ownerLabel}
              onChange={(e) => setOwnerLabel(e.target.value)}
              placeholder="e.g. Rahul"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recipientLabel">Friend name (optional)</Label>
            <Input
              id="recipientLabel"
              value={recipientLabel}
              onChange={(e) => setRecipientLabel(e.target.value)}
              placeholder="e.g. Aman"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expiresMinutes">Expires in minutes</Label>
            <Input
              id="expiresMinutes"
              type="number"
              min={5}
              max={1440}
              value={expiresMinutes}
              onChange={(e) => setExpiresMinutes(e.target.value)}
            />
          </div>
          <Button disabled={loading} onClick={createSession} className="w-full">
            {loading ? "Creating..." : "Create consent link"}
          </Button>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {result ? (
            <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
              <p>
                Session created. Expires: {new Date(result.expiresAt).toLocaleString()}
              </p>
              <div className="space-y-1">
              <p className="font-medium">Recipient consent link</p>
                <div className="flex gap-2">
                  <Input readOnly value={result.recipientUrl} />
                  <Button type="button" variant="outline" onClick={() => copyText(result.recipientUrl)}>
                    <Copy />
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <p className="font-medium">Owner manage link (private)</p>
                <div className="flex gap-2">
                  <Input readOnly value={result.ownerUrl} />
                  <Button type="button" variant="outline" onClick={() => copyText(result.ownerUrl)}>
                    <Copy />
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
