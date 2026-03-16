# Apartment Messenger — ImmoScout24 Edition

A Chrome extension that monitors ImmoScout24 search results and automatically sends personalized messages to landlords when new listings appear. Includes AI-powered listing scoring, captcha solving, conversation reply drafting, and a manual approval queue.

Built with TypeScript + Svelte 5 + Vite (extension) and Express + TypeScript (AI server).

## Project Structure

```
extension/     Chrome extension (Manifest V3, TypeScript + Svelte 5)
server/        AI server (Express + TypeScript)
```

## Installation

### From a Release (recommended)

1. Download `apartment-messenger-vX.Y.Z.zip` from the [latest release](https://github.com/ignaguri/immoscout-helper/releases/latest)
2. Unzip the file
3. Open `chrome://extensions/` in Chrome
4. Enable **Developer mode** (top-right toggle)
5. Click **Load unpacked** → select the unzipped folder
6. Open the extension side panel → **Settings** → paste your [Gemini API key](https://aistudio.google.com/app/apikey)

### From Source

```bash
git clone https://github.com/ignaguri/immoscout-helper
cd immoscout-helper
npm install
npm run build        # builds extension to extension/dist/
```

Then load unpacked from `extension/dist/`.

## Quick Start

1. Log into ImmoScout24
2. Navigate to your saved search and copy the URL
3. Open the extension side panel → **Activity** tab → paste the URL into **Search URLs**
4. Write your message template (use `{name}` for the landlord's name)
5. Fill in your personal details in the **Profile** tab
6. Configure your AI provider in **Settings** (Gemini or OpenAI API key)
7. Click **Start**

The extension will check for new listings on your schedule and contact landlords automatically.

## Features

### Automatic Monitoring

Periodically checks your search URL(s) for new listings. For each new listing:
- Opens the listing page in a background tab
- Optionally scores it against your profile with AI (skips low-quality matches)
- Detects the landlord's name and builds a personalized greeting
- Fills ImmoScout's contact form and sends the message

Multiple search URLs are supported — the extension cycles through them round-robin.

### Manual Queue

Capture all listings from a search page into a queue and process them on demand, without running the full monitoring loop. Useful for one-off batches.

### Pending Approval

Some listings require explicit confirmation before a message is sent:
- **Tenant-recommendation listings** ("Nachvermietung" with an "Interesse bekunden" button) — posted by the current tenant, not the landlord
- These appear in a **Needs Approval** section in the Activity tab
- Click **Approve** to send, or **Skip** to dismiss permanently

### AI Listing Scoring

Score listings against your profile before sending. Low-scoring listings are skipped automatically. Works in two modes:
- **Direct** — calls Gemini or OpenAI directly from the extension using your API key
- **Server** — routes requests through the local AI server (`http://localhost:3456`)

### Conversation Replies

Monitors your ImmoScout inbox for landlord replies:
- Shows unread conversations in the **Replies** tab with timestamps
- Generates AI draft replies using your profile context
- Handles appointment proposals — accept, decline, or counter-propose with one click

### Message Personalization

- `Frau [Name]` detected → `Sehr geehrte Frau [Name],`
- `Herr [Name]` detected → `Sehr geehrter Herr [Name],`
- Unknown → `Sehr geehrte Damen und Herren,`
- Use `{name}` anywhere in your template for inline name substitution

### Rate Limiting

- Configurable hourly message cap
- Minimum delay between messages (randomized for natural timing)
- Rate limit state persists across browser restarts

## Popup Tabs

| Tab | Purpose |
|-----|---------|
| **Activity** | Search URLs, queue management, pending approvals, real-time activity log |
| **Profile** | Personal details for contact form auto-fill and AI context |
| **Replies** | Conversations with landlords, AI draft replies, appointment handling |
| **Settings** | Check interval, send mode, AI provider, rate limits, data management |
| **Help** | Setup guide and tips |

## AI Server (optional)

The local server provides captcha solving and reply generation when using server mode.

```bash
cd server
npm install
cp .env.example .env   # add your Gemini API key
npm run dev             # starts on http://localhost:3456
```

Endpoints:
- `/analyze` — AI scoring of listings against your profile
- `/captcha` — Captcha image → text extraction
- `/reply` — AI-generated draft replies to landlord messages
- `/health` — Health check

## Development

```bash
npm install              # install all workspace dependencies
npm run dev              # watch mode: extension + server
npm run build            # production build
npm run typecheck        # TypeScript + Svelte type check
```

**Load unpacked:** `chrome://extensions/` → Load unpacked → `extension/dist/`

**Reload after changes:**
- Background (service worker): click the reload icon in `chrome://extensions/`
- Content script: also refresh the ImmoScout24 tab
- Popup: closes and reopens automatically

**Debug:**
- Service worker logs: `chrome://extensions/` → "Inspect views: service worker"
- Content script logs: page DevTools (F12), filter by `[IS24]`

## Architecture

```
┌──────────────┐  messages  ┌───────────────┐  messages  ┌─────────────┐
│  popup/      │ ◄────────► │ background/   │ ◄────────► │ content/    │
│  (Svelte 5)  │            │ (svc worker)  │            │ (page DOM)  │
└──────────────┘            └───────────────┘            └─────────────┘
                                    │ HTTP (optional)
                             ┌──────────────┐
                             │  AI Server   │
                             │  (Express)   │
                             └──────────────┘
```

- **`shared/`** — Constants, types, utilities shared across all entry points
- **`background/`** — Service worker: monitoring lifecycle, queue processing, rate limiting, conversation detection, pending approval storage
- **`content/`** — DOM interaction: listing extraction, form filling, listing type detection
- **`popup/`** — Svelte 5 side panel UI: settings, stats, queue, approvals, conversations

All extension data is stored locally in `chrome.storage.local`. Nothing leaves the device except outgoing messages to ImmoScout24 and optional AI API calls.

## Troubleshooting

**"Receiving end does not exist"** → Refresh the ImmoScout24 page and try again.

**Extension stops checking** → Toggle Stop/Start to restart the monitoring alarm.

**Messages not sending** → Make sure you're logged into ImmoScout24.

**Rate limit reached** → Wait for the hourly reset, or increase the limit in Settings.

**Listing shows "Needs Approval"** → It's a tenant-recommendation listing. Review it in the Activity tab and approve or skip manually.

## Disclaimer

For personal use. Please use responsibly and respect ImmoScout24's terms of service.

## License

MIT
