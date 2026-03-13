# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Monorepo with two projects:
1. **Chrome extension** (Manifest V3) — monitors ImmoScout24 search results and automatically sends personalized messages to landlords. Built with TypeScript + Svelte 5 (popup) + Vite.
2. **AI server** — local Express/TypeScript server that scores listings, solves captchas, and generates reply drafts using Gemini.

## Project Structure

```
extension/                ← Chrome extension source
├── src/
│   ├── background.ts     ← service worker entry point
│   ├── content.ts        ← content script entry point
│   ├── shared/
│   │   ├── constants.ts  ← storage keys, caps, alarm names
│   │   └── utils.ts      ← generatePersonalizedMessage, capSeenListings
│   ├── popup/
│   │   ├── main.ts       ← Svelte mount point
│   │   ├── App.svelte    ← header, tabs, toggle, stats
│   │   ├── lib/
│   │   │   ├── storage.ts    ← chrome.storage helpers
│   │   │   └── messages.ts   ← typed sendMessage wrappers
│   │   ├── tabs/             ← ActivityTab, ProfileTab, QueueTab, ConversationsTab, SettingsTab
│   │   └── components/       ← ConversationCard, CollapsibleSection, ActivityLogEntry
│   └── types/
├── static/               ← copied as-is to dist/ (manifest.json, icons/)
├── dist/                 ← build output (gitignored), load unpacked from here
├── popup.html            ← Vite HTML entry point
├── vite.config.ts
├── package.json
└── tsconfig.json
server/                   ← AI server (npm run dev)
```

## Development

### Both projects at once

**Start:** `npm run dev` at repo root — runs both extension watcher and server via concurrently.

### Extension

**Build:** `cd extension && npm run build`

**Watch mode:** `cd extension && npm run dev` (Vite rebuild on save)

**Type-check:** `cd extension && npm run check` (svelte-check)

**Load the extension:** `chrome://extensions/` → Developer mode → Load unpacked → select `extension/dist/`.

**Test changes:** The watcher rebuilds automatically. For service worker changes, click the reload icon in `chrome://extensions/`. For content script changes, also refresh the ImmoScout24 tab.

**Debug:** Service worker logs appear in `chrome://extensions/` → "Inspect views: service worker". Content script logs appear in the page's DevTools console (F12). Filter by `[IS24]` prefix.

### Server

**Start:** `cd server && npm run dev` (runs on port 3456)

**Type-check:** `cd server && npx tsc --noEmit`

**Endpoints:** `/analyze` (listing scoring), `/captcha` (image → text), `/reply` (conversation draft), `/health`

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
server/src/
├── index.ts    ← Express app, endpoints
├── prompts.ts  ← AI prompt builders
└── types.ts    ← TypeScript interfaces
```

### Key patterns

- **Storage keys are centralized** in `extension/src/shared/constants.ts` — always use the constants, never string literals.
- **Form filling** uses `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set` to work with React's synthetic state.
- **Rate limit state** is persisted to storage so it survives service worker termination.
- **Seen listings** are capped at 5,000 entries via `capSeenListings()`.
- **`waitForTabLoad()`** uses `chrome.tabs.onUpdated` with a race-condition guard.
- **Popup uses Svelte 5** with `$state()`, `$derived()`, `$effect()` for reactivity.

## Chrome APIs Used

`chrome.storage.local`, `chrome.alarms`, `chrome.tabs`, `chrome.runtime.onMessage`, `chrome.scripting`, `chrome.notifications`, `chrome.action`, `chrome.sidePanel`
