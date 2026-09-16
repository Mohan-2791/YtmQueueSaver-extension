# 🎵 YTM Queue Saver

A Chrome extension that protects your YouTube Music queue from ever being lost. It watches your active queue in the background, automatically snapshots it the moment YouTube Music replaces it with something else (a new station, a clicked recommendation, an accidental double-click), and lets you restore any saved queue back into your personal YouTube Music library as a real playlist — one click, no copy-pasting song titles.

This repo is the **frontend**: the popup/options UI, the content script that reads the live player, and the background service worker that bridges everything together. It talks to a companion backend (persistence + auth) with an **offline-first fallback** so the extension keeps working even if that backend is unreachable.

> Built solo, end-to-end: extension architecture, DOM-scraping strategy, background/content-script messaging, offline-resilient storage layer, and the OAuth flow into the real YouTube Data API.

---

## Why this project exists

I use YouTube Music constantly for background writing/coding sessions, and losing a 40-song queue because I accidentally clicked a "related" track was a recurring, genuinely annoying problem with no existing fix. Rather than build a toy to-do app, I picked a problem that required actually understanding how Chrome extensions, service workers, and a page you don't control (YouTube Music) all fight against you — and shipped something I use every day.

---

## Features

- **Automatic "wipe protection"** — detects when your queue has been silently replaced (not just reordered or advanced) and snapshots the *previous* queue before it's gone.
- **Manual snapshots** — one-click archive of whatever's currently queued.
- **Direct restore to YouTube Music** — recreates a saved snapshot as a real private playlist in your account via the official YouTube Data API v3.
- **Live queue inspector** — a drawer showing exactly what the extension currently sees in the player, with adjustable "retain last N songs" logic.
- **Search & filter history** — find a snapshot by playlist title, song, or artist.
- **Two-tier persistence** — every save goes to a backend API *and* a local `chrome.storage.local` backup, so nothing is lost if the backend is down.
- **Configurable retention** — cap how many songs get kept per snapshot, and from where (whole queue vs. from the currently-playing track onward).
- **Google OAuth sign-in** (with a gated local dev/test account for fast iteration without OAuth setup).

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| UI | React 18 + TypeScript | Type-safe messaging contracts between popup, content script, and background worker — this matters a lot in an extension where the three contexts can't share types at runtime. |
| Styling | Tailwind CSS | Fast iteration on a small, dense popup UI (380px wide) without hand-rolled CSS files. |
| Build | Vite | Fast HMR for popup/options dev, native `import.meta.env` support used for build-time flags (see below). |
| Extension APIs | Manifest V3 (service worker, content scripts, `chrome.identity`, `chrome.storage`) | Required for current Chrome Web Store submissions. |
| External API | YouTube Data API v3 | Official, quota-respecting way to create playlists and add items — no scraping of write actions. |

---

## Architecture

```
┌─────────────────┐        chrome.runtime          ┌───────────────────────┐
│   Popup / UI     │ ───────────messaging────────▶ │  Background Worker     │
│ (React, popup.tsx)│ ◀──────────────────────────── │  (service worker)      │
└─────────────────┘                                 └───────────┬───────────┘
                                                                  │
                                                       fetch()    │  chrome.storage.local
                                                                  ▼
┌─────────────────┐        chrome.runtime          ┌───────────────────────┐
│  Content Script   │ ───────────messaging────────▶ │   Backend API          │
│ (runs on YTM page)│                                │ (snapshots, auth, JWT) │
└─────────────────┘                                 └───────────────────────┘
        │
        ▼
  YouTube Music DOM
  (Polymer `.data` bindings)
```

- **Content script** — injected into `music.youtube.com`, scrapes the live queue and detects real queue replacements vs. normal playback progression.
- **Background service worker** — the only context allowed to hold auth tokens and talk to the backend; every UI action goes through it via typed `chrome.runtime` messages.
- **Popup/Options UI** — pure presentation + local component state; never touches `chrome.storage` or the network directly, always through the message layer.

