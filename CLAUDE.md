# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Monorepo with two apps and two shared packages:
1. **`apps/extension`** — Chrome extension (Manifest V3) that monitors ImmoScout24 search results and auto-messages landlords. TypeScript + Svelte 5 + Vite. Also fills the Mieterselbstauskunft PDF client-side via pdf-lib.
2. **`apps/server`** — Local Express/TypeScript server that scores listings, solves captchas, and generates reply drafts.
3. **`packages/shared-types`** — TS types shared by extension + server.
4. **`packages/shared-prompts`** — AI prompt builders shared by extension + server.

npm workspaces glob: `["apps/*", "packages/*"]`.

## Project Structure

```
apps/
├── extension/            ← Chrome extension source
│   ├── src/
│   │   ├── background/   ← service worker
│   │   ├── content/      ← content scripts
│   │   ├── shared/       ← constants, utils, types
│   │   └── popup/        ← Svelte 5 app (App.svelte, tabs/, components/, lib/)
│   ├── static/           ← copied as-is to dist/ (manifest.json, icons/)
│   ├── dist/             ← build output (gitignored), load unpacked from here
│   ├── popup.html        ← Vite HTML entry point
│   ├── vite.config.ts
│   ├── package.json
│   └── tsconfig.json
└── server/               ← AI server (`npm run dev -w apps/server`)
    └── src/index.ts, prompts.ts, types.ts
packages/
├── shared-types/         ← @repo/shared-types
└── shared-prompts/       ← @repo/shared-prompts
```

## Development

### Both projects at once

**Start:** `npm run dev` at repo root — runs both extension watcher and server via concurrently.

### Extension

**Build:** `npm run build -w apps/extension`

**Watch mode:** `npm run dev -w apps/extension` (Vite rebuild on save)

**Type-check:** `npm run check -w apps/extension` (svelte-check)

**Load the extension:** `chrome://extensions/` → Developer mode → Load unpacked → select `apps/extension/dist/`.

**Test changes:** The watcher rebuilds automatically. For service worker changes, click the reload icon in `chrome://extensions/`. For content script changes, also refresh the ImmoScout24 tab.

**Debug:** Service worker logs appear in `chrome://extensions/` → "Inspect views: service worker". Content script logs appear in the page's DevTools console (F12). Filter by `[IS24]` prefix.

### Server

**Start:** `npm run dev -w apps/server` (runs on port 3456)

**Type-check:** `npm run typecheck -w apps/server`

**Endpoints:** `/analyze` (listing scoring), `/captcha` (image → text), `/reply` (conversation draft), `/health`

### Documents (Mieterselbstauskunft PDF)

Generated entirely in the popup via pdf-lib (`apps/extension/src/popup/lib/documents.ts`); no server or Python involved. The blank template is bundled at `apps/extension/static/templates/Selbstauskunft____neutral.pdf` and text is drawn at fixed coordinates. User-uploaded attachments live in IndexedDB (`shared/idb-attachments.ts`) and are appended after the filled form.

## Architecture

### Extension

Three entry points communicate via `chrome.runtime.sendMessage`:

```
┌──────────────┐  messages  ┌───────────────┐  messages  ┌─────────────┐
│  popup/      │ ◄────────► │ background.ts │ ◄────────► │ content.ts  │
│  (Svelte 5)  │            │ (svc worker)  │            │ (page DOM)  │
└──────────────┘            └───────────────┘            └─────────────┘
       │                           │
       └──── both import ──────────┘
                  │
          ┌──────────────┐
          │  shared/     │  (constants.ts, utils.ts)
          └──────────────┘
```

- **shared/constants.ts** — All storage key constants, caps, alarm names. Always use these, never string literals.
- **shared/utils.ts** — `generatePersonalizedMessage()`, `capSeenListings()`.
- **background.ts** — Service worker. Owns the monitoring lifecycle: `chrome.alarms` for periodic checks, tab management, rate limiting (persisted across SW restarts), message orchestration, and conversation reply detection. Built as IIFE via Vite.
- **content.ts** — Injected into all `immobilienscout24.de` pages. Handles DOM interaction: extracting listings, landlord names, filling contact forms (React-compatible via prototype value setters), and filling conversation replies. Built as IIFE via Vite.
- **popup/** — Svelte 5 app. Settings CRUD against `chrome.storage.local`, stats polling, test-send, conversation/replies UI. Built as ES module via Vite.

### Build pipeline

Vite builds 3 outputs:
- `popup.html` + `popup.js` + `popup.css` — ES module (Svelte app)
- `background.js` — IIFE (service worker, no imports)
- `content.js` — IIFE (content script, no imports)
- `static/` contents (manifest.json, icons/) are copied to `dist/`

### Server

```
apps/server/src/
├── index.ts    ← Express app, endpoints
├── prompts.ts  ← AI prompt builders
└── types.ts    ← TypeScript interfaces
```

### Key patterns

- **Storage keys are centralized** in `apps/extension/src/shared/constants.ts` — always use the constants, never string literals.
- **Form filling** uses `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set` to work with React's synthetic state.
- **Rate limit state** is persisted to storage so it survives service worker termination.
- **Seen listings** are capped at 5,000 entries via `capSeenListings()`.
- **`waitForTabLoad()`** uses `chrome.tabs.onUpdated` with a race-condition guard.
- **Popup uses Svelte 5** with `$state()`, `$derived()`, `$effect()` for reactivity.

## Chrome APIs Used

`chrome.storage.local`, `chrome.alarms`, `chrome.tabs`, `chrome.runtime.onMessage`, `chrome.scripting`, `chrome.notifications`, `chrome.action`, `chrome.sidePanel`
