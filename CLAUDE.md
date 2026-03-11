# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Monorepo with two projects:
1. **Chrome extension** (Manifest V3) — monitors ImmoScout24 search results and automatically sends personalized messages to landlords. Vanilla JavaScript, no build tools.
2. **AI server** — local Express/TypeScript server that scores listings, solves captchas, and generates reply drafts using Gemini.

## Project Structure

```
extension/     ← Chrome extension (load unpacked from here)
server/        ← AI server (npm run dev)
```

## Development

### Extension

**Load the extension:** `chrome://extensions/` → Developer mode → Load unpacked → select the `extension/` folder.

**Validate syntax:** `node -c extension/<file>.js` (there are no tests, linter, or build step).

**Test changes:** Reload the extension in `chrome://extensions/` after editing. For service worker changes, click the reload icon. For content script changes, also refresh the ImmoScout24 tab.

**Debug:** Service worker logs appear in `chrome://extensions/` → "Inspect views: service worker". Content script logs appear in the page's DevTools console (F12). Filter by `[IS24]` prefix.

### Server

**Start:** `cd server && npm run dev` (runs on port 3456)

**Type-check:** `cd server && npx tsc --noEmit`

**Endpoints:** `/analyze` (listing scoring), `/captcha` (image → text), `/reply` (conversation draft), `/health`

## Architecture

### Extension

Four execution contexts communicate via `chrome.runtime.sendMessage`:

```
┌─────────────┐  messages   ┌──────────────┐  messages   ┌─────────────┐
│  popup.js   │ ◄────────► │ background.js │ ◄────────► │ content.js  │
│ (popup UI)  │            │ (svc worker)  │            │ (page DOM)  │
└─────────────┘            └──────────────┘            └─────────────┘
       │                          │
       └──── both import ─────────┘
                  │
            ┌───────────┐
            │ shared.js │  (constants, greeting logic, cap helper)
            └───────────┘
```

All files live in `extension/`.

- **shared.js** — Storage key constants, `generatePersonalizedMessage()`, `capSeenListings()`. Loaded via `importScripts()` in background.js and `<script>` in popup.html.
- **background.js** — Service worker. Owns the monitoring lifecycle: `chrome.alarms` for periodic checks, tab management, rate limiting (persisted across SW restarts), message orchestration, and conversation reply detection. Sends commands to content.js.
- **content.js** — Injected into all `immobilienscout24.de` pages. Handles DOM interaction: extracting listings, landlord names, filling contact forms (React-compatible via prototype value setters), and filling conversation replies.
- **popup.js** — Extension popup controller. Settings CRUD against `chrome.storage.local`, stats polling, test-send, conversation/replies UI.

### Server

```
server/src/
├── index.ts    ← Express app, endpoints
├── prompts.ts  ← AI prompt builders
└── types.ts    ← TypeScript interfaces
```

### Key patterns

- **Storage keys are centralized** in `extension/shared.js` — always use the constants, never string literals.
- **Form filling** uses `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set` to work with React's synthetic state.
- **Rate limit state** is persisted to storage so it survives service worker termination.
- **Seen listings** are capped at 5,000 entries via `capSeenListings()`.
- **`waitForTabLoad()`** uses `chrome.tabs.onUpdated` with a race-condition guard.

## Chrome APIs Used

`chrome.storage.local`, `chrome.alarms`, `chrome.tabs`, `chrome.runtime.onMessage`, `chrome.scripting`, `chrome.notifications`, `chrome.action`
