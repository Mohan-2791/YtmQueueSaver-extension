# YTM Queue Saver

Chrome MV3 extension that snapshots your YouTube Music queue before it gets
wiped out, and lets you restore it later.

## Getting started

```bash
npm install
npm run dev      # Vite dev server with HMR
```

Then in Chrome: `chrome://extensions` → enable Developer mode → **Load
unpacked** → select the `dist/` folder (Vite/CRXJS writes it on first run
of `npm run dev`, and rebuilds it live as you edit).

For a production build:

```bash
npm run build     # type-checks, then builds to dist/
```

## What changed from the original prototype

**The bug:** the popup had no way to reach Settings — the link pointed at
`../options/index.html`, a relative path that doesn't resolve reliably from
a packaged extension's popup context, and even when it did, it opened a
whole new browser tab for two form fields.

**The fix:** Settings is now a tab *inside* the popup (`Queue` / `Settings`,
top right), backed by the same `SettingsForm` component the standalone
options page uses. Both are wired to `chrome.storage.local` and stay in
sync — nothing about the storage schema changed, so no migration is needed.
`manifest.json`'s `options_page` still points at a real, working
`src/options/index.html` (Chrome shows this from the extension's right-click
menu / `chrome://extensions` details page), it just isn't the only way in
anymore.

## Project structure

```
src/
  types/        Shared TS types + the ExtensionMessage discriminated union
  lib/          logger, validation, debounce, typed storage, fetch-with-
                retry-and-timeout, typed chrome.runtime.sendMessage wrapper
  components/   Shared UI: ErrorBoundary, Toast, SettingsForm, SnapshotCard,
                TabButton — used by both the popup and the options page
  hooks/        useSnapshots (data fetching/mutation state for the popup)
  background/   Service worker: message router + API call handlers
  content/      Content script: DOM scraping + queue-wipe detection
  popup/        Popup entry (Queue view + embedded Settings view)
  options/      Standalone options page entry (thin wrapper, same form)
```

## Notable hardening for a production release

- **Strict TypeScript** (`noUncheckedIndexedAccess`, no `any`, discriminated
  message unions with an exhaustiveness check in the background router).
- **Network resilience**: every backend call goes through `fetchJson()`,
  which adds a request timeout and bounded exponential-backoff retries,
  and skips retrying 4xx responses.
- **Input validation**: the API URL and User ID fields are validated before
  they're written to storage; scraped track titles/artists are sanitized
  and length-capped before being sent anywhere.
- **Error boundaries + toasts**: a render error in one view no longer blanks
  the popup, and `window.alert()` calls were replaced with a proper toast
  system.
- **Debounced MutationObserver** in the content script so a burst of DOM
  changes doesn't trigger a rescrape storm.
- **No secrets in source**: `VITE_DEFAULT_API_URL` (see `.env.example`) is
  just a *fallback* default; there's nothing sensitive to leak.

## Before shipping to the Chrome Web Store

A few things in `manifest.json` weren't touched (per "don't break anything")
but are worth your attention before a real launch:

- **`identity` permission + `oauth2` block** are present but nothing in the
  codebase uses `chrome.identity` yet — either wire up real Google OAuth for
  the backend user mapping, or drop the permission. Unused permissions slow
  down store review and widen your attack surface for no benefit.
- **No `icons` key** — the Web Store requires icons at multiple sizes.
- **`host_permissions` includes `http://localhost:8000/*`** — fine for dev,
  but make sure your production build actually points at your deployed
  backend (set via the Settings tab, or bake in `VITE_DEFAULT_API_URL`).
- **Privacy policy** — since this extension reads YouTube Music page content
  and sends listening data to a backend you control, the Chrome Web Store
  will require a privacy policy URL at submission.
- **Backend hardening** (auth, rate limiting, input validation on the
  `/api/snapshots` and `/api/restore/:id` endpoints) is out of scope for
  this pass but should happen before this handles real user data at scale.