---

## Engineering Highlights — Problems I Hit & How I Solved Them

This section is the part I'm proudest of. Every one of these came from something actually breaking during development, not from a tutorial.

### 1. Detecting "the queue changed" without watching for UI clicks
**Problem:** My first instinct was to listen for clicks on YouTube Music's "play" buttons. That broke within days — YTM's class names and DOM structure change frequently and silently.
**Solution:** Instead of watching *how* the user triggered a change, I compare queue **contents**. `isDifferentQueue()` computes videoId overlap between the previous and current queue and only treats it as a real replacement below a conservative `0.3` overlap ratio. A queue that's simply advancing (songs falling off the front as they finish) or getting reshuffled keeps almost all the same videoIds — a genuinely new station/album/queue shares almost none. This made detection resilient to YTM UI changes because it depends on *data*, not markup.

### 2. Scraping data that doesn't want to be scraped
**Problem:** Parsing visible DOM text (song titles, artist names) broke constantly — YTM re-renders differently depending on which UI state it's in.
**Solution:** `scrapeQueue()` reads each queue item's internal Polymer `.data` binding — the same structured object YTM's own UI renders from — instead of parsing rendered text. It's undocumented and technically an implementation detail, so every field access is defensive (optional chaining, `''` fallbacks) and there's a DOM-based fallback path for when `.data` is ever missing. Also hard-capped at `MAX_TRACKS = 500` so a pathological DOM state can't produce an unbounded payload.

### 3. Throttle vs. debounce — a subtle but real bug
**Problem:** The content script watches the DOM with a `MutationObserver`. YTM mutates the player DOM almost continuously during playback (progress bar, buffering state). A plain trailing-edge **debounce** can get starved indefinitely under a continuous stream of events and never fire.
**Solution:** Wrote a leading+trailing **throttle** instead, which guarantees the scrape function runs at least once every `waitMs` regardless of how continuously mutations fire, while still bounding total scrape frequency.

### 4. A "restore" action that isn't safe to retry
**Problem:** Restoring a snapshot creates a brand-new YouTube playlist and re-adds every track — it is **not idempotent**. My generic `fetchJson` helper retries on timeout by default, which is great for `GET`s but actively dangerous here: a slow-but-successful restore that simply took longer than the timeout window would get retried, silently creating a **second duplicate playlist** in the user's account.
**Solution:** Explicitly disabled retries (`retries: 0`) for the restore call and gave it a longer, realistic timeout (45s) that reflects how long creating a playlist + adding every track can actually take — instead of just cranking up global retry counts and hoping.

### 5. False "restore failed" errors on large playlists
**Problem:** The UI used a blanket 10s timeout for all extension messages. Large restores legitimately took longer than that, so the popup reported "failed" on restores that were still quietly succeeding in the background.
**Solution:** Bumped the message timeout specifically for the restore call to 50s — deliberately set *above* the 45s backend timeout used in the handler, so the UI never times out before the operation it's waiting on could plausibly time out itself.

### 6. Adding 50+ tracks to a playlist without blowing past extension timeouts
**Problem:** Adding tracks to a new playlist one request at a time (sequential `await`) meant large restores could take 10–25+ seconds, close to or past Chrome's messaging timeouts.
**Solution:** Bounded-concurrency batching — tracks are added in chunks of 8 concurrent requests (`Promise.all` per chunk) instead of one giant unthrottled burst (which risks YouTube API rate limits) or one-at-a-time (too slow). This is the classic "concurrency without a queue library" pattern: chunk, await the chunk, move to the next.

### 7. Never losing user data, even if the backend is down
**Problem:** A hosted free-tier backend can go to sleep, redeploy, or just be flaky. Losing a snapshot because of *that* would defeat the entire point of the extension.
**Solution:** Every write goes to the backend **and** a local `chrome.storage.local` backup. Every read tries the backend first and transparently falls back to the local backup on failure. `saveSnapshot` even fabricates a locally-consistent snapshot object (with a timestamp-derived ID) if the backend call fails outright, so the save still "succeeds" from the user's point of view.

