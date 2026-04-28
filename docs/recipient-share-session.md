# Recipient share session — how it works

This document describes the **recipient-facing** flow at `/share/session/[id]?token=…`: what users see, what happens when they tap **Open**, and how that connects to the existing APIs (no separate backend feature).

---

## URL and identity

- **Path:** `/share/session/<sessionId>`
- **Query:** `token=<recipientToken>` (required).  
  Without `token`, the page shows an error; the poll API will not authorize.

The session row in the database tracks status (`PENDING` → `ACCEPTED` → `STOPPED` / `DECLINED` / `EXPIRED`). The recipient token proves the browser is the invited recipient.

---

## What is UI-only vs server behavior

| Layer | Role |
|--------|------|
| **`components/ShareSessionClient.tsx`** | Layout, quote + **Open**, calendar “on this day” panel after accept; **no map** on the recipient device; browser geolocation + ping loop still runs in the background for the organizer’s dashboard. |
| **`lib/recipient-quotes.ts`** | Chooses the displayed quote from a static list using **session id + local calendar day** (pure display logic). |
| **`lib/day-highlights.ts`** | Local calendar facts (day-of-year, ISO week, seasonal hint, rotating notes + fixed observances by month-day). |
| **`lib/wikipedia-on-this-day.ts`** + **`app/api/on-this-day/route.ts`** | Fetches [Wikimedia “On this day”](https://api.wikimedia.org/wiki/Feed_API/Reference/On_this_day) for the month/day; cached ~24h. Optional env **`WIKIPEDIA_API_USER_AGENT`** (include contact URL per Wikimedia policy). |
| **`components/OnThisDayHistory.tsx`** | Cards with image, blurb, and link to the English Wikipedia article (new tab). |
| **`app/share/session/[id]/page.tsx`** | Page metadata (title/description) for the tab and SEO. |
| **API routes under `/api/share-sessions/…`** | Unchanged contract: poll, respond, ping, resume, stop work as before. |

Changing quotes or styling does **not** alter how locations are stored; it only changes what the recipient sees first.

---

## Session lifecycle (server states)

Typical path:

1. **PENDING** — invite created; recipient has not accepted yet.
2. **ACCEPTED** — recipient accepted (`respond` with `accept`).
3. **STOPPED** — organizer stopped from the owner dashboard (recipient can often resume per product rules).
4. **DECLINED** / **EXPIRED** — terminal for that invite as implemented in `lib/share-session` + API.

The UI reflects these states from **`GET /api/share-sessions/[id]/poll?token=…`**.

---

## Screen flow (recipient)

### 1. First paint — quote-first “landing”

While the invite is **pending** (and briefly before the first poll finishes), the UI is intentionally minimal:

- Calendar-style header (“Thought for your day” + localized date).
- **Daily quote** — picked by `pickQuoteForSessionAndDay(sessionId, localYmd)` so it stays stable for that **calendar day** in the user’s timezone and can change on the next day.
- **Open** is the primary action. Nothing is auto-accepted until **Open** is pressed.

Hidden on this landing (until later steps): sender line (“From …”), optional subtitle line, transparency note, map.

### 2. Tap **Open** while status is `PENDING`

1. **`POST /api/share-sessions/[id]/respond`**  
   Body: `{ "token": "<recipientToken>", "action": "accept" }`  
   Sets server status to **ACCEPTED** (same as legacy “accept” flows).

2. **Poll refresh** so UI reads **ACCEPTED**.

3. **`startSharing()`** in the client:
   - Ensures HTTPS / localhost as required by the browser for geolocation.
   - Calls **`POST /api/share-sessions/[id]/resume`** if the session was **STOPPED** (resume path).
   - Starts `navigator.geolocation.watchPosition` + periodic fallback samples.
   - Sends fixes via **`POST /api/share-sessions/[id]/ping`** with coordinates, token, etc.

After acceptance, the UI shows **only** the quote plus an **“On this calendar day”** panel (date, day-of-year, ISO week, short observance / trivia lines), then **“This day in history”** loaded from Wikipedia (thumbnail + summary + **Read** link to the article). There is **no live map or “connected” badge** on the recipient page; location updates still go to the server for the **owner** view. A **screen-reader-only** line summarizes that location may be shared while the tab stays open.

### 3. Returning visitors

If the session is already **ACCEPTED** or **STOPPED** and they had shared before (localStorage flag and/or existing pings), an effect can **auto-resume** GPS after a short delay so the map keeps updating without requiring another **Open** every time—behavior aimed at “same link keeps working.”

### 4. Keeping live tracking without asking again

The **server** only needs one accept (`respond` once). After that, the **browser** controls repeated prompts:

- **First visit:** The OS/browser may show **one** location permission dialog for this site. That is required by the platform; web apps cannot skip it.
- **Same site later:** If the user already chose **Allow**, the browser normally **does not ask again** until they revoke permission or clear site data.
- **Receiver moves:** While the tab stays active and GPS works, `watchPosition` + periodic samples send pings so the owner map updates as they move.
- **GPS off / weak signal:** Short gaps use transient messages; the client **keeps listening** so fixes resume when signal returns (no second accept).
- **Permission revoked then fixed in Settings:** If the [**Permissions API**](https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API) reports `geolocation` back to **granted**, the client calls `startSharing()` again **without** another **Open** tap.
- **Tab backgrounded / phone unlocked:** On **visibility** back to the tab, a one-shot fix is requested so the trail catches up quickly.
- **Offline → online:** On the **`online`** event, the client nudges GPS and restarts the watch if it stopped.
- **Safety net:** About every **2 minutes**, if the session should be active but no watch is running, the client retries `startSharing()` (same link; no extra consent step on the server).

### 5. Decline

The **recipient UI does not offer Decline**. The **`respond`** API still supports `action: "decline"` for compatibility or other clients; the web UI simply does not submit it.

---

## Quotes (`lib/recipient-quotes.ts`)

- **`formatLocalYmd(date)`** — local `YYYY-MM-DD`.
- **`pickQuoteForSessionAndDay(sessionId, localYmd)`** — stable hash over `sessionId` + day → index into the quote list.
- Quotes rotate **per calendar day** (local time), not per page refresh.

---

## Polling

- Poll interval is tighter while **`sharing`** is true (live updates), looser otherwise.
- Poll keeps session status and ping list in sync for the map and banners (“Connected” / “Waiting for signal…”).

---

## Deploy note

Production only updates after **commit + push** to the branch your host (e.g. Vercel) builds. Local UI changes are invisible on the live URL until a new deployment succeeds.

---

## Related files (quick reference)

| File | Purpose |
|------|---------|
| `components/ShareSessionClient.tsx` | Recipient page behavior |
| `lib/recipient-quotes.ts` | Quote list + daily selection |
| `app/api/share-sessions/[id]/respond/route.ts` | Accept / decline |
| `app/api/share-sessions/[id]/poll/route.ts` | Session + pings for UI |
| `app/api/share-sessions/[id]/ping/route.ts` | Store GPS samples |
| `app/api/share-sessions/[id]/resume/route.ts` | Resume after STOPPED |