### 8. Serializing writes to a shared storage key
**Problem:** The content script can fire `SET_CACHED_QUEUE` messages in quick succession while YouTube Music mutates the queue. Two overlapping writes to the same `chrome.storage.local` key can race.
**Solution:** A simple promise chain (`cachedQueueWriteChain`) in the background worker serializes cached-queue writes so they're applied strictly in order, without needing a full mutex library for what is, in practice, a single hot key.

### 9. Content scripts don't always have `chrome.storage` available
**Problem:** Depending on execution context (isolated world vs. injected main-world scripts), `chrome.storage.local` isn't always directly reachable.
**Solution:** Built a small internal **storage bridge** — a namespaced (`__YTM_QUEUE_SAVER_STORAGE__`) message protocol that lets any context ask the background service worker (which always has full extension privileges) to perform the storage operation on its behalf. `getSettings`, `getAuthSession`, etc. all check for direct storage access first and transparently fall back to the bridge, so callers never have to know or care which path was used.

### 10. Manifest V3's async messaging gotcha
**Problem:** `chrome.runtime.onMessage` listeners that return a Promise aren't reliably supported across all Chrome versions, and Chrome requires an explicit `return true` if `sendResponse` will be called asynchronously — forget it, and responses silently vanish.
**Solution:** Every listener in the background worker is intentionally a **synchronous** function that returns `true` for every async branch, with `sendResponse` called inside `.then()/.catch()` chains — documented inline specifically so a future refactor doesn't "clean this up" into an `async` listener and quietly break every response.

### 11. Keeping playback alive when the tab loses focus
**Problem:** YouTube Music (like many web players) pauses audio when it thinks the tab is hidden or unfocused.
**Solution:** A script injected into the page's **MAIN world** (not the isolated content-script world) at `document_start` overrides `document.hidden`/`document.visibilityState` and intercepts `visibilitychange`/`blur` events before YTM's own listeners see them. It has to be loaded via `src` from `chrome.runtime.getURL(...)` rather than inlined, because YouTube Music's own CSP (`script-src 'self'`) blocks inline scripts outright — `web_accessible_resources` in the manifest is what makes the extension's own hosted script an allowed source.

### 12. Never letting one bad view crash the whole popup
**Problem:** A malformed snapshot (bad data from the API) crashing a render deep in the tree would blank the entire popup.
**Solution:** Wrapped the tab content in a class-based `ErrorBoundary` (React error boundaries currently require class lifecycle methods — no hooks equivalent) with a "Try again" recovery action, so a bad snapshot degrades to one broken card, not one dead extension.

### 13. Keeping a dangerous dev shortcut out of production
**Problem:** A one-click local test-login button is genuinely useful during development (skips OAuth entirely) but must never ship in a real build.
**Solution:** Gated behind Vite's build-time `import.meta.env.DEV` flag — `false` and dead-code-eliminated entirely in `npm run build` output, not just hidden by a runtime check. See the [Security](#-security-notes--what-id-harden-next) section for why the frontend flag alone isn't the whole story.

---

## 🔒 Security Notes & What I'd Harden Next

I went through this project specifically looking for security issues rather than just shipping — here's what I found and how I'd fix it. I think being upfront about this (instead of pretending it's flawless) is more useful to a reviewer than a project with zero acknowledged weaknesses.

| Issue | Risk | Fix |
|---|---|---|
| **Google OAuth uses the implicit grant (`response_type=token`)** in the custom-client-ID login path | Implicit flow returns the access token directly in the URL fragment, has no refresh token, and is deprecated under OAuth 2.0 Security Best Current Practice. | Move to Authorization Code + PKCE (`chrome.identity.launchWebAuthFlow` supports this), and exchange the code for tokens server-side where a client secret can live safely. |
| **Backend authorization currently trusts a client-supplied `user_id`/`userId`** rather than deriving identity purely from the verified JWT | If the backend checks ownership by comparing against the request body's `user_id` instead of the identity embedded in the validated `authToken`, a modified request could read or delete another user's snapshots (IDOR). | Backend must always resolve "who is making this request" from the verified JWT claims, never from a client-editable field, and reject/ignore any `user_id` in the request body. |
| **A `test-login` backend endpoint exists to support the dev-mode 1-click login** | It's gated out of the *frontend* bundle in production via `import.meta.env.DEV`, but that's a client-side convenience, not a security boundary. If the same route exists and is reachable on the deployed backend, anyone could mint a valid session without credentials. | The backend must also disable/404 that route outside of a development environment — never rely on the frontend hiding a button as the only protection. |
| **Access/auth tokens are stored in `chrome.storage.local` in plaintext** | Standard practice for extensions (storage is sandboxed per-extension), but still worth stating explicitly rather than leaving implicit, since it's the most sensitive data the extension holds. | Acceptable for this threat model; would consider a short-lived access token + refresh flow so a leaked token has a smaller blast radius. |
| **Two separate `chrome.runtime.onMessage` listeners with inconsistent sender validation** — the storage bridge checks `sender.id`, the main application listener does not | Low risk in practice (Chrome only delivers `runtime.onMessage` from other parts of the same extension unless `externally_connectable` is set), but it's an inconsistency I'd rather not carry forward. | Apply the same explicit sender-id check across both listeners as defense-in-depth, even though the platform already provides the primary guarantee. |

---

## Setup

> Adjust script names below to match your actual `package.json` if they differ.

```bash
git clone https://github.com/<your-username>/ytm-queue-saver.git
cd ytm-queue-saver
npm install

# Development build with HMR
npm run dev

# Production build (outputs to /dist)
npm run build
```

**Load it in Chrome:**
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist/` folder
4. Open [music.youtube.com](https://music.youtube.com) and play something — the extension will start caching your queue automatically

**Environment variables** (`.env`):
```
VITE_DEFAULT_API_URL=https://your-backend.example.com
```

---

## Project Structure

```
src/
├── background/        # Service worker: message router + storage bridge
│   └── handlers.ts     # Backend calls, YouTube API calls, local-storage fallback logic
├── content/            # Injected into music.youtube.com
│   ├── content.ts       # Queue-change detection, throttled DOM watching
│   └── scrape.ts        # Polymer `.data`-based track extraction
├── injected/
│   └── shield.ts        # MAIN-world script: keeps playback alive on tab blur
├── popup/              # Extension popup UI
├── options/            # Full-page settings view
├── components/         # Shared UI: SnapshotCard, SettingsForm, ErrorBoundary, Toast
├── hooks/
│   └── useSnapshots.ts  # Data-fetching + state for the snapshot list
└── lib/                # storage.ts, fetchWithTimeout.ts, throttle.ts, validation.ts, logger.ts
```

---

## Backend

This extension talks to a companion API that handles snapshot persistence, JWT-based auth, and Google OAuth user registration.
👉 **[Link your backend repo here]**

Stack: *(fill in — e.g. FastAPI / Node+Express, PostgreSQL, JWT auth)*

---

## Roadmap

- [ ] Move Google OAuth to Authorization Code + PKCE
- [ ] Add automated tests for `isDifferentQueue`, `applyRetentionSettings`, and the throttle/debounce utilities
- [ ] Encrypt local backup snapshots at rest
- [ ] Publish to the Chrome Web Store

---

## License

MIT — see [`LICENSE`](./LICENSE).

## Author

Built by **[Your Name]** — [GitHub](https://github.com/your-username) · [LinkedIn](https://linkedin.com/in/your-profile) · [Portfolio](https://your-site.com)
